const mongoose = require('mongoose')

const Schema = mongoose.Schema

const detailSchema = new Schema({
    account: {
        type: String,
        lowercase: true,
    },
    amount: Number,
    rate: Number
}, {_id: false})

const subContractSchema = new Schema(
    {
        tx: {
            type: String,
            required: [true, 'Subscriber id is required']
        },
        height: Number,
        expire: Number,
        pay: Number,
        sender: {
            type: String,
            lowercase: true,
        },
        detail: {
            channel: detailSchema,
            user: detailSchema,
            sharer: detailSchema,
        }

    },
    {timestamps: true}
)
module.exports = mongoose.model('SubContract', subContractSchema)
