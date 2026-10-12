import { rateLimit } from 'express-rate-limit'
import { Router } from 'express'
import { register } from '../controllers/billing.controller.js'
import { requireSameOrigin } from '../middleware/auth.middleware.js'

const router = Router()
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
})

router.post('/', requireSameOrigin, registrationLimiter, register)

export default router