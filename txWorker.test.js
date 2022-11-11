const Worker = require('./txWorker');
const DBConnection = require('./config/db');
const HDWallet = require('ethereum-hdwallet');
const SubList = require('./models/SubList');
const P = require("bluebird");
const mongoDbQueue = require("mongodb-queue");
const mongoose = require("mongoose");
require('./models/UserDetail');

// const {eth} = require("./config/contract");
//

jest.setTimeout(30000);

let conn = null;
let worker = null;
let queue = null;


beforeAll(async () => {
    conn = await DBConnection();
    queue = P.promisifyAll(mongoDbQueue(conn.connection, 'myQueue', {visibility: 30}))
    const mnemonic = process.env.MNEMONIC;
    const hdwallet = HDWallet.fromMnemonic(mnemonic);
    worker = new Worker(hdwallet.derive(`m/44'/60'/0'/0/0`), queue);
    await worker.init(true);
})

afterAll(async () => {
    conn.connection.close()
});


describe('msg', () => {
    let event = [
        "valid",
        "msg",
        "send",
        "watch",
    ]

    beforeEach(async () => {
        await SubList.deleteMany({workAddress: worker.address});
    });

    afterEach(() => {
        event.forEach(key => {
            worker.removeAllListeners(key);
        });
    });

    test("Interrupted tasks with the status Processing", async () => {
        const fn = jest.fn()
        await SubList.create({
            userId: mongoose.Types.ObjectId(),
            channelId: mongoose.Types.ObjectId(),
            price: 100,
            state: "Processing",
            workAddress: worker.address
        });
        event.forEach(key => {
            worker.on(key, () => {
                fn(key);
            })
        });
        await worker.getMsg();
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith("send");
    })

    test("Interrupted tasks with the status Chain", async () => {
        const fn = jest.fn()
        await SubList.create({
            userId: mongoose.Types.ObjectId(),
            channelId: mongoose.Types.ObjectId(),
            price: 100,
            state: "Chain",
            workAddress: worker.address
        });
        event.forEach(key => {
            worker.on(key, () => {
                fn(key);
            })
        });
        await worker.getMsg();
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith("watch");
    })

    test("Cannot get queue messages", async () => {
        const fn = jest.fn()
        event.forEach(key => {
            worker.on(key, () => {
                fn(key);
            })
        });
        await worker.getMsg();
        await new Promise(s => setTimeout(s, 5000));
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith("msg");
    })

    test("Get a queue message, but the balance is low", async () => {
        const fn = jest.fn()
        let data = await SubList.create({
            userId: mongoose.Types.ObjectId(),
            channelId: mongoose.Types.ObjectId(),
            price: 100001,
            state: "Submitted",
            workAddress: worker.address
        });
        await queue.addAsync({id: data._id});
        event.forEach(key => {
            worker.on(key, () => {
                fn(key);
            })
        });
        await worker.getMsg();
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith("valid");
    })

    test("Send a queue message", async () => {
        const fn = jest.fn();
        let data = await SubList.create({
            userId: mongoose.Types.ObjectId(),
            channelId: mongoose.Types.ObjectId(),
            price: 100,
            state: "Submitted",
            workAddress: worker.address
        });
        await queue.addAsync({id: data._id});
        event.forEach(key => {
            worker.on(key, () => {
                fn(key);
            })
        });
        await worker.getMsg();
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith("send");
        return SubList.findById(data._id).then((res) => {
            expect(res.state).toBe("Processing");
        })
    })
})

describe('watch -> ending', () => {

    beforeEach(async () => {
        await SubList.deleteMany({workAddress: worker.address});
    });

    afterEach(() => {
        worker.removeAllListeners("ending");
    });


    test("Receipt success", async () => {
        worker.subInfo = await SubList.create({
            userId: mongoose.Types.ObjectId(),
            channelId: mongoose.Types.ObjectId(),
            price: 100,
            state: "Chain",
            tx: "0x9982ba6a566b1e0ced475183dd277d04b53dca9bda5c08b63993a0848b212616",
            workAddress: worker.address
        });
        worker.on("ending", (receipt) => {
            expect(receipt.status).toBeTruthy();
        })
        await worker.watchTx();
    })

    test("Receipt error", async () => {
        worker.subInfo = await SubList.create({
            userId: mongoose.Types.ObjectId(),
            channelId: mongoose.Types.ObjectId(),
            price: 100,
            state: "Chain",
            tx: "0x025ec346c4c2ace5ac1fb3b7650aa53a02037dc720c2c9ef8162ad032823a83c",
            workAddress: worker.address
        });
        worker.on("ending", (receipt) => {
            expect(receipt.status).toBeFalsy();
        })
        await worker.watchTx();
    })
})

