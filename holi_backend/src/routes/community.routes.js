import { Router } from 'express'
import { readPublicCommunity } from '../controllers/community.controller.js'

const router = Router()

router.get('/', readPublicCommunity)

export default router