const mongoDbQueue = require('mongodb-queue')
const DBConnection = require('./config/db')
const dotenv = require("dotenv");
const P = require("bluebird")
const HDWallet = require('ethereum-hdwallet')
const Web3 = require('web3-eth')
const Contract = require('web3-eth-contract');
const EventEmitter = require('node:events');

const SubList = require('./models/SubList')
const User = require('./models/UserDetail')


dotenv.config({ path: './config/.env' })

const rpcURL = "https://polygon-mainnet.public.blastapi.io";

const web3 = new Web3(rpcURL);


const tokenContract = new this.web3.eth.Contract(tokenAbi, this.token.address);

class Worker extends EventEmitter{
    constructor(account,queue) {
        super();
        this.account = account;
        this.queue = queue;
    }
    async init(){
        this.address = this.account.getAddress().toString('hex');
        this.balance = await web3.getBalance(this.address);
        this.nonce = await web3.getTransactionCount(this.address);

        this.on('go',this.goWork)
        this.on('valid',this.validAccount)
        this.on('msg',this.getMsg)
        this.on('watch',this.watchTx)
        this.on('send',this.sendTx)
        this.on('ending',this.endingTx)
        this.on('return',this.returnMsg)

    }

    async start(){

        // this.sl = await SubList.findOne({state:{$ne:"Confirmed"},subAddress:this.address}).populate({ path: 'userId', select: 'address' }).populate({ path: 'channelId', select: 'address' })
        // let msg = await this.queue.getAsync()
        // if(!msg){
        //     setTimeout(()=>{
        //         // this.goWork()
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

    async validAccount(){
        this.emit('valid')
        this.emit('msg')
    }

    async returnMsg(){
        this.emit('valid')
    }

    async getMsg(){
        this.emit('msg')
        this.emit('send')
    }

    async sendTx(detail){
        this.emit('send')
        this.emit('watch')
        this.emit('error')
    }
    async watchTx(hash){
        this.emit('watch')
        this.emit('ending')
    }
    async endingTx(){
        this.emit('valid')
    }
}

const main = async ()=>{

    const mnemonic = 'tag volcano eight thank tide danger coast health above argue embrace heavy'
    const hdwallet = HDWallet.fromMnemonic(mnemonic)

    let conn = await DBConnection();
    const queue = P.promisifyAll(mongoDbQueue(conn.connection, 'my-queue',{visibility:0}))

    const wer = new Worker(hdwallet.derive(`m/44'/60'/0'/0/0`),queue);
    let sb = await SubList.create({userId:"632d418876b535c077c3d3f9",channelId:"63141e29e9fe03692e9b5816",price:1,state:"Submitted"})
    await queue.addAsync({id:sb.id})
    await wer.init()

    wer.goWork()
    console.log(wer,queue)


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
