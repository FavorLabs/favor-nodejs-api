const mongoose = require('mongoose')
const uniqueValidator = require('mongoose-unique-validator')

const Schema = mongoose.Schema

const SubListSchema = new Schema(
    {
        userId: {
            type: mongoose.Schema.ObjectId,
            ref: 'UserDetail',
            required: true
        },
        channelId: {
            type: mongoose.Schema.ObjectId,
            ref: 'UserDetail',
            required: true
        },
        sharerId: {
            type: mongoose.Schema.ObjectId,
            ref: 'UserDetail',
        },
        tx: String,
        workAddress: {
            type: String
        },
        price: {
            type: String,
            required: true
        },
        state: {
            type: String,
            enum: ['Submitted', 'Processing', 'Chain', 'Confirmed', 'error'],
            required: true
        },
        detail: String
    },
    {timestamps: true}
)

SubListSchema.plugin(uniqueValidator, {message: '{PATH} already exists.'})

module.exports = mongoose.model('SubList', SubListSchema)
