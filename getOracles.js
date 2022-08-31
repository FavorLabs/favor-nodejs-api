const events = require("events");
const P = require('bluebird')
const colors = require('colors')
const Web3 = require('web3-eth')
const dotenv = require('dotenv')

dotenv.config({ path: './config/.env' })
const Config = require('./models/Config')
const Video = require('./models/Video')


const jsonInterface = require('./config/Oracle.json')

const address = process.env.ORACLE

class processor extends events{
    constructor(number) {
        super();
        this.stage = 50
        this.number = number;
        this.eth = new Web3(process.env.ENDPOINT)
        this.contract = new this.eth.Contract(jsonInterface.abi, address);
        this.on('start',this.start)
    }

    async start(){
        try{
            let bulk = [];
            let db = await this.eth.getBlock(this.eth.defaultBlock);
            let dbNumber = db.number -1;
            if(dbNumber<this.number){
                throw new Error("get dbNumber error");
            }
            let toBlock = this.number+this.stage-1;
            if(dbNumber < toBlock){
                toBlock = dbNumber;
            }

            let setEvents = await this.contract.getPastEvents('$set', {
                filter: {}, // Using an array means OR: e.g. 20 or 23
                fromBlock: this.number,
                toBlock: toBlock
            });
            console.log(`get set ${setEvents.length} trans from ${this.number} to ${toBlock} block ok `.green)

            await P.map(setEvents,async ({transactionHash,returnValues})=>{
                bulk.push({ updateMany :
                        {
                            "filter": {url : returnValues.hash.match(/^0x(\S{64})/)[1] } ,
                            "update":{$push:
                                    {
                                        oracle: returnValues.addr
                                    }
                            }

                        }
                })
            });

            let removeEvents = await this.contract.getPastEvents('$remove', {
                filter: {}, // Using an array means OR: e.g. 20 or 23
                fromBlock: this.number,
                toBlock: toBlock
            });
            console.log(`get remove ${removeEvents.length} trans from ${this.number} to ${toBlock} block ok `.green)

            await P.map(removeEvents,async ({transactionHash,returnValues})=>{
                bulk.push({ updateMany :
                        {
                            "filter": {url : returnValues.hash.match(/^0x(\S{64})/)[1] },
                            "update":
                                {
                                    oracle: {$pull:returnValues.addr}
                                }
                        }
                })
            });

            let clearEvents = await this.contract.getPastEvents('$clear', {
                filter: {}, // Using an array means OR: e.g. 20 or 23
                fromBlock: this.number,
                toBlock: toBlock
            });
            console.log(`get clear ${clearEvents.length} trans from ${this.number} to ${toBlock} block ok `.green)

            await P.map(clearEvents,async ({transactionHash,returnValues})=>{
                bulk.push({ updateOne :
                        {
                            "filter": {url : returnValues.hash.match(/^0x(\S{64})/)[1] },
                            "update":{$set:
                                {
                                    oracle: []
                                }
                            }
                        }
                })
            });


            if(bulk.length >0){
                await Video.bulkWrite(bulk);
            }

            console.log(`block ${toBlock} ok`.green)
            await Config.findOneAndUpdate({key:"Oracle"},{value:toBlock+1},{upsert:true})
            this.number = toBlock+1;

            setTimeout(()=>{
                this.emit('start')
            },this.number >= dbNumber?2000:5)
        }
        catch (e){
            console.error(`some error: ${e}`.red);
            this.emit('start');
        }
    }

}

let main = async ()=>{

    await require('./config/db')()

    let last = await Config.findOne({key:"Oracle"})

    let number = last && last.value || parseInt(process.env.ONUMBER)  ;//30964776

    let pro = new processor(number);

    pro.emit('start');

}
main()
