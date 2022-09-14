const express = require('express')


const Video = require('../models/Video')

const router = express.Router()

const advancedResults = require('../middleware/advancedResults')
const { protect } = require('../middleware/auth')


router.route('/:id').get(async(req, res, next)=>{
  let v = await Video.findById(req.params.id)
  v.query = new URLSearchParams(req.query).toString()
  if(v.query){
    v.query = "?"+v.query;
  }
  res.render('share', v);
})

module.exports = router
