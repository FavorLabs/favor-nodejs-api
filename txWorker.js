const mongoDbQueue = require('mongodb-queue')
const DBConnection = require('./config/db')
const dotenv = require("dotenv");
const P = require("bluebird")
const HDWallet = require('ethereum-hdwallet')
const Web3 = require('web3-eth')
const Web3Utils = require('web3-utils');
const Contract = require('web3-eth-contract');
const EventEmitter = require('node:events');
const Tx = require("ethereumjs-tx").Transaction
const Common = require('ethereumjs-common');

const SubList = require('./models/SubList')
const User = require('./models/UserDetail')

dotenv.config({path: './config/.env'});

const TokenJsonInterface = require("./config/FavorToken.json");
const favorTubeAddress = process.env.CONTRACT;
const tokenAddress = process.env.TOKEN_CONTRACT;

const rpcURL = process.env.ENDPOINT;

const web3 = new Web3(rpcURL);

const common = Common.default.forCustomChain('mainnet', {
    name: 'polygon_test',
    networkId: 80001,
    chainId: 80001
}, 'petersburg');

const tokenContract = new Contract(TokenJsonInterface.abi, tokenAddress);

const maxGasPrice = Web3Utils.toWei("50", "gwei");

class Worker extends EventEmitter {
    constructor(account, queue) {
        super();
        this.account = account;
        this.queue = queue;
    }

    async init() {
        this.address = this.account.getAddress().toString('hex');
        this.privateKey = this.account.getPrivateKey().toString('hex');
        this.balance = await web3.getBalance(this.address);
        this.tokenBalance = await tokenContract.methods.balanceOf(this.address).call();
        this.minTokenBalance = '';
        this.minBalance = '';
        this.findList = true;
        this.queueMsg = null;
        this.nonce = await web3.getTransactionCount(this.address);
        this.subInfo = null;

        this.on('go', this.start)
        this.on('valid', this.validAccount)
        this.on('msg', this.getMsg)
        this.on('watch', this.watchTx)
        this.on('send', this.sendTx)
        this.on('ending', this.endingTx)
        this.on('return', this.returnMsg)


    }

    async start() {

        // this.sl = await SubList.findOne({state:{$ne:"Confirmed"},subAddress:this.address}).populate({ path: 'userId', select: 'address' }).populate({ path: 'channelId', select: 'address' })
        // let msg = await this.queue.getAsync()
        // if(!msg){
        //     setTimeout(()=>{
        //         // this.start()
        //         this.emit('go')
        //     },5000)
        //     return;
        // }
        // let {payload,ack} = msg
        // let sl = await SubList.findByIdAndUpdate(payload.id,{$set:{state:"Processing",workAddress:this.address}}).populate({ path: 'userId', select: 'address' }).populate({ path: 'channelId', select: 'address' })
        // let m = await this.queue.ackAsync(ack);
        // console.log(sl.toObject())
        // let hash = await this.sendTx(sl)
        // await SubList.findByIdAndUpdate(payload.id,{$set:{state:"Chain",tx:hash}}).populate({ path: 'userId', select: 'address' })
        // await this.watchTx(hash);
        this.emit('valid')

    }

    async validAccount() {
        // this.emit('valid')
        // this.emit('msg')
        if (this.balance > this.minBalance && this.tokenBalance > this.minTokenBalance) {
            this.emit('msg');
        } else {
            setTimeout(() => {
                this.emit('valid');
            }, 5000);
        }
    }

    async returnMsg() {
        // this.emit('valid')
        await this.queue.addAsync({id:this.subInfo._id});
        this.emit('valid');
    }

