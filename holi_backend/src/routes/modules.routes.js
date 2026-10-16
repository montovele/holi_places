import { Router } from 'express'
import {
  assignEvent,
  createModuleRecord,
  createServiceSchedule,
  deleteModuleRecord,
  deleteServiceSchedule,
  readModule,
  reserveLocation,
  updateModuleRecord,
  updateServiceSchedule,
} from '../controllers/modules.controller.js'
import { requireModuleOperatorScope, requireRoles, requireSameOrigin } from '../middleware/auth.middleware.js'

const router = Router()

router.post('/events/schedules', requireSameOrigin, requireRoles('superadmin', 'admin'), createServiceSchedule)
router.put('/events/schedules/:scheduleId', requireSameOrigin, requireRoles('superadmin', 'admin'), updateServiceSchedule)
router.delete('/events/schedules/:scheduleId', requireSameOrigin, requireRoles('superadmin', 'admin'), deleteServiceSchedule)
router.get('/:moduleId', readModule)
router.post('/:moduleId', requireSameOrigin, requireModuleOperatorScope, createModuleRecord)
router.put('/:moduleId/:recordId', requireSameOrigin, requireModuleOperatorScope, updateModuleRecord)
router.delete('/:moduleId/:recordId', requireSameOrigin, requireRoles('superadmin', 'admin'), deleteModuleRecord)
router.post('/locations/:locationId/reservations', requireSameOrigin, requireRoles('superadmin', 'admin', 'operator'), reserveLocation)
router.patch('/events/:eventId/location', requireSameOrigin, requireRoles('superadmin', 'admin', 'operator'), assignEvent)

export default router