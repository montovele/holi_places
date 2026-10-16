import { Router } from 'express'
import { readDonationAdministration, updateDonationAdministration } from '../controllers/donations.controller.js'
import { requireRoles, requireSameOrigin } from '../middleware/auth.middleware.js'

const router = Router()

router.use(requireRoles('superadmin'))
router.get('/', readDonationAdministration)
router.put('/', requireSameOrigin, updateDonationAdministration)

export default router
