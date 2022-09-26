const express = require('express')


const Video = require('../models/Video')

const router = express.Router()

const advancedResults = require('../middleware/advancedResults')
const { protect } = require('../middleware/auth')


router.route('/:id').get(async(req, res, next)=>{
  if(/^(?=[a-f\d]{24}$)(\d+[a-f]|[a-f]+\d)/i.test(req.params.id)){
    let v = await Video.findById(req.params.id)
    v.query = new URLSearchParams(req.query).toString()
    if(v.query){
      v.query = "?"+v.query;
    }
    res.render('video', v);
  }
  else {

    res.render('share', {url:req.url});
  }

})

// router.route('/').get(async(req, res, next)=>{
//
//   res.render('share', {});
// })

module.exports = router
