import { Router } from 'express'
import { addPlan, addPlanPrice, editPlan, readPlan, readPlanPrices, readPlans, removePlan } from '../controllers/plans.controller.js'
import { requireRoles, requireSameOrigin } from '../middleware/auth.middleware.js'

const router = Router()

router.use(requireRoles('superadmin'))
router.get('/', readPlans)
router.post('/', requireSameOrigin, addPlan)
router.get('/:planId', readPlan)
router.put('/:planId', requireSameOrigin, editPlan)
router.delete('/:planId', requireSameOrigin, removePlan)
router.get('/:planId/prices', readPlanPrices)
router.post('/:planId/prices', requireSameOrigin, addPlanPrice)

export default router