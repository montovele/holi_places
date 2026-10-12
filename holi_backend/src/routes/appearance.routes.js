import { Router } from 'express'
import { readPublicAppearance } from '../controllers/appearance.controller.js'

const router = Router()

router.get('/', readPublicAppearance)

export default router