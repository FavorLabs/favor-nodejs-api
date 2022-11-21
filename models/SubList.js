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
        sharerId: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
        },
        tx: String,
        workAddress: String,
        price: {
            type: String,
            required: true
        },
        state: {
            type: String,
            enum: ['Submitted', 'Processing', 'Chain', 'Confirmed', 'Error'],
            required: true
        },
        height: Number,
        expire: Number,
        detail: String
    },
    {timestamps: true}
)

SubListSchema.plugin(uniqueValidator, {message: '{PATH} already exists.'})

module.exports = mongoose.model('SubList', SubListSchema)
