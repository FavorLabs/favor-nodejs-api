const mongoose = require('mongoose')

const Schema = mongoose.Schema

const UserSchema = new Schema(
  {
    channelName: {
      type: String,

    },
    email: {
      type: String,
    },
    photoUrl: {
      type: String,
      default: 'no-photo.jpg'
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
      address:{
          type: String,
          unique: true,
          required: true,
      },
    // password: {
    //   type: String,
    //   required: [true, 'Please add a password'],
    //   minlength: [6, 'Must be six characters long'],
    //   select: false
    // },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
      secret:{
          type: Boolean,
          default:false
      },
      mode:{
          type: Number,
          default:0
      },
      price:{
          type: Number,
      },
      tx:{
        type:String,
        default:""
      },
      invitation:{
          type:String,
          default:""
      },
      code:{
          type:String,
          required: true,
      },
      vType:{
          type:String,
          default:0
      },
      videos:{
        type:Number
      },
      views:{
          type:Number
      },
      feelings:{
          type:Number
      },
      onFeelings:{
          type:Number
      },
      subs:{
          type:Number
      },
      onSubs:{
          type:Number
      },
      activation:{
        type:Number
      },
      invitations:{
        type:Number
      }
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true }, timestamps: true }
)


module.exports = mongoose.model('UserDetail', UserSchema)
