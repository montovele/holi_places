import { Router } from 'express'
import multer from 'multer'
import { uploadCampaignImage } from '../controllers/ads.controller.js'
import {
  changeOrganizationAdStatus,
  editOrganizationAd,
  readAdvertisingPricing,
  readOrganizationAds,
  retryOrganizationAdvertisingOrder,
  startOrganizationAdCheckout,
} from '../controllers/ad-purchases.controller.js'
import { requireRoles, requireSameOrigin } from '../middleware/auth.middleware.js'

const router = Router()
const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter(request, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'].includes(file.mimetype)) {
      return callback(Object.assign(new Error('El archivo debe ser JPEG, PNG, WebP, MP4 o WebM.'), { status: 400 }))
    }
    return callback(null, true)
  },
}).single('image')

function parseUploadedImage(request, response, next) {
  uploadMedia(request, response, (error) => {
    if (!error) return next()
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.status || 400
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'El video no puede superar 50 MB.' : error.message
    return response.status(status).json({ error: { code: 'INVALID_IMAGE', message } })
  })
}

router.use(requireRoles('admin', 'superadmin'))
router.get('/pricing', readAdvertisingPricing)
router.get('/', readOrganizationAds)
router.post('/upload-image', requireSameOrigin, parseUploadedImage, uploadCampaignImage)
router.post('/checkout', requireSameOrigin, startOrganizationAdCheckout)
router.post('/orders/:orderId/retry', requireSameOrigin, retryOrganizationAdvertisingOrder)
router.put('/:campaignId', requireSameOrigin, editOrganizationAd)
router.patch('/:campaignId/status', requireSameOrigin, changeOrganizationAdStatus)

export default router