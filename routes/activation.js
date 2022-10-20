const express = require('express')
const router = express.Router()
const UserDetail = require('../models/UserDetail')
const { protect } = require('../middleware/auth')

const {
    getInfo,
    getList,
    getRank
} = require('../controllers/activation')
const advancedResults = require("../middleware/advancedResults");

router.get('/info',protect, getInfo)

router
    .route('/list')
    .get(protect,
        advancedResults(
            UserDetail,
            [

            ],
            {
                status: 'private',
                filter: 'code'
            }
        ),
        getList
    )

router
    .route('/rank').get(protect,getRank)

module.exports = router