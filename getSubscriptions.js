const events = require("events");
const P = require('bluebird')
const colors = require('colors')
const Web3 = require('web3-eth')
const dotenv = require('dotenv')

dotenv.config({ path: './config/.env' })
const Config = require('./models/Config')
const Subscription = require('./models/Subscription')
const User = require('./models/User')

const jsonInterface = require('./config/FavorTube.json')

const address = "0x4DDBFFE095e1b7f5B92C50d5Da78Efd2546Df298"

class process extends events{
    constructor(number) {
        super();
        this.stage = 50
        this.number = number;
        this.eth = new Web3('https://polygon-testnet.blastapi.io/18d7884b-202d-467d-8221-25eba9c8eca1')
        this.contract = new this.eth.Contract(jsonInterface.abi, address);
        this.on('start',this.start)
    }

    async start(){
        try{

            let db = await this.eth.getBlock(this.eth.defaultBlock);
            let dbNumber = db.number -1;
            if(dbNumber<this.number){
                throw new Error("get dbNumber error");
            }
            let toBlock = this.number+this.stage-1;
            if(dbNumber < toBlock){
                toBlock = dbNumber;
            }

            let events = await this.contract.getPastEvents('$subscribe', {
                filter: {}, // Using an array means OR: e.g. 20 or 23
                fromBlock: this.number,
                toBlock: toBlock
            });
            console.log(`get ${events.length} trans from ${this.number} to ${toBlock} block ok `.green)

            let bulk = [];

            await P.map(events,async ({transactionHash,returnValues})=>{
                let owner =  await  User.findOne({address:returnValues.owner.toLowerCase()});
                let licensee = await  User.findOne({address:returnValues.licensee.toLowerCase()});
                if(owner && licensee){
                    bulk.push({ updateOne :
                            {
                                "filter": {subscriberId : licensee.id,channelId:owner.id},
                                "update":
                                    {
                                        tx: transactionHash,
                                        expire:returnValues.expire
                                    },
                                "upsert": true
                            }
                    })
                }
            });

            if(bulk.length >0){
                await Subscription.bulkWrite(bulk);
            }

            console.log(`block ${toBlock} ok`.green)
            await Config.findOneAndUpdate({key:"Authorization"},{value:toBlock+1},{upsert:true})
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

    let last = await Config.findOne({key:"Authorization"})

    let number = last && last.value || 26781754  ;

    let pro = new process(number);

    pro.emit('start');

}
main()
