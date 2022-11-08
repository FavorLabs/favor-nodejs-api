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
const Account = require('./models/Account')

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
const minTokenBalance = Web3Utils.toBN('100');
const minBalance = Web3Utils.toWei('0.1', 'ether');

class Worker extends EventEmitter {
    constructor(account, queue) {
        super();
        this.account = account;
        this.queue = queue;
    }

    async init() {
        this.address = this.account.getAddress().toString('hex');
        this.privateKey = this.account.getPrivateKey().toString('hex');

        this.balance = Web3Utils.toBN(await web3.getBalance(this.address));
        this.tokenBalance = Web3Utils.toBN(await tokenContract.methods.balanceOf(this.address).call());
        this.nonce = await web3.getTransactionCount(this.address);

        this.subInfo = null;
        this.findList = true;
        this.watchCount = 0;

        this.on('go', this.start)
        this.on('valid', this.validAccount)
        this.on('msg', this.getMsg)
        this.on('watch', this.watchTx)
        this.on('send', this.sendTx)
        this.on('ending', this.endingTx)
        this.on('return', this.returnMsg)
    }

    async start() {
        this.emit('valid')
    }

    async validAccount() {
        this.subInfo = null;
        if (this.balance.gt(minBalance) && this.tokenBalance.gt(minTokenBalance)) {
            this.emit('msg');
        } else {
            setTimeout(() => {
                this.emit('valid');
            }, 5000);
        }
    }

    async returnMsg() {
        await this.queue.addAsync({id: this.subInfo._id});
        this.emit('valid');
    }

    async getMsg() {

        if (this.findList) {
            this.subInfo = await SubList.findOne({
                state: {$nin: ["Confirmed", "Error"]},
                subAddress: this.address
            }).populate({path: 'userId', select: 'address'})
                .populate({path: 'channelId', select: 'address'})
                .populate({path: 'sharerId', select: 'address'})

            if (this.subInfo) {
                if (this.subInfo.state === 'Processing') {
                    this.emit('send');
                } else if (this.subInfo.state === 'Chain') {
                    this.emit('watch');
                }
                return;
            }
        }

        this.findList = false;
        const queueMsg = await this.queue.getAsync();

        if (!queueMsg) {
            setTimeout(() => {
                this.emit('msg')
            }, 5000);
            return;
        }

        let {payload, ack} = queueMsg;
        this.subInfo = await SubList.findById(payload.id)
            .populate({path: 'userId', select: 'address'})
            .populate({path: 'channelId', select: 'address'})
            .populate({path: 'sharerId', select: 'address'})

        if (this.tokenBalance.lt(Web3Utils.toBN(this.subInfo.price))) {
            this.emit('valid');
            return;
        }

        await this.queue.ackAsync(ack);
        this.subInfo.state = "Processing";
        this.subInfo.workAddress = this.address;
        await this.subInfo.update();
        this.emit('send');
    }

    async sendTx() {
        const gasPrice = await web3.getGasPrice();
        const zeroAddress = '0x' + '0'.repeat(40);
        const txData = {
            from: this.address,
            to: tokenAddress,
            gasPrice: Web3Utils.toHex(gasPrice > maxGasPrice ? maxGasPrice : gasPrice),
            nonce: this.nonce,
            data: tokenAddress.methods.transfer(
                favorTubeAddress,
                this.subInfo.price,
                web3.abi.encodeParameters(
                    ['address', 'address', 'address'],
                    [this.subInfo.channelId.address, this.subInfo.userId.address, this.subInfo.sharerId?.address || zeroAddress])
            ).encodeABI()
        }
        const tx = new Tx(txData, {common});
        tx.sign(this.privateKey);
        const serializedTx = tx.serialize()
        const raw = '0x' + serializedTx.toString('hex')
        web3.sendSignedTransaction(raw, async (error, hash) => {
            if (error) {
                this.emit('send')
                // this.emit('error')
                return;
            }
            this.subInfo.state = "Chain";
            this.subInfo.tx = hash;
            await this.subInfo.update();
            this.emit('watch');
        });
    }

    async watchTx(isAdd = false) {
        const receipt = await web3.getTransactionReceipt(this.subInfo.tx);
        if (receipt) {
            this.emit('ending', receipt);
            return;
        }
        this.watchCount = isAdd ? ++this.watchCount : 1;
        if (this.watchCount >= 30) {
            this.emit("send");
            return;
        }
        setTimeout(() => {
            this.emit('watch', true);
        }, 2000)
    }

    async updateAccount({userId, type, price}) {
        let account = await Account.findOneAndUpdate({userId: userId, lock: false}, {$set: {lock: true}});

        while (!account) {
            await new Promise(s => setTimeout(s, 1000));
            account = await Account.findOneAndUpdate({userId: userId, lock: false}, {$set: {lock: true}});
        }
        if (type == 0) {
            account.processing = Web3Utils.toBN(account.processing).sub(Web3Utils.toBN(price)).toString()
        }
        if (type == 1) {
            account.amount = Web3Utils.toBN(account.processing).sub(Web3Utils.toBN(price)).toString()
            account.processing = Web3Utils.toBN(account.processing).sub(Web3Utils.toBN(price)).toString()
        }
        account.lock = false
        await account.update();
    }

    async endingTx(receipt) {
        this.nonce++;
        this.balance = this.balance.sub(Web3Utils.toBN(receipt.gasUsed));
        if (receipt.state) {
            this.subInfo.state = 'Confirmed';
            this.tokenBalance = this.tokenBalance.sub(Web3Utils.toBN(this.subInfo.price));
        } else {
            this.subInfo.state = 'Error';
            this.subInfo.detail = "";
        }
        await this.subInfo.update();
        await this.updateAccount({userId: this.subInfo.userId, price: this.subInfo.price, type: receipt.state ? 1 : 0});
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
