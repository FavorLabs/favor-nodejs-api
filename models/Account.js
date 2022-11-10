const mongoose = require('mongoose')
const uniqueValidator = require('mongoose-unique-validator')

const Schema = mongoose.Schema

const AccountSchema = new Schema(
    {
        userId: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: true
        },
        amount: String,
        processing:String,
        lock:Boolean
    },
    { timestamps: true }
)

AccountSchema.plugin(uniqueValidator, { message: '{PATH} already exists.' })

module.exports = mongoose.model('Account', AccountSchema)
