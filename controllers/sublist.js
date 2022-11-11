const Web3Utils = require("web3-utils");
const asyncHandler = require('../middleware/async')
const ErrorResponse = require('../utils/errorResponse')
const SubList = require('../models/SubList');
const Account = require('../models/Account');

const {contract} = require("../config/contract");
const {getQueue} = require("../config/queue");

exports.getList = asyncHandler(async (req, res, next) => {
    const {_id} = req.user;
    const data = await SubList.find({userId: _id})
        .populate(["userId", "channelId", "sharerId"].map(item => ({path: item, select: ['address', 'channelName']})));
    res.status(200).json({success: true, data})
})

exports.addList = asyncHandler(async (req, res, next) => {
    const {_id, address} = req.user;
    const {channelId, sharerId, channelAddress, tx, price} = req.body;
    if (tx) {
        const data = await SubList.create({
            userId: _id,
            channelId,
            sharerId,
            price,
            tx,
            state: "Chain"
        });
        res.status(200).json({success: true, data});
        return;
    }
    if (!Web3Utils.isAddress(channelAddress)) return next(new ErrorResponse("ChannelAddress Error"));
    const userConfig = await contract.methods.userConfig().call({from: channelAddress});
    let account = await Account.findOneAndUpdate({userId: _id, lock: false}, {$set: {lock: true}});
    let n = 1;
    while (!account) {
        await new Promise(s => setTimeout(s, 100));
        account = await Account.findOneAndUpdate({userId: _id, lock: false}, {$set: {lock: true}});
        n++;
        if (n >= 30) {
            return next(new ErrorResponse("Subscription is too busy, please wait"));
        }
    }
    if (BigInt(account.amount) - BigInt(account.processing) < BigInt(userConfig.price)) {
        await Account.updateOne({userId: _id}, {$set: {lock: false}});
        return next(new ErrorResponse("Insufficient balance"));
    }
    const data = await SubList.create({
        userId: _id,
        channelId,
        sharerId,
        price: userConfig.price,
        state: "Submitted"
    });
    const queue = getQueue();
    await queue.addAsync({id: data._id});
    await Account.updateOne({userId: _id}, {
        $set: {lock: false, processing: (BigInt(account.processing) + BigInt(userConfig.price)).toString()}
    });
    res.status(200).json({success: true, data});
})

exports.getSubById = asyncHandler(async (req, res, next) => {
    const data = await SubList.findById(req.params.id)
        .populate(["userId", "channelId", "sharerId"].map(item => ({path: item, select: ['address', 'channelName']})));
    res.status(200).json({success: true, data})
})

exports.getSub = asyncHandler(async (req, res, next) => {
    const {_id} = req.user;
    const {channelId} = req.query;
    const data = await SubList.findOne({userId: _id, channelId, state: {$nin: ["Confirmed", "Error"]}})
        .populate(["userId", "channelId", "sharerId"].map(item => ({path: item, select: ['address', 'channelName']})));
    res.status(200).json({success: true, data})
})
