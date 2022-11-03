const mongoose = require('mongoose')
const uniqueValidator = require('mongoose-unique-validator')

const Schema = mongoose.Schema

const SubListSchema = new Schema(
    {
        userId: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: true
        },
        channelId: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: true
        },
        tx:String,
        subAddress:{
            type:String
        },
        price:String,
        state:{
            type:String,
            enum:['Submitted','Processing','Chain','Confirmed']
        }
    },
    { timestamps: true }
)

SubListSchema.plugin(uniqueValidator, { message: '{PATH} already exists.' })

module.exports = mongoose.model('SubList', SubListSchema)