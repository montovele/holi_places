import { Router } from 'express'
import { readDashboard } from '../controllers/dashboard.controller.js'

const router = Router()

router.get('/', readDashboard)

export default router