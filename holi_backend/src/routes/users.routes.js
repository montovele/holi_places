import { Router } from 'express'
import { addOrganizationUser, readOrganizationUsers } from '../controllers/users.controller.js'
import { requireRoles, requireSameOrigin } from '../middleware/auth.middleware.js'

const router = Router()

router.use(requireRoles('superadmin', 'admin'))
router.get('/', readOrganizationUsers)
router.post('/', requireSameOrigin, addOrganizationUser)

export default router