const express = require('express')
const router = express.Router()
const {protect} = require('../middleware/auth')
const {getInfo} = require("../controllers/revenue")

router.get('/info', protect, getInfo)


module.exports = router
