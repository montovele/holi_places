import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { hashPassword } from './auth.service.js'

let stripeClient

function invalid(message, status = 400) {
  const error = new Error(message)
  error.status = status
  throw error
}

function isPlaceholderStripeValue(value) {
  if (typeof value !== 'string') return true
  const normalized = value.trim()
  if (!normalized) return true
  return /replace[-_ ]?(this|with)|your_(stripe|recurring|webhook|secret|price)|placeholder|example/i.test(normalized)
}

function assertStripeSecret(secretKey = process.env.STRIPE_SECRET_KEY) {
  if (!secretKey || isPlaceholderStripeValue(secretKey)) {
    invalid('La clave secreta de Stripe no está configurada o sigue siendo un valor de ejemplo. Añade una clave real en .env.', 503)
  }
}

function assertStripePrice(priceId) {
  if (!priceId || isPlaceholderStripeValue(priceId)) {
    invalid('El plan seleccionado no tiene un precio válido de Stripe configurado.', 503)
  }
}

function assertStripeWebhookSecret(webhookSecret = process.env.STRIPE_WEBHOOK_SECRET) {
  if (!webhookSecret || isPlaceholderStripeValue(webhookSecret)) {
    invalid('El webhook secret de Stripe no está configurado o sigue siendo un valor de ejemplo.', 503)
  }
}

function stripe() {
  assertStripeSecret()
  stripeClient ||= new Stripe(process.env.STRIPE_SECRET_KEY)
  return stripeClient
}

function currentStripeEnvironment() {
  return process.env.STRIPE_ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'live' : 'test')
}

function slugify(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)
}

function validateRegistration(input) {
  const organizationName = typeof input.organizationName === 'string' ? input.organizationName.trim() : ''
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const password = input.password
  if (organizationName.length < 2 || organizationName.length > 255) invalid('El nombre de la congregación debe tener entre 2 y 255 caracteres.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('El correo no es válido.')
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    invalid('La contraseña debe tener al menos 12 caracteres y no superar 72 bytes UTF-8.')
  }
  const slug = slugify(organizationName)
  if (slug.length < 2) invalid('El nombre de la congregación no permite crear un identificador válido.')
  return { organizationName, email, password, slug }
}

export async function registerCongregation(database, input = {}) {
  const { organizationName, email, password, slug } = validateRegistration(input)
  const connection = await database.getConnection()
  const organizationId = `org-${randomUUID()}`
  const userId = `user-${randomUUID()}`
  const subscriptionId = `sub-${randomUUID()}`

  try {
    await connection.beginTransaction()
    await connection.execute('INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)', [organizationId, organizationName, `${slug}-${organizationId.slice(-8)}`])
    await connection.execute(`
      INSERT INTO users (id, organization_id, email, password_hash, role, status)
      VALUES (?, ?, ?, ?, 'admin', 'active')
    `, [userId, organizationId, email, await hashPassword(password)])

    await connection.execute(`
      INSERT INTO subscriptions (id, organization_id, status, saas_plan_id, saas_plan_price_id, stripe_price_id)
      VALUES (?, ?, 'pending_payment', NULL, NULL, NULL)
    `, [subscriptionId, organizationId])

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') invalid('Ya existe una cuenta con ese correo.', 409)
    throw error
  } finally {
    connection.release()
  }

  return { organizationId, subscriptionId, email, subscriptionStatus: 'pending_payment', planId: null }
}

