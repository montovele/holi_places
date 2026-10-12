import { Router } from 'express'
import { readPublicPlans } from '../controllers/plans.controller.js'

const router = Router()

router.get('/', readPublicPlans)

export default router