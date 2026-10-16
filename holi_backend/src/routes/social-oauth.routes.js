import { Router } from 'express'
import { completeMetaConnection } from '../controllers/social-publishing.controller.js'

const router = Router()

router.get('/callback', completeMetaConnection)

export default router
