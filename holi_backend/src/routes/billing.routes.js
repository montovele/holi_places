import { Router } from 'express'
import { checkout, readSubscription } from '../controllers/billing.controller.js'
import { requireRoles, requireSameOrigin } from '../middleware/auth.middleware.js'

const router = Router()

router.get('/status', readSubscription)
router.post('/checkout', requireSameOrigin, requireRoles('admin', 'superadmin'), checkout)

export default router