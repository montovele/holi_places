import { database } from '../db/database.js'
import { createCheckoutSession, getOrganizationSubscription, processStripeWebhook, registerCongregation } from '../services/billing.service.js'

export async function register(request, response) {
  const registration = await registerCongregation(database, request.body)
  response.status(201).json(registration)
}

export async function readSubscription(request, response) {
  response.json(await getOrganizationSubscription(database, request.auth.organizationId))
}

export async function checkout(request, response) {
  const [subscriptions] = await database.execute(`
    SELECT id FROM subscriptions
    WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1
  `, [request.auth.organizationId])
  if (!subscriptions.length) {
    return response.status(404).json({ error: { code: 'SUBSCRIPTION_NOT_FOUND', message: 'No hay una suscripción pendiente para esta organización.' } })
  }

  const requestedPlanId = request.body?.plan_id || request.body?.planId || null
  const session = await createCheckoutSession(database, subscriptions[0].id, {
    organizationId: request.auth.organizationId,
    email: request.auth.email,
    planId: requestedPlanId,
  })
  response.json(session)
}

export async function stripeWebhook(request, response, next) {
  try {
    response.json(await processStripeWebhook(database, request.body, request.get('stripe-signature')))
  } catch (error) {
    next(error)
  }
}