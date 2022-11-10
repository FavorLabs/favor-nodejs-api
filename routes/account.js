const express = require('express')

const router = express.Router()

const {protect} = require('../middleware/auth')

const {getInfo} = require("../controllers/account")

router
    .route('/')
    .get(protect, getInfo)


module.exports = router
