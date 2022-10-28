const asyncHandler = require('../middleware/async')
const ErrorResponse = require('../utils/errorResponse')
const UserDetail = require('../models/UserDetail')
const aData = require('../_data/activation.json')

exports.getInfo = asyncHandler(async (req, res, next) => {
    let user = await UserDetail.findById(req.user._id,{invitations:1,activation:1,code:1,valid:1});
    user = user.toObject()
    // user.vilad = await UserDetail.countDocuments({invitation:user.code,activation:{$gt:5000},videos:{}})

    res.status(200).json({ success: true, data: user })
})

// @desc    Get videos
// @route   GET /api/v1/videos/public or /api/v1/videos/private
// @access  Public Or Private
exports.getList = asyncHandler(async (req, res, next) => {
    res.status(200).json(res.advancedResults)
})

exports.getRank = asyncHandler(async (req, res, next) => {
    let queryRound = req.query.round || aData.length;
    res.status(200).json({success: true, round: queryRound, data: aData[queryRound-1]});
})