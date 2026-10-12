import { Router } from 'express'
import { addOrganization, readOrganizations } from '../controllers/organizations.controller.js'
import { requireRoles, requireSameOrigin } from '../middleware/auth.middleware.js'

const router = Router()

router.use(requireRoles('superadmin'))
router.get('/', readOrganizations)
router.post('/', requireSameOrigin, addOrganization)

export default router