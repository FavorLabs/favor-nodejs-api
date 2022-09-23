const express = require('express')
const router = express.Router()

const {
  register,
  login,
  logout,
  getMe,
    getInfo,
  forgotPassword,
  resetPassword,
  updateDetails,
  updateSecret,
  uploadChannelAvatar,
  updatePassword
} = require('../controllers/auth')

const { protect } = require('../middleware/auth')

router.post('/register', register)
router.post('/login', login)
router.post('/logout', logout)
router.post('/me', protect, getMe)
router.post('/info', getInfo)
router.put('/updatedetails', protect, updateDetails)
router.put('/updatesecret', protect, updateSecret)
router.put('/avatar', protect, uploadChannelAvatar)
// router.put('/updatepassword', protect, updatePassword)
// router.post('/forgotpassword', forgotPassword)
// router.put('/resetpassword/:resettoken', resetPassword)

module.exports = router
