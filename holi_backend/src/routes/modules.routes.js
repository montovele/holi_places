import { Router } from 'express'
import { assignEvent, createModuleRecord, deleteModuleRecord, readModule, reserveLocation, updateModuleRecord } from '../controllers/modules.controller.js'
import { requireModuleOperatorScope, requireRoles, requireSameOrigin } from '../middleware/auth.middleware.js'

const router = Router()

router.get('/:moduleId', readModule)
router.post('/:moduleId', requireSameOrigin, requireModuleOperatorScope, createModuleRecord)
router.put('/:moduleId/:recordId', requireSameOrigin, requireModuleOperatorScope, updateModuleRecord)
router.delete('/:moduleId/:recordId', requireSameOrigin, requireRoles('superadmin', 'admin'), deleteModuleRecord)
router.post('/locations/:locationId/reservations', requireSameOrigin, requireRoles('superadmin', 'admin', 'operator'), reserveLocation)
router.patch('/events/:eventId/location', requireSameOrigin, requireRoles('superadmin', 'admin', 'operator'), assignEvent)

export default router