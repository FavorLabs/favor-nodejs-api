const Web3Utils = require("web3-utils");
const asyncHandler = require('../middleware/async')
const ErrorResponse = require('../utils/errorResponse')
const SubList = require('../models/SubList');

const {contract, eth} = require("../config/contract");
const {getQueue, getExQueue} = require("../config/queue");
const {updateAccount} = require("../utils/accountUtil");

exports.getList = asyncHandler(async (req, res, next) => {
    const {_id} = req.user;
    const {page = 1, limit = 10} = req.query;
    const total = await SubList.find({userId: _id}).count();
    const list = await SubList.find({userId: _id}).limit((page - 1) * limit)
        .populate(["userId", "channelId", "sharerId"].map(item => ({path: item, select: ['address', 'channelName']})));
    res.status(200).json({
        success: true, data: {
            page,
            limit,
            total,
            list
        }
    })
})

exports.addList = asyncHandler(async (req, res, next) => {
    const {_id, address} = req.user;
    const {channelId, sharerId, channelAddress, tx, price, signature} = req.body;
    if (tx) {
        let data = await SubList.findOneAndUpdate({
            userId: _id,
            state: 'Chain',
            external: {$ne: -1},
        },{
            channelId,
            sharerId,
            price,
            tx,
        },{
            new: true
        });

        if (!data) {
            data = await SubList.create({
                userId: _id,
                channelId,
                sharerId,
                price,
                tx,
                state: "Chain",
                external: 0
            });
            const exQueue = getExQueue();
            await exQueue.addAsync({id: data._id});
        }

        res.status(200).json({success: true, data});
        return;
    }

    if (!Web3Utils.isAddress(channelAddress)) return next(new ErrorResponse("ChannelAddress Error"));
    const {price: channelPrice} = await contract.methods.getUserConfig(channelAddress).call();

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