async function resolvePlanPriceForCheckout(database, organizationId, requestedPlanId = null, requestedPriceId = null) {
  const environment = currentStripeEnvironment()
  if (requestedPlanId) {
    const normalizedPlanRef = String(requestedPlanId)
    const [rows] = await database.execute(`
      SELECT p.id AS planId, p.codigo AS planCode, p.nombre AS planName, pp.id AS priceId,
        pp.stripe_price_id AS stripePriceId, pp.environment, pp.amount, pp.currency,
        pp.interval_unit AS intervalUnit, pp.interval_count AS intervalCount
      FROM saas_plans p
      JOIN saas_plan_prices pp ON pp.plan_id = p.id
      WHERE (p.id = ? OR p.codigo = ?) AND p.estado = 'active' AND pp.status = 'active' AND pp.environment = ?
      ORDER BY pp.id DESC LIMIT 1
    `, [Number.isFinite(Number(normalizedPlanRef)) ? Number(normalizedPlanRef) : null, normalizedPlanRef, environment])
    if (rows[0]) return rows[0]
    return null
  }

  if (requestedPriceId) {
    const [rows] = await database.execute(`
      SELECT p.id AS planId, p.codigo AS planCode, p.nombre AS planName, pp.id AS priceId,
        pp.stripe_price_id AS stripePriceId, pp.environment, pp.amount, pp.currency,
        pp.interval_unit AS intervalUnit, pp.interval_count AS intervalCount
      FROM saas_plan_prices pp
      JOIN saas_plans p ON p.id = pp.plan_id
      WHERE pp.id = ? AND p.estado = 'active' AND pp.status = 'active' AND pp.environment = ?
      LIMIT 1
    `, [requestedPriceId, environment])
    if (rows[0]) return rows[0]
  }

  const [rows] = await database.execute(`
    SELECT p.id AS planId, p.codigo AS planCode, p.nombre AS planName, pp.id AS priceId,
      pp.stripe_price_id AS stripePriceId, pp.environment, pp.amount, pp.currency,
      pp.interval_unit AS intervalUnit, pp.interval_count AS intervalCount
      FROM subscriptions s
    LEFT JOIN saas_plans p ON p.id = s.saas_plan_id
      LEFT JOIN saas_plan_prices pp ON pp.plan_id = p.id AND pp.status = 'active' AND pp.environment = ?
    WHERE s.organization_id = ? AND s.status IN ('pending_payment', 'active', 'past_due')
    ORDER BY s.created_at DESC, pp.id DESC LIMIT 1
    `, [environment, organizationId])
  if (rows[0] && rows[0].stripePriceId) return rows[0]

  const [plans] = await database.execute(`
    SELECT p.id AS planId, p.codigo AS planCode, p.nombre AS planName, pp.id AS priceId,
      pp.stripe_price_id AS stripePriceId, pp.environment, pp.amount, pp.currency,
      pp.interval_unit AS intervalUnit, pp.interval_count AS intervalCount
    FROM saas_plans p
    JOIN saas_plan_prices pp ON pp.plan_id = p.id
    WHERE p.estado = 'active' AND pp.status = 'active' AND pp.environment = ?
    ORDER BY p.created_at DESC, pp.id DESC LIMIT 1
  `, [environment])
  return plans[0] || null
}

export async function createCheckoutSession(database, subscriptionId, details = {}, stripeClientOverride = null) {
  assertStripeSecret()
  const [subscriptions] = await database.execute(`
    SELECT id, organization_id AS organizationId, status, saas_plan_id AS saasPlanId,
      saas_plan_price_id AS saasPlanPriceId, stripe_price_id AS stripePriceId,
      stripe_checkout_session_id AS checkoutSessionId
    FROM subscriptions WHERE id = ? AND organization_id = ? LIMIT 1
  `, [subscriptionId, details.organizationId])
  const subscription = subscriptions[0]
  if (!subscription) invalid('No se encontró una suscripción pendiente para esta organización.', 404)
  if (subscription.status === 'active') invalid('La suscripción ya está activa.', 409)

  const requestedPlanId = details.planId || subscription.saasPlanId
  const plan = await resolvePlanPriceForCheckout(database, subscription.organizationId, requestedPlanId, subscription.saasPlanPriceId)
  const priceId = plan?.stripePriceId || (requestedPlanId ? null : subscription.stripePriceId || process.env.STRIPE_PRICE_ID)
  assertStripePrice(priceId)
  const stripeApi = stripeClientOverride || stripe()

  if (subscription.checkoutSessionId) {
    const existing = await stripeApi.checkout.sessions.retrieve(subscription.checkoutSessionId)
    if (existing.status === 'open' && existing.url) return { url: existing.url, planId: plan?.planCode || null }
  }

  const baseUrl = process.env.FRONTEND_ORIGIN || 'http://localhost:5188'
  const checkout = await stripeApi.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: details.email,
    client_reference_id: subscriptionId,
    metadata: {
      subscriptionId,
      organizationId: subscription.organizationId,
      planId: plan?.planCode || null,
      priceVersionId: plan?.priceId || null,
    },
    subscription_data: {
      metadata: {
        subscriptionId,
        organizationId: subscription.organizationId,
        planId: plan?.planCode || null,
        priceVersionId: plan?.priceId || null,
      },
    },
    success_url: `${baseUrl}/billing?checkout=success`,
    cancel_url: `${baseUrl}/login?checkout=cancelled`,
  })
  await database.execute(`
    UPDATE subscriptions SET stripe_checkout_session_id = ?, stripe_customer_id = ?,
      saas_plan_id = COALESCE(?, saas_plan_id), saas_plan_price_id = COALESCE(?, saas_plan_price_id),
      stripe_price_id = COALESCE(?, stripe_price_id)
    WHERE id = ? AND organization_id = ?
  `, [checkout.id, typeof checkout.customer === 'string' ? checkout.customer : null, plan?.planId || null, plan?.priceId || null, priceId, subscriptionId, subscription.organizationId])
  return { url: checkout.url, planId: plan?.planCode || null, checkoutSessionId: checkout.id }
}

