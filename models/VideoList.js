const mongoose = require('mongoose')

const Schema = mongoose.Schema

const VideoListSchema = new Schema(
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
      type: String
    },
    status: {
      type: String,
      enum: ['draft', 'private', 'public','member'],
      default: 'draft'
    },
    categoryId: {
      type: Object,
      ref: 'Category'
    },
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
      user:{
          type: mongoose.Schema.ObjectId,
      }
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true }, timestamps: true }
)



VideoListSchema.virtual('dislikes', {
  ref: 'Feeling',
  localField: '_id',
  foreignField: 'videoId',
  justOne: false,
  count: true,
  match: { type: 'dislike' }
})

VideoListSchema.virtual('likes', {
  ref: 'Feeling',
  localField: '_id',
  foreignField: 'videoId',
  justOne: false,
  count: true,
  match: { type: 'like' }
})

VideoListSchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'videoId',
  justOne: false,
  count: true
})

module.exports = mongoose.model('VideoList', VideoListSchema)
