const asyncHandler = require('../middleware/async')
const ErrorResponse = require('../utils/errorResponse')
const SubContract = require('../models/SubContract')
const moment = require("moment");


exports.getInfo = asyncHandler(async (req, res, next) => {
    const {address} = req.user;
    let data = (await SubContract.aggregate([
        {
            $match: {createdAt: {$gt: new Date(moment().subtract(1, "month").format("x"))}}
        },
        {
            $facet: {
                channel: [
                    {
                        $match: {
                            "detail.channel.account": address
                        }
                    }, {
                        $project: {
                            "subscriptionBenefits": {$sum: "$detail.channel.amount"}
                        }
                    }
                ],
                user: [
                    {
                        $match: {
                            "detail.user.account": address
                        }
                    }, {
                        $project: {
                            "rebate": {$sum: "$detail.user.amount"},
                            "subscriptionExpenses": {$sum: "$pay"}
                        }
                    }
                ],
                sharer: [
                    {
                        $match: {
                            "detail.sharer.account": address
                        }
                    }, {
                        $project: {
                            "sharerBenefits": {$sum: "$detail.sharer.amount"}
                        }
                    }
                ],
            }
        }
    ]))[0];
    data = {
        subscriptionBenefits: data.channel[0]?.subscriptionBenefits || 0,
        rebate: data.user[0]?.rebate || 0,
        subscriptionExpenses: data.user[0]?.subscriptionExpenses || 0,
        sharerBenefits: data.sharer[0]?.sharerBenefits || 0
    }
    res.status(200).json({success: true, data})
})
