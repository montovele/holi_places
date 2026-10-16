import { Router } from 'express'
import {
  addSaasSubscription,
  editSaasSubscription,
  readSaasSubscriptions,
} from '../controllers/saas-subscriptions.controller.js'
import { requireRoles, requireSameOrigin } from '../middleware/auth.middleware.js'

const router = Router()

router.use(requireRoles('superadmin'))
router.get('/', readSaasSubscriptions)
router.post('/', requireSameOrigin, addSaasSubscription)
router.put('/:subscriptionId', requireSameOrigin, editSaasSubscription)

export default router
