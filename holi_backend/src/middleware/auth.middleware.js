import { verifySessionToken } from '../services/auth.service.js'
import { legacyAgendaModuleIds, moduleApiIds, moduleIds } from '../services/modules.service.js'

export function createAuthMiddleware(database) {
  return async function requireAuthenticated(request, response, next) {
    const token = request.cookies?.holi_session
    if (!token) return response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Inicia sesión para continuar.' } })

    let payload
    try {
      payload = verifySessionToken(token)
    } catch {
      return response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'La sesión ya no es válida.' } })
    }

    try {
      const [users] = await database.execute(`
        SELECT users.id, users.email, users.role, users.organization_id AS organizationId,
          organizations.name AS organizationName, users.status
        FROM users
        LEFT JOIN organizations ON organizations.id = users.organization_id
        WHERE users.id = ? LIMIT 1
      `, [payload.sub])
      const user = users[0]
      if (!user || user.status !== 'active') {
        return response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'La sesión ya no es válida.' } })
      }

      let organizationId = user.organizationId
      let organizationName = user.organizationName
      if (user.role === 'superadmin') {
        const requestedOrganizationId = request.get('x-organization-id')
        organizationId = null
        organizationName = null
        if (requestedOrganizationId) {
          const [organizations] = await database.execute(
            "SELECT id, name FROM organizations WHERE id = ? AND status = 'active' LIMIT 1",
            [requestedOrganizationId],
          )
          if (!organizations.length) {
            return response.status(403).json({ error: { code: 'INVALID_TENANT', message: 'La organización seleccionada no está disponible.' } })
          }
          organizationId = organizations[0].id
          organizationName = organizations[0].name
        }
      }

      request.auth = {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId,
        organizationName,
      }
      return next()
    } catch (error) {
      return next(error)
    }
  }
}

export function requireRoles(...roles) {
  return function authorizeRole(request, response, next) {
    if (!request.auth || !roles.includes(request.auth.role)) {
      return response.status(403).json({ error: { code: 'FORBIDDEN', message: 'No tienes permisos para realizar esta acción.' } })
    }
    return next()
  }
}

export function requireSameOrigin(request, response, next) {
  const origin = request.get('origin')
  if (!origin) return next()

  const configuredOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5188'
  const allowed = origin === configuredOrigin
    || /^http:\/\/(localhost|127\.0\.0\.1):51(7[3-9]|8[0-9])$/.test(origin)
  if (!allowed) {
    return response.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Origen de solicitud no permitido.' } })
  }
  return next()
}

export function requireModuleOperatorScope(request, response, next) {
  if (['superadmin', 'admin'].includes(request.auth?.role)) return next()
  if (request.auth?.role === 'operator' && ['reservations', 'attendance'].includes(request.params.moduleId)) return next()
  return response.status(403).json({ error: { code: 'FORBIDDEN', message: 'Tu rol no puede modificar este módulo.' } })
}

export function createActiveSubscriptionMiddleware(database) {
  return async function requireActiveSubscription(request, response, next) {
    if (request.auth?.role === 'superadmin') return next()
    if (!request.auth?.organizationId) {
      return response.status(402).json({ error: { code: 'SUBSCRIPTION_REQUIRED', message: 'Activa una suscripción para acceder a los módulos.' } })
    }
    try {
      const [subscriptions] = await database.execute(`
        SELECT s.id, s.status, s.saas_plan_id, s.current_period_end,
          (s.current_period_end IS NULL OR s.current_period_end > UTC_TIMESTAMP()) AS periodValid
        FROM subscriptions s
        WHERE s.organization_id = ?
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT 1
      `, [request.auth.organizationId])

      const latestSubscription = subscriptions[0]
      if (!latestSubscription || latestSubscription.status !== 'active' || Number(latestSubscription.periodValid) !== 1) {
        return response.status(402).json({ error: { code: 'SUBSCRIPTION_REQUIRED', message: 'Completa el pago de tu suscripción para habilitar los módulos.' } })
      }

      const requestedModule = request.params?.moduleId || request.params?.module_id || null
      if (!requestedModule || !moduleApiIds.includes(requestedModule)) return next()

      const agendaModuleIds = ['events', ...legacyAgendaModuleIds]
      const entitlementModuleIds = agendaModuleIds.includes(requestedModule) ? agendaModuleIds : [requestedModule]
      const entitlementPlaceholders = entitlementModuleIds.map(() => '?').join(', ')

      const [entitlements] = await database.execute(`
        SELECT 1
        FROM saas_plan_entitlements
        WHERE plan_id = ? AND feature_key IN (${entitlementPlaceholders}) AND enabled = 1
        LIMIT 1
      `, [latestSubscription.saas_plan_id, ...entitlementModuleIds])

      if (!entitlements.length) {
        return response.status(402).json({
          error: {
            code: 'MODULE_NOT_INCLUDED',
            message: 'Este plan no incluye el módulo solicitado.',
          },
        })
      }

      return next()
    } catch (error) {
      return next(error)
    }
  }
}