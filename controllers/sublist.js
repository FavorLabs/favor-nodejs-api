const Web3Utils = require("web3-utils");
const asyncHandler = require('../middleware/async')
const ErrorResponse = require('../utils/errorResponse')
const SubList = require('../models/SubList');

const {contract, eth} = require("../config/contract");
const {getQueue} = require("../config/queue");
const {updateAccount} = require("../utils/accountUtil");

exports.getList = asyncHandler(async (req, res, next) => {
    const {_id} = req.user;
    const data = await SubList.find({userId: _id})
        .populate(["userId", "channelId", "sharerId"].map(item => ({path: item, select: ['address', 'channelName']})));
    res.status(200).json({success: true, data})
})

exports.addList = asyncHandler(async (req, res, next) => {
    const {_id, address} = req.user;
    const {channelId, sharerId, channelAddress, tx, price, signature} = req.body;
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
    const {price: channelPrice} = await contract.methods.userConfig().call({from: channelAddress});

    let message = `Subscribe to Channel : ${address} (Price: ${channelPrice})`;
    let addr = eth.accounts.recover(message, signature).toLowerCase();
    if (addr !== address) return next(new ErrorResponse('Invalid credentials', 400));

    await updateAccount({userId: _id, type: 2, timeout: true, price: channelPrice});

    const data = await SubList.create({
        userId: _id,
        channelId,
        sharerId,
        price: channelPrice,
        state: "Submitted"
    });
    const queue = getQueue();
    await queue.addAsync({id: data._id});
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
