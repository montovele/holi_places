import { rateLimit } from 'express-rate-limit'
import { Router } from 'express'
import {
  createPublicDonationCheckout,
  readPublicDonationCampaign,
  readPublicDonationPaymentStatus,
} from '../controllers/donations.controller.js'
import { requireSameOrigin } from '../middleware/auth.middleware.js'

const router = Router()
const donationCheckoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
})
const donationStatusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
})

router.get('/', readPublicDonationCampaign)
router.get('/status/:sessionId', donationStatusLimiter, readPublicDonationPaymentStatus)
router.post('/checkout', requireSameOrigin, donationCheckoutLimiter, createPublicDonationCheckout)

export default router