export async function getOrganizationSubscription(database, organizationId, stripeClientOverride = null) {
  if (!organizationId) return { status: 'not_registered', activeModules: [] }
  const [subscriptions] = await database.execute(`
    SELECT s.id, s.status, s.current_period_start AS currentPeriodStart, s.current_period_end AS currentPeriodEnd,
      s.saas_plan_id AS saasPlanId,
      s.stripe_subscription_id AS stripeSubscriptionId,
      s.stripe_checkout_session_id AS stripeCheckoutSessionId,
      s.stripe_customer_id AS stripeCustomerId,
      p.codigo AS planCode, p.nombre AS planName,
      (s.current_period_end IS NULL OR s.current_period_end > UTC_TIMESTAMP()) AS periodValid,
      s.created_at AS createdAt,
      pp.id AS priceVersionId, pp.amount, pp.currency, pp.interval_unit AS intervalUnit, pp.interval_count AS intervalCount
    FROM subscriptions s
    LEFT JOIN saas_plans p ON p.id = s.saas_plan_id
    LEFT JOIN saas_plan_prices pp ON pp.id = s.saas_plan_price_id AND pp.status = 'active'
    WHERE s.organization_id = ?
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT 1
  `, [organizationId])
  const subscription = subscriptions[0]
  if (subscription && (subscription.stripeCheckoutSessionId || subscription.stripeSubscriptionId || subscription.stripeCustomerId) && (
    !subscription.currentPeriodStart || !subscription.currentPeriodEnd || subscription.status === 'pending_payment'
  )) {
    try {
      const stripeApi = stripeClientOverride || stripe()
      const checkoutSession = subscription.stripeCheckoutSessionId
        ? await stripeApi.checkout.sessions.retrieve(subscription.stripeCheckoutSessionId, { expand: ['subscription'] })
        : null
      let stripeSubscription = subscription.stripeSubscriptionId
        ? await stripeApi.subscriptions.retrieve(subscription.stripeSubscriptionId)
        : typeof checkoutSession?.subscription === 'string'
          ? await stripeApi.subscriptions.retrieve(checkoutSession.subscription)
          : checkoutSession?.subscription || null
      const checkoutCustomerId = typeof checkoutSession?.customer === 'string'
        ? checkoutSession.customer
        : checkoutSession?.customer?.id
      const stripeCustomerId = checkoutCustomerId || subscription.stripeCustomerId || null
      if (!stripeSubscription && stripeCustomerId) {
        stripeSubscription = (await stripeApi.subscriptions.list({ customer: stripeCustomerId, status: 'all', limit: 100 })).data
            .filter(({ status }) => ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(status))
            .sort((left, right) => (right.created || 0) - (left.created || 0))[0]
      }
      if (!stripeSubscription) throw new Error('Stripe customer has no subscription.')
      let invoice = typeof stripeSubscription.latest_invoice === 'object' ? stripeSubscription.latest_invoice : null
      if (!invoice && typeof stripeSubscription.latest_invoice === 'string' && stripeApi.invoices?.retrieve) {
        invoice = await stripeApi.invoices.retrieve(stripeSubscription.latest_invoice)
      }
      const period = subscriptionPeriod(stripeSubscription, invoice)
      const currentPeriodStart = unixDate(period.start)
      const currentPeriodEnd = unixDate(period.end)
      const status = stripeStatus(stripeSubscription.status)
      const stripeSubscriptionId = stripeSubscription.id || subscription.stripeSubscriptionId
      if (currentPeriodStart || currentPeriodEnd || status || stripeSubscriptionId) {
        await database.execute(`
          UPDATE subscriptions
          SET status = COALESCE(?, status), stripe_subscription_id = COALESCE(?, stripe_subscription_id),
            stripe_customer_id = COALESCE(?, stripe_customer_id),
            current_period_start = COALESCE(?, current_period_start),
            current_period_end = COALESCE(?, current_period_end)
          WHERE id = ? AND organization_id = ?
        `, [status, stripeSubscriptionId, stripeCustomerId, currentPeriodStart, currentPeriodEnd, subscription.id, organizationId])
        subscription.currentPeriodStart = currentPeriodStart || subscription.currentPeriodStart
        subscription.currentPeriodEnd = currentPeriodEnd || subscription.currentPeriodEnd
        subscription.stripeSubscriptionId = stripeSubscriptionId
        subscription.stripeCustomerId = stripeCustomerId
        subscription.status = status || subscription.status
        if (period.end !== null) subscription.periodValid = period.end > Date.now() / 1000 ? 1 : 0
      }
    } catch {
      // Keep subscription status available even if Stripe cannot be reached for date recovery.
    }
  }
  if (subscription?.status === 'active' && Number(subscription.periodValid) !== 1) subscription.status = 'expired'

  if (!subscription) return { status: 'pending_payment', activeModules: [] }
  const { stripeSubscriptionId, ...publicSubscription } = subscription

  let activeModules = []
  if (subscription.saasPlanId) {
    const [rows] = await database.execute(`
      SELECT feature_key AS featureKey
      FROM saas_plan_entitlements
      WHERE plan_id = ? AND enabled = 1
      ORDER BY feature_key
    `, [subscription.saasPlanId])
    activeModules = rows.map(({ featureKey }) => featureKey)
  }

  return {
    ...publicSubscription,
    periodSyncPending: Boolean(
      ['active', 'past_due', 'canceled'].includes(subscription.status)
      && (!subscription.currentPeriodStart || !subscription.currentPeriodEnd),
    ),
    activeModules,
    plan: subscription.planCode ? { id: subscription.planCode, name: subscription.planName || subscription.planCode } : null,
  }
}

function unixDate(value) {
  return Number.isFinite(value) ? new Date(value * 1000).toISOString().slice(0, 19).replace('T', ' ') : null
}

function subscriptionPeriod(subscription, invoice = null) {
  const items = subscription?.items?.data || []
  const invoiceLines = invoice?.lines?.data || []
  const itemStarts = items.map((item) => item.current_period_start).filter(Number.isFinite)
  const itemEnds = items.map((item) => item.current_period_end).filter(Number.isFinite)
  const lineStarts = invoiceLines.map((line) => line.period?.start).filter(Number.isFinite)
  const lineEnds = invoiceLines.map((line) => line.period?.end).filter(Number.isFinite)
  const starts = Number.isFinite(subscription?.current_period_start)
    ? [subscription.current_period_start]
    : itemStarts.length ? itemStarts : Number.isFinite(invoice?.period_start) ? [invoice.period_start] : lineStarts
  const ends = Number.isFinite(subscription?.current_period_end)
    ? [subscription.current_period_end]
    : itemEnds.length ? itemEnds : Number.isFinite(invoice?.period_end) ? [invoice.period_end] : lineEnds

  return {
    start: starts.length ? Math.min(...starts) : null,
    end: ends.length ? Math.max(...ends) : null,
  }
}

export async function processStripeWebhook(database, rawBody, signature) {
  assertStripeSecret()
  assertStripeWebhookSecret()
  const stripeApi = stripe()
  let event
  try {
    event = stripeApi.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    invalid('Firma de webhook inválida.', 400)
  }

  let subscriptionObject = null
  let invoiceObject = null
  let internalSubscriptionId = null
  let stripeSubscriptionId = null
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    internalSubscriptionId = session.metadata?.subscriptionId || session.client_reference_id
    stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  } else if (event.type.startsWith('customer.subscription.')) {
    subscriptionObject = event.data.object
    internalSubscriptionId = subscriptionObject.metadata?.subscriptionId
    stripeSubscriptionId = subscriptionObject.id
  } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    invoiceObject = event.data.object
    stripeSubscriptionId = invoiceObject.subscription || invoiceObject.parent?.subscription_details?.subscription
    if (stripeSubscriptionId) {
      subscriptionObject = await stripeApi.subscriptions.retrieve(stripeSubscriptionId)
      internalSubscriptionId = subscriptionObject.metadata?.subscriptionId
    }
  }

  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const [insertResult] = await connection.execute(
      'INSERT IGNORE INTO billing_webhook_events (id, event_type) VALUES (?, ?)',
      [event.id, event.type],
    )
    if (!insertResult.affectedRows) {
      await connection.commit()
      return { received: true, duplicate: true }
    }

    if (event.type === 'checkout.session.completed' && internalSubscriptionId) {
      const session = event.data.object
      await connection.execute(`
        UPDATE subscriptions SET stripe_subscription_id = ?, stripe_customer_id = ?
        WHERE id = ?
      `, [stripeSubscriptionId, typeof session.customer === 'string' ? session.customer : session.customer?.id, internalSubscriptionId])
    }

    let status
    if (event.type === 'invoice.paid') {
      status = subscriptionObject?.status === 'canceled' ? 'canceled'
        : subscriptionObject?.status === 'active' ? 'active' : 'pending_payment'
    }
    if (event.type === 'invoice.payment_failed') status = 'past_due'
    if (event.type === 'customer.subscription.updated') {
      status = ['past_due', 'unpaid'].includes(subscriptionObject.status) ? 'past_due'
        : ['canceled', 'incomplete_expired'].includes(subscriptionObject.status) ? 'canceled'
          : subscriptionObject.status === 'active' ? undefined : 'pending_payment'
    }
    if (event.type === 'customer.subscription.deleted') status = 'canceled'
    const period = subscriptionPeriod(subscriptionObject, invoiceObject)
    const periodStart = unixDate(period.start)
    const periodEnd = unixDate(period.end)
    if ((status || periodStart || periodEnd) && (internalSubscriptionId || stripeSubscriptionId)) {
      await connection.execute(`
        UPDATE subscriptions SET status = COALESCE(?, status), stripe_subscription_id = COALESCE(?, stripe_subscription_id),
          stripe_customer_id = COALESCE(?, stripe_customer_id),
          current_period_start = COALESCE(?, current_period_start), current_period_end = COALESCE(?, current_period_end)
        WHERE id = ? OR stripe_subscription_id = ?
      `, [
        status || null,
        stripeSubscriptionId,
        typeof subscriptionObject?.customer === 'string' ? subscriptionObject.customer : subscriptionObject?.customer?.id || null,
        periodStart,
        periodEnd,
        internalSubscriptionId,
        stripeSubscriptionId,
      ])
    }

    await connection.commit()
    return { received: true, duplicate: false }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

function stripeStatus(status) {
  if (['active', 'trialing'].includes(status)) return 'active'
  if (['past_due', 'unpaid'].includes(status)) return 'past_due'
  if (['canceled', 'incomplete_expired'].includes(status)) return 'canceled'
  if (status === 'incomplete') return 'pending_payment'
  return null
}