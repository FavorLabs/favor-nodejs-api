const express = require('express')

const router = express.Router()

const {protect} = require('../middleware/auth')

const {getList, addList, getSub, getSubById} = require("../controllers/sublist")

router
    .route('/')
    .get(protect, getList)
    .post(protect, addList)

router.route('/getsub').get(protect, getSub)

router.route('/:id').get(protect, getSubById)




module.exports = router
