const express = require('express')
const {
    undone,
  getVideos,
  getVideo,
  videoUpload,
  updateVideo,
  updateViews,
  uploadVideoThumbnail,
  deleteVideo
} = require('../controllers/videos')

const Video = require('../models/Video')
const VideoList = require('../models/VideoList')

const router = express.Router()

const advancedResults = require('../middleware/advancedResults')
const { protect } = require('../middleware/auth')

router.post('/', protect, videoUpload)

router.get('/undone', protect, undone)

router.route('/private').get(
  protect,
  advancedResults(
    Video,
    [
      { path: 'userId' },
      { path: 'categoryId' },
      { path: 'likes' },
      { path: 'dislikes' },
      { path: 'comments' }
    ],
    {
      status: 'private'
    }
  ),
  getVideos
)

router
  .route('/public')
  .get(
    advancedResults(
      VideoList,
      [
        { path: 'userId' },
        { path: 'categoryId' },
        { path: 'likes' },
        { path: 'dislikes' }
      ],
      { status: 'public' }
    ),
    getVideos
  )
router
    .route('/featured')
    .get(
        advancedResults(
            VideoList,
            [
                { path: 'userId' },
                { path: 'categoryId' },
                { path: 'likes' },
                { path: 'dislikes' }
            ],
            { status: 'home' }
        ),
        getVideos
    )


router
  .route('/:id')
  .get(getVideo)
  .put(protect, updateVideo)
  .delete(protect, deleteVideo)

router.route('/:id/thumbnails').put(protect, uploadVideoThumbnail)
router.route('/:id/views').put(protect, updateViews)

module.exports = router
