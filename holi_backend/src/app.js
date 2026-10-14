import cors from 'cors'
import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import { database } from './db/database.js'
import { createAuthMiddleware } from './middleware/auth.middleware.js'
import { createActiveSubscriptionMiddleware } from './middleware/auth.middleware.js'
import authRouter from './routes/auth.routes.js'
import communityRouter from './routes/community.routes.js'
import dashboardRouter from './routes/dashboard.routes.js'
import healthRouter from './routes/health.routes.js'
import modulesRouter from './routes/modules.routes.js'
import organizationsRouter from './routes/organizations.routes.js'
import usersRouter from './routes/users.routes.js'
import billingRouter from './routes/billing.routes.js'
import registrationRouter from './routes/registration.routes.js'
import plansRouter from './routes/plans.routes.js'
import publicPlansRouter from './routes/public-plans.routes.js'
import appearanceRouter from './routes/appearance.routes.js'
import adminAppearanceRouter from './routes/admin-appearance.routes.js'
import adsRouter from './routes/ads.routes.js'
import publicAdsRouter from './routes/public-ads.routes.js'
import tenantAdsRouter from './routes/tenant-ads.routes.js'
import { stripeWebhook } from './controllers/billing.controller.js'

const app = express()

app.use(helmet())
app.use(cors({
  origin: [
    process.env.FRONTEND_ORIGIN || 'http://localhost:5188',
    /^http:\/\/(localhost|127\.0\.0\.1):51(?:7[3-9]|8[0-9]|9[0-9])$/,
  ],
  credentials: true,
}))
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhook)
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use('/api/health', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/public/registrations', registrationRouter)
app.use('/api/public/community', communityRouter)
app.use('/api/public/ads', publicAdsRouter)
app.use('/api/public/media', publicAdsRouter)
app.use('/api/public/appearance', appearanceRouter)
app.use('/api/public/plans', publicPlansRouter)
const requireAuthenticated = createAuthMiddleware(database)
const requirePaidSubscription = createActiveSubscriptionMiddleware(database)
app.use('/api/admin/organizations', requireAuthenticated, organizationsRouter)
app.use('/api/admin/users', requireAuthenticated, usersRouter)
app.use('/api/admin/saas/plans', requireAuthenticated, plansRouter)
app.use('/api/admin/ads', requireAuthenticated, adsRouter)
app.use('/api/tenant/ads', requireAuthenticated, tenantAdsRouter)
app.use('/api/admin/appearance', requireAuthenticated, adminAppearanceRouter)
app.use('/api/billing', requireAuthenticated, billingRouter)
app.use('/api/dashboard', requireAuthenticated, dashboardRouter)
app.use('/api/modules', requireAuthenticated, requirePaidSubscription, modulesRouter)

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error)
  const status = error.status || (['ER_DUP_ENTRY', 'ER_ROW_IS_REFERENCED_2'].includes(error.code) ? 409 : 500)
  const message = status >= 500 && status !== 503 ? 'Ocurrió un error interno.' : error.message || 'Solicitud inválida.'
  response.status(status).json({
    error: {
      code: status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      message,
    },
  })
})

app.use((request, response) => {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route for ${request.method} ${request.path}`,
    },
  })
})

export default app