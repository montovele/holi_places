import { Router } from 'express'
import { readCampaignImage, readPublicAdRotation } from '../controllers/ads.controller.js'

const router = Router()

router.get('/rotation', readPublicAdRotation)
router.get('/:filename', readCampaignImage)
router.get('/media/:filename', readCampaignImage)

export default router