import { Router } from 'express'
import { readAdminAppearance, updateAdminAppearance } from '../controllers/appearance.controller.js'
import { requireRoles, requireSameOrigin } from '../middleware/auth.middleware.js'

const router = Router()

router.use(requireRoles('superadmin'))
router.get('/', readAdminAppearance)
router.put('/', requireSameOrigin, updateAdminAppearance)

export default router