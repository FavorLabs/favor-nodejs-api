const asyncHandler = require('../middleware/async')
const ErrorResponse = require('../utils/errorResponse')
const Account = require('../models/Account')


exports.getInfo = asyncHandler(async (req, res, next) => {
    const {_id} = req.user;
    const data = await Account.findOne({userId: _id});
    res.status(200).json({success: true, data})
})
