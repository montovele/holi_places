import { Router } from 'express'
import { readPublicCommunity, readPublicCommunityPost } from '../controllers/community.controller.js'

const router = Router()

router.get('/', readPublicCommunity)
router.get('/posts/:postId', readPublicCommunityPost)

export default router