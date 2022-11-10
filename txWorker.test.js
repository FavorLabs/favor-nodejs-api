const Worker = require('./txWorker');
const DBConnection = require('./config/db');
const HDWallet = require('ethereum-hdwallet');
const SubList = require('./models/SubList');
const UserDetail = require('./models/UserDetail');
const P = require("bluebird");
const mongoDbQueue = require("mongodb-queue");
const mongoose = require('mongoose');
const Web3 = require("web3-eth");
const rpcURL = process.env.ENDPOINT;
const web3 = new Web3(rpcURL);


describe('getMsg', () => {
    let conn = null;
    let worker = null;
    let queue = null;

    beforeAll(async () => {
        conn = await DBConnection();
        const mnemonic = 'tag volcano eight thank tide danger coast health above argue embrace heavy'
        const hdwallet = HDWallet.fromMnemonic(mnemonic);
        queue = P.promisifyAll(mongoDbQueue(conn.connection, 'my-queue', {visibility: 0}))
        worker = new Worker(hdwallet.derive(`m/44'/60'/0'/0/0`), queue);
        await worker.init('debug');
        console.log('getMsg beforeAll: init state');
    })

    afterAll(async () => {
    });

    it('Processing INTTask to send state', async () => {
        await SubList.deleteMany({});
        let info = await SubList.create({
            userId:  mongoose.Types.ObjectId(),
            channelId: mongoose.Types.ObjectId(),
            price: 100,
            state: "Processing",
            workAddress: worker.address
        });

        worker.on("send", async () => {
            await info.remove()
            expect(worker.subInfo.state).toBe("Processing");
        })

        // setTimeout(async ()=>{
        //     await info.remove()
        //     expect(worker.subInfo.state).toBe("Processing");
        // },5000)

        await worker.getMsg();
    })

    it('Chain INTTask to watch state', async () => {
        await SubList.deleteMany({});
        let info = await SubList.create({
            userId: mongoose.Types.ObjectId(),
            channelId: mongoose.Types.ObjectId(),
            price: 100,
            state: "Chain",
            workAddress: worker.address
        });

        worker.on("watch", async() => {
            await info.remove()
            expect(worker.subInfo.state).toBe("Chain");
        })

        // setTimeout(async ()=>{
        //     await info.remove()
        //     expect(worker.subInfo.state).toBe("Chain");
        // },5000)

        await worker.getMsg();
    })

    it('INTTask to watch state, have a queue message', async () => {
        await SubList.deleteMany({});
        let info = await SubList.create({
            userId: mongoose.Types.ObjectId(),
            channelId: mongoose.Types.ObjectId(),
            price: 100,
            state: "Chain",
            workAddress: worker.address
        });
        // await queue.cleanAsync();
        await queue.addAsync({id:info.id})

        worker.on("watch", async() => {
            await info.remove()
            console.log('watch-------')
            expect(worker.subInfo.state).toBe("Chain");
        })
        worker.on("valid", async() => {
            await info.remove()
            console.log('valid-------')
            // expect(worker.subInfo.state).toBe("Chain");
        })
        worker.on("send", async() => {
            await info.remove()
            console.log('send-------')
            // expect(worker.subInfo.state).toBe("Chain");
        })

        await worker.getMsg();
    })

    it('Didn\'t get the queue messages', async () => {
        // await queue.cleanAsync();

        worker.on("msg", async () => {
            expect('');
        })

        setTimeout(async ()=>{
            expect('');
        },5000)

        await worker.getMsg();
    })

    it('get the queue messages, but the price is not met', async () => {
        worker.findList = false;
        await SubList.deleteMany({});
        let info = await SubList.create({
            userId: mongoose.Types.ObjectId(),
            channelId: mongoose.Types.ObjectId(),
            price: 100,
            state: "Submitted",
            workAddress: worker.address
        });
        // await queue.cleanAsync();
        await queue.addAsync({id:info.id})

        worker.on("valid", async () => {
            console.log('valid------');
        })
        worker.on("send", async () => {
            console.log('send------')
        })

        // setTimeout(async ()=>{
        //     expect('');
        // },5000)

        await worker.getMsg();
    })

    it('get the queue messages, but the price is met', async () => {
        worker.findList = false;
        await SubList.deleteMany({});
        let info = await SubList.create({
            userId: mongoose.Types.ObjectId(),
            channelId: mongoose.Types.ObjectId(),
            price: 10000000,
            state: "Submitted",
            workAddress: worker.address
        });
        // await queue.cleanAsync();
        await queue.addAsync({id:info.id})

        worker.on("valid", async () => {
            console.log('valid------');
        })
        worker.on("send", async () => {
            console.log('send------')
        })

        // setTimeout(async ()=>{
        //     expect('');
        // },5000)

        await worker.getMsg();
    })

})


describe('endingTx', () => {
    let conn = null;
    let worker = null;
    let queue = null;

    beforeAll(async () => {
        conn = await DBConnection();
        const mnemonic = 'tag volcano eight thank tide danger coast health above argue embrace heavy'
        const hdwallet = HDWallet.fromMnemonic(mnemonic);
        queue = P.promisifyAll(mongoDbQueue(conn.connection, 'my-queue', {visibility: 0}))
        worker = new Worker(hdwallet.derive(`m/44'/60'/0'/0/0`), queue);
        await worker.init('debug');
        console.log('endingTx beforeAll: init state');
    })

    afterAll(async () => {

    });

    it('error receipt', async () => {
        await SubList.deleteMany({});
        let info = await SubList.create({
            userId: mongoose.Types.ObjectId(),
            channelId: mongoose.Types.ObjectId(),
            price: 100,
            state: "Submitted",
            workAddress: worker.address
        });
        worker.subInfo = info;
        let receipt = await web3.getTransactionReceipt('0x025ec346c4c2ace5ac1fb3b7650aa53a02037dc720c2c9ef8162ad032823a83c');

        worker.on('valid', () => {
            console.log('valid-----');
            expect(worker.subInfo.state).toBe('Error');
        })

        await worker.endingTx(receipt);
    })

    it('normal receipt', async () => {
        await SubList.deleteMany({});
        let info = await SubList.create({
            userId: mongoose.Types.ObjectId(),
            channelId: mongoose.Types.ObjectId(),
            price: 100,
            state: "Submitted",
            workAddress: worker.address
        });
        worker.subInfo = info;
        let receipt = await web3.getTransactionReceipt('0x160bde4973a34e99de4a5d2b820ef181a4f452d66d20546876c69bfe6186d2bd');

        worker.on('valid', () => {
            console.log('valid-----');
            expect(worker.subInfo.state).toBe('Confirmed');
        })

        await worker.endingTx(receipt);
    })
})

