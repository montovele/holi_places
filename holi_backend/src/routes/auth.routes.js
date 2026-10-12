import { rateLimit } from 'express-rate-limit'
import { Router } from 'express'
import { currentUser, login, logout } from '../controllers/auth.controller.js'
import { createAuthMiddleware, requireSameOrigin } from '../middleware/auth.middleware.js'
import { database } from '../db/database.js'

const router = Router()
const requireAuthenticated = createAuthMiddleware(database)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
})

router.post('/login', requireSameOrigin, loginLimiter, login)
router.post('/logout', requireSameOrigin, requireAuthenticated, logout)
router.get('/me', requireAuthenticated, currentUser)

export default router