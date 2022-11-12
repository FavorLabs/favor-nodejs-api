const mongoDbQueue = require('mongodb-queue')
const DBConnection = require('./config/db')
const dotenv = require("dotenv");
const P = require("bluebird")
const HDWallet = require('ethereum-hdwallet')
const Web3Utils = require('web3-utils');
require('./models/UserDetail');

const EventEmitter = require('node:events');
const Tx = require("ethereumjs-tx").Transaction
const Common = require('ethereumjs-common');

const SubList = require('./models/SubList')
const Account = require('./models/Account')

dotenv.config({path: './config/.env'});

const {address: favorTubeAddress, tokenAddress, tokenContract, eth: web3} = require("./config/contract")

const common = Common.default.forCustomChain('mainnet', {
    name: "test",
    networkId: Number(process.env.NETWORK_ID),
    chainId: Number(process.env.CHAIN_ID)
}, 'petersburg');

const maxGasPrice = Web3Utils.toWei("50", "gwei");
const minTokenBalance = Web3Utils.toBN('100');
const minBalance = Web3Utils.toWei('0.1', 'ether');

class Worker extends EventEmitter {
    constructor(account, queue) {
        super();
        this.account = account;
        this.queue = queue;
    }

    async init(debug = false) {
        this.address = "0x" + this.account.getAddress().toString('hex');
        this.privateKey = this.account.getPrivateKey()

        this.balance = Web3Utils.toBN(await web3.getBalance(this.address));
        this.tokenBalance = Web3Utils.toBN(await tokenContract.methods.balanceOf(this.address).call());

        this.nonce = await web3.getTransactionCount(this.address);

        this.subInfo = null;
        this.findList = true;
        this.watchCount = 0;

        if (!debug) {
            this.on('go', this.start)
            this.on('valid', this.validAccount)
            this.on('msg', this.getMsg)
            this.on('watch', this.watchTx)
            this.on('send', this.sendTx)
            this.on('ending', this.endingTx)
            this.on('return', this.returnMsg)
        }
    }

    start() {
        console.log("start");
        this.emit('valid')
    }

    async validAccount() {
        console.log("valid")
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
        console.log('msg')
        if (this.findList) {
            this.subInfo = await SubList.findOne({
                state: {$nin: ["Confirmed", "Error"]},
                workAddress: this.address
            }).populate({path: 'userId', select: 'address'})
                .populate({path: 'channelId', select: 'address'})
                .populate({path: 'sharerId', select: 'address'})

            console.log('INTTask', this.subInfo);
            if (this.subInfo) {
                if (this.subInfo.state === 'Processing') {
                    this.emit('send');
                    console.log('emit: send');
                } else if (this.subInfo.state === 'Chain') {
                    this.emit('watch');
                    console.log('emit: watch');
                }
                return;
            }
        }

        this.findList = false;
        const queueMsg = await this.queue.getAsync();
        console.log("queueMsg", queueMsg);

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
        console.log('subInfo', this.subInfo);

        console.log('tokenBalance', this.tokenBalance, "price", Web3Utils.toBN(this.subInfo.price));
        if (this.tokenBalance.lt(Web3Utils.toBN(this.subInfo.price))) {
            this.emit('valid');
            return;
        }

        await this.queue.ackAsync(ack);
        this.subInfo.state = "Processing";
        this.subInfo.workAddress = this.address;
        await this.subInfo.save();
        this.emit('send');
        console.log('emit: send');
    }

    async sendTx() {
        console.log("send");
        const gasPrice = await web3.getGasPrice();
        const zeroAddress = '0x' + '0'.repeat(40);
        const txData = {
            from: this.address,
            to: tokenAddress,
            gasPrice: Web3Utils.toHex(gasPrice > maxGasPrice ? maxGasPrice : gasPrice),
            gasLimit: Web3Utils.toHex(1000000),
            nonce: this.nonce,
            data: tokenContract.methods.transfer(
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
            console.log("tx", hash);
            this.subInfo.state = "Chain";
            this.subInfo.tx = hash;
            await this.subInfo.save();
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
        await account.save();
    }

    async endingTx(receipt) {
        console.log('receipt', receipt);
        this.nonce++;
        this.balance = this.balance.sub(Web3Utils.toBN(receipt.gasUsed * receipt.effectiveGasPrice));
        if (receipt.status) {
            console.log('receipt Confirmed');
            this.subInfo.state = 'Confirmed';
            console.log('subInfo: ', this.subInfo);
            console.log('sub before tokenBalance: ', this.tokenBalance);
            this.tokenBalance = this.tokenBalance.sub(Web3Utils.toBN(this.subInfo.price));
            console.log('sub after tokenBalance: ', this.tokenBalance);
        } else {
            console.log('receipt Error');
            this.subInfo.state = 'Error';
            this.subInfo.detail = "";
            console.log('subInfo: ', this.subInfo);
        }
        await this.subInfo.save();
        await this.updateAccount({
            userId: this.subInfo.userId,
            price: this.subInfo.price,
            type: receipt.status ? 1 : 0
        });
        this.emit('valid');
    }
}

const main = async () => {

    const mnemonic = process.env.MNEMONIC
    const hdwallet = HDWallet.fromMnemonic(mnemonic)

    let conn = await DBConnection();
    const queue = P.promisifyAll(mongoDbQueue(conn.connection, 'subQueue', {visibility: 0}))

    const worker = new Worker(hdwallet.derive(`m/44'/60'/0'/0/0`), queue);
    await worker.init();
    worker.start();
}

main();

module.exports = Worker;
