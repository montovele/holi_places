import { Router } from 'express'
import multer from 'multer'
import {
  deleteSocialSettings,
  beginMetaConnection,
  changeMetaPage,
  publishCommunityPost,
  readMetaApplication,
  resetMetaApplication,
  readSocialSettings,
  updateMetaApplication,
  uploadCommunityMedia,
} from '../controllers/social-publishing.controller.js'
import { requireRoles, requireSameOrigin } from '../middleware/auth.middleware.js'

const router = Router()
const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter(request, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'].includes(file.mimetype)) {
      return callback(Object.assign(new Error('El archivo debe ser JPEG, PNG, WebP, MP4 o WebM.'), { status: 400 }))
    }
    return callback(null, true)
  },
}).single('media')

function parseMedia(request, response, next) {
  uploadMedia(request, response, (error) => {
    if (!error) return next()
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.status || 400
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'El archivo no puede superar 100 MB.' : error.message
    return response.status(status).json({ error: { code: 'INVALID_MEDIA', message } })
  })
}

router.use(requireRoles('admin', 'superadmin'))
router.get('/', readSocialSettings)
router.get('/application', readMetaApplication)
router.put('/application', requireSameOrigin, updateMetaApplication)
router.delete('/application', requireSameOrigin, resetMetaApplication)
router.post('/connect', requireSameOrigin, beginMetaConnection)
router.put('/page', requireSameOrigin, changeMetaPage)
router.delete('/', requireSameOrigin, deleteSocialSettings)
router.post('/media', requireSameOrigin, parseMedia, uploadCommunityMedia)
router.post('/publish', requireSameOrigin, publishCommunityPost)

export default router
