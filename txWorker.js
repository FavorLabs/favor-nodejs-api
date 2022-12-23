const mongoDbQueue = require('mongodb-queue')
const DBConnection = require('./config/db')
const dotenv = require("dotenv");
const colors = require('colors')
const P = require("bluebird")
const HDWallet = require('ethereum-hdwallet')
const Web3Utils = require('web3-utils');
require('./models/User');
require('./models/Subscription');

const EventEmitter = require('node:events');
const Tx = require("ethereumjs-tx").Transaction
const Common = require('ethereumjs-common');

const SubList = require('./models/SubList')

dotenv.config({path: './config/.env'});

const {address: favorTubeAddress, tokenAddress, tokenContract, eth: web3} = require("./config/contract")
const {updateAccount} = require("./utils/accountUtil");

const common = Common.default.forCustomChain('mainnet', {
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

    async endingTx(receipt) {
        console.log('receipt', receipt);
        this.nonce++;
        this.balance = this.balance.sub(Web3Utils.toBN(receipt.gasUsed * receipt.effectiveGasPrice));
        if (receipt.status) {
            console.log('receipt Confirmed');
            this.subInfo.state = 'Confirmed';
            this.subInfo.height = receipt.blockNumber;
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
        await updateAccount({
            userId: this.subInfo.userId,
            price: this.subInfo.price,
            type: receipt.status ? 1 : 0
        });
        this.emit('valid');
    }
}

class ExWorker extends EventEmitter {
    constructor(workerId, queue) {
        super();
        this.workerId = workerId;
        this.queue = queue;
    }

    init(debug = false) {
        console.log('exWorker init'.blue.bold);
        this.subInfo = null;
        this.findList = true;

        if (!debug) {
            this.on('msg', this.getMsg);
            this.on('watch', this.watch);
            this.on('end', this.ending);
        }
    }

    start() {
        console.log('exWorker start'.blue.bold);
        this.emit('msg');
    }

    async findSubInfo(id) {
        console.log('exWorker findSubInfo'.blue.bold);
        this.subInfo = await SubList.findById(id)
            .populate({path: 'userId', select: 'address'})
            .populate({path: 'channelId', select: 'address'})
            .populate({path: 'sharerId', select: 'address'})
    }

    async getMsg() {
        console.log('exWorker getMsg'.blue.bold);
        if (this.findList) {
            console.log('exWorker query IntTASK'.blue.bold);
            this.subInfo = await SubList.findOne({
                state: 'Chain',
                external: this.workerId
            }).populate({path: 'userId', select: 'address'})
                .populate({path: 'channelId', select: 'address'})
                .populate({path: 'sharerId', select: 'address'})

            if (this.subInfo) {
                console.log('exWorker have IntTASK'.blue.bold);
                this.emit('watch');
                return;
            }
        }

        this.findList = false;
        const queueMsg = await this.queue.getAsync();
        console.log(`exWorker get a queue message ${queueMsg}`.blue.bold);

        if (!queueMsg) {
            setTimeout(() => {
                this.emit('msg');
            }, 5000);
            return;
        }

        let {payload, ack} = queueMsg;
        await this.findSubInfo(payload.id);
        await this.queue.ackAsync(ack);
        this.subInfo.external = this.workerId;
        await this.subInfo.save();
        this.emit('watch', payload.id);
    }

    async watch(id) {
        console.log('exWorker watch'.blue.bold);
        if (id) {
            await this.findSubInfo(id);
        }

        const receipt = await web3.getTransactionReceipt(this.subInfo.tx);
        console.log(`exWorker watch receipt ${receipt}`.blue.bold);
        if (receipt) {
            this.emit('end', receipt);
            return;
        }

        setTimeout(() => {
            this.emit('watch', id);
        }, 1000);
    }

    async ending(receipt) {
        console.log(`exWorker ending receipt ${receipt}`.blue.bold);
        if (receipt.status) {
            this.subInfo.state = 'Confirmed';
            this.subInfo.height = receipt.blockNumber;
        } else {
            this.subInfo.state = 'Error';
        }
        await this.subInfo.save();
        this.emit('msg');
    }

}

const runTxWorker = async (conn) => {
    const mnemonic = process.env.MNEMONIC
    const hdwallet = HDWallet.fromMnemonic(mnemonic)
    const queue = P.promisifyAll(mongoDbQueue(conn.connection, 'subQueue', {visibility: 0}))
    const worker = new Worker(hdwallet.derive(`m/44'/60'/0'/0/0`), queue);
    await worker.init();
    worker.start();
}

const runExWorker = (conn) => {
    const queue = P.promisifyAll(mongoDbQueue(conn.connection, 'exQueue', {visibility: 0}));
    const worker = new ExWorker(1, queue);
    worker.init();
    worker.start();
}

const main = async () => {

    let conn = await DBConnection();
    runTxWorker(conn);
    runExWorker(conn);
}

main();

module.exports = {
    Worker,
    ExWorker,
};
