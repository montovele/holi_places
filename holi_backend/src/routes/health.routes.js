import { Router } from 'express'
import { readHealth } from '../controllers/health.controller.js'

const router = Router()

router.get('/', readHealth)

export default router