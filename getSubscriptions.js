const events = require("events");
const P = require('bluebird')
const colors = require('colors')
const dotenv = require('dotenv')

dotenv.config({path: './config/.env'})
const Config = require('./models/Config')
const Subscription = require('./models/Subscription')
const User = require('./models/User')
const SubContract = require('./models/SubContract')
const SubList = require('./models/SubList')

const {eth, contract} = require("./config/contract")

const before = Number(process.env.BEFORE || 1)

class processor extends events {
    constructor(number) {
        super();
        this.stage = 50
        this.number = number;
        this.eth = eth;
        this.contract = contract;
        this.on('start', this.start)
    }

    async start() {
        try {

            let db = await this.eth.getBlockNumber();
            let dbNumber = db - before;
            if (dbNumber < this.number) {
                throw new Error("get dbNumber error");
            }
            let toBlock = this.number + this.stage - 1;
            if (dbNumber < toBlock) {
                toBlock = dbNumber;
            }

            let setEvents = await this.contract.getPastEvents('$setUserConfig', {
                filter: {}, // Using an array means OR: e.g. 20 or 23
                fromBlock: this.number,
                toBlock: toBlock
            });
            console.log(`get set ${setEvents.length} trans from ${this.number} to ${toBlock} block ok `.green)

            let setBulk = [];

            await P.map(setEvents, async ({transactionHash, returnValues}) => {
                setBulk.push({
                    updateOne:
                        {
                            "filter": {address: returnValues.channel.toLowerCase()},
                            "update": {
                                $set: {
                                    mode: returnValues.mode,
                                    price: returnValues.price,
                                    tx: transactionHash
                                }
                            },
                            "upsert": false
                        }
                })
            });

            if (setBulk.length > 0) {
                await User.bulkWrite(setBulk);
            }

            let subInfoEvents = await this.contract.getPastEvents('$subInfo', {
                filter: {}, // Using an array means OR: e.g. 20 or 23
                fromBlock: this.number,
                toBlock: toBlock
            });
            console.log(`get subInfo ${subInfoEvents.length} trans from ${this.number} to ${toBlock} block ok `.green)

            let subInfoBulk = [];
            let subBulk = [];
            let subListBulk = [];

            await P.map(subInfoEvents, async ({transactionHash, blockNumber, returnValues}) => {
                let channel = await User.findOne({address: returnValues.subInfo[0].account.toLowerCase()});
                let user = await User.findOne({address: returnValues.subInfo[1].account.toLowerCase()});
                if (!channel || !user) {
                    return;
                }
                subBulk.push({
                    updateOne:
                        {
                            "filter": {subscriberId: user.id, channelId: channel.id},
                            "update":
                                {
                                    tx: transactionHash,
                                    expire: returnValues.expire
                                },
                            "upsert": true
                        }
                });
                subInfoBulk.push({
                    updateOne:
                        {
                            "filter": {tx: transactionHash},
                            "update": {
                                $set: {
                                    tx: transactionHash,
                                    height: blockNumber,
                                    expire: returnValues.expire,
                                    pay: returnValues.value,
                                    sender: returnValues.sender,
                                    detail: {
                                        channel: returnValues.subInfo[0],
                                        user: returnValues.subInfo[1],
                                        sharer: returnValues.subInfo[2],
                                    },
                                }
                            },
                            "upsert": true
                        }
                });
                subListBulk.push({
                    updateOne:
                        {
                            "filter": {tx: transactionHash},
                            "update": {
                                $set: {
                                    height: blockNumber,
                                    expire: returnValues.expire,
                                    state: "Confirmed",
                                    workAddress: returnValues.sender
                                }
                            }
                        }
                });
            })

            subBulk.push({
                updateMany:
                    {
                        "filter": {expire: {$lt: toBlock}, tx: {$ne: ""}},
                        "update":
                            {
                                $set: {
                                    tx: "",
                                }
                            },
                        "upsert": false
                    }
            });

            if (subBulk.length > 0) {
                await Subscription.bulkWrite(subBulk);
            }

            if (subListBulk.length > 0) {
                await SubList.bulkWrite(subListBulk);
            }

            if (subInfoBulk.length > 0) {
                await SubContract.bulkWrite(subInfoBulk);
            }

            console.log(`block ${toBlock} ok`.green)

            await Config.findOneAndUpdate({key: "Authorization"}, {value: toBlock + 1}, {upsert: true})
            this.number = toBlock + 1;

            setTimeout(() => {
                this.emit('start')
            }, this.number >= dbNumber ? 2000 : 5)
        } catch (e) {
            console.error(`some error: ${e}`.red);
            setTimeout(() => {
                this.emit('start')
            }, 500)
        }
    }

}

let main = async () => {

    await require('./config/db')()

    let last = await Config.findOne({key: "Authorization"})

    let number = last && last.value || parseInt(process.env.NUMBER);

    if (!number) {
        console.error("config number error!!!");
        process.exit(0);
    }

    let pro = new processor(number);

    pro.emit('start');

}
main()
