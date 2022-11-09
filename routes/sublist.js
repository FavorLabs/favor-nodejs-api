const express = require('express')


const SubList = require('../models/SubList')

const router = express.Router()

const advancedResults = require('../middleware/advancedResults')
const { protect } = require('../middleware/auth')

router
  .route('/')
    .get(protect, updateReply)
    .post(protect, info)

router.route('/:id').get(protect, updateReply)

router.route('/getSub').get(protect, updateReply)



module.exports = router
