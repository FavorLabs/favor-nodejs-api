const asyncHandler = require('../middleware/async')
const ErrorResponse = require('../utils/errorResponse')
const SubContract = require('../models/SubContract')
const moment = require("moment");


exports.getInfo = asyncHandler(async (req, res, next) => {
    const {address} = req.user;
    const {date} = req.query;
    const time = date ? new Date(Number(date)) : moment().subtract(1, "month").toDate()
    let data = (await SubContract.aggregate([
        {
            $match: {createdAt: {$gt: time}}
        },
        {
            $facet: {
                channel: [
                    {
                        $match: {
                            "detail.channel.account": address
                        }
                    }, {
                        $group: {
                            _id: null,
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
                        $group: {
                            _id: null,
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
                        $group: {
                            _id: null,
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
