const mongoose = require('mongoose')

const Schema = mongoose.Schema

const VideoSchema = new Schema(
  {
    title: {
      type: String,
      minlength: [3, 'Must be three characters long']
    },
    description: {
      type: String,
      default: ''
    },
    thumbnailUrl: {
      type: String,
      default: 'no-photo.jpg'
    },
    views: {
      type: Number,
      default: 0
    },
    url: {
      type: String,
        default:""
    },
      overlay: {
          type: String,
          default:""
      },
    status: {
      type: String,
      enum: ['draft', 'private', 'public','member'],
      default: 'draft'
    },
    categoryId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Category'
    },
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    oracle:{
        type: [String],
        default: []
    }
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true }, timestamps: true }
)

VideoSchema.index({ title: 'text' })
VideoSchema.index({ userId: 1 })
VideoSchema.index({ url: 1 })

VideoSchema.virtual("registered")
//     .get(function (){
//     return !!(this.oracle && this.oracle.length>0)
// })

VideoSchema.virtual('dislikes', {
  ref: 'Feeling',
  localField: '_id',
  foreignField: 'videoId',
  justOne: false,
  count: true,
  match: { type: 'dislike' }
})

VideoSchema.virtual('likes', {
  ref: 'Feeling',
  localField: '_id',
  foreignField: 'videoId',
  justOne: false,
  count: true,
  match: { type: 'like' }
})

VideoSchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'videoId',
  justOne: false,
  count: true
})

module.exports = mongoose.model('Video', VideoSchema)