    async getMsg() {
        // this.emit('msg')
        // this.emit('send')
        // this.emit('watch')

        if(this.findList){
            this.subInfo = await SubList.findOne({
                state: {$nin: ["Confirmed","Error"]},
                subAddress: this.address
            }).populate({path: 'userId', select: 'address'}).populate({path: 'channelId', select: 'address'}) // getInterruptingTask;



            if (this.subInfo) {
                if (this.subInfo.status === 'Processing') {
                    this.emit('send');
                } else if (this.subInfo.status === 'Chain') {
                    this.emit('watch');
                }
                return;
            }
        }


        this.findList = false;

            this.queueMsg = await this.queue.getAsync();
            if (this.queueMsg) {
                let {payload, ack} = this.queueMsg;
                if (this.tokenBalance > this.queueMsg.price) {
                    await SubList.findByIdAndUpdate(payload.id, {
                        $set: {
                            state: "Processing",
                            workAddress: this.address
                        }
                    }).populate({path: 'userId', select: 'address'}).populate({path: 'channelId', select: 'address'}) // setStatusToProcessing;
                    await this.queue.ackAsync(ack);
                    this.emit('send');
                } else {
                    this.emit('return');
                }
            } else {
                setTimeout(() => {
                    this.emit('msg')
                }, 5000);
            }

    }

    async sendTx() {
        const _this = this;
        const gasPrice = await web3.getGasPrice();
        const zeroAddress = '0x' + '0'.repeat(40);
        const txData = {
            from: _this.address,
            to: tokenAddress,
            gasPrice: Web3Utils.toHex(gasPrice > maxGasPrice ? maxGasPrice : gasPrice),
            nonce: _this.nonce,
            data: tokenAddress.methods.transfer(
                favorTubeAddress,
                _this.subInfo.price,
                web3.abi.encodeParameters(
                    ['address', 'address', 'address'],
                    [_this.subInfo.channelId.address, _this.subInfo.userId.address, _this.subInfo.sharerId?.address || zeroAddress])
            ).encodeABI()
        }
        const tx = new Tx(txData, {common});
        tx.sign(_this.privateKey);
        const serializedTx = tx.serialize()
        const raw = '0x' + serializedTx.toString('hex')
        web3.sendSignedTransaction(raw, async (error, hash) => {
            if (error) {
                this.emit('send')
                // this.emit('error')
            } else {
                await SubList.findByIdAndUpdate( _this.subInfo._id, {$set:{state: 'Chain', tx: hash}})
                this.emit('watch', hash)
            }
        });
    }

    async watchTx(hash) {
        let lock = false;
        let timeout = null;
        let timer = null;
        timeout = setTimeout(() => {
            clearInterval(timer);
            this.emit("send")
        }, 1000 * 60 * 2);
        timer = setInterval(async () => {
            if (lock) return;
            lock = true;
            const receipt = await web3.getTransactionReceipt(hash);
            if (receipt) {
                clearInterval(timer);
                clearTimeout(timeout);
                this.emit('ending', receipt);
            }
            lock = false;
        }, 2000);
    }

    async updateAccount(state) {

    }

    async endingTx(receipt) {
        this.nonce++;
        this.balance -= receipt.gasUsed;
        this.tokenBalance -= this.subInfo.price;
        if (receipt.state) {
            await SubList.updateOne({_id: this.subInfo._id}, {state: 'Confirmed'})
        } else {
            await SubList.updateOne({_id: this.subInfo._id}, {state: 'Error', detail: ""});
        }
        await this.updateAccount(receipt.state);
        this.emit('valid');
    }
}

const main = async () => {

    const mnemonic = 'tag volcano eight thank tide danger coast health above argue embrace heavy'
    const hdwallet = HDWallet.fromMnemonic(mnemonic)

    let conn = await DBConnection();
    const queue = P.promisifyAll(mongoDbQueue(conn.connection, 'my-queue', {visibility: 0}))

    const wer = new Worker(hdwallet.derive(`m/44'/60'/0'/0/0`), queue);
    let sb = await SubList.create({
        userId: "632d418876b535c077c3d3f9",
        channelId: "63141e29e9fe03692e9b5816",
        price: 1,
        state: "Submitted"
    })
    await queue.addAsync({id: sb.id})
    await wer.init()
    wer.start()
    console.log(wer, queue)


    //  let msg = await queue.getAsync()
    // await queue.pingAsync(msg.ack);
    // msg = await queue.getAsync()
    //     .then(()=>{
    //     return queue.get()
    // }).then((msg)=>{
    //     return
    // }).then(()=>{
    //     return queue.get()
    // }).then((msg)=>{
    //     console.log(msg)
    // })


}

main();
