const mongoose = require('mongoose')

const Schema = mongoose.Schema

const subContractSchema = new Schema(
  {
    tx: {
      type: String,

      required: [true, 'Subscriber id is required']
    },
      height:Number,
      expire:Number,
      pay:Number,
      detail:[{
        account:String,
          rate:Number,
          amount:Number
      }],

  },
  { timestamps: true }
)
module.exports = mongoose.model('SubContract', subContractSchema)