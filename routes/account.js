const express = require('express')


const SubList = require('../models/SubList')

const router = express.Router()

const advancedResults = require('../middleware/advancedResults')
const { protect } = require('../middleware/auth')

router
  .route('/')
  .get(protect, info)


module.exports = router
