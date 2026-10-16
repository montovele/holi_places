import { randomUUID } from 'node:crypto'

function invalid(message, status = 400) {
  const error = new Error(message)
  error.status = status
  throw error
}

function normalizeSubscriptionInput(input = {}) {
  const organizationId = typeof input.organizationId === 'string' ? input.organizationId.trim() : ''
  const planId = Number(input.planId)
  const startsAt = typeof input.startsAt === 'string' ? input.startsAt.trim() : ''
  const endsAt = typeof input.endsAt === 'string' ? input.endsAt.trim() : ''
  const datePattern = /^\d{4}-\d{2}-\d{2}$/

  if (!organizationId || organizationId.length > 64) invalid('Selecciona una congregación válida.')
  if (!Number.isSafeInteger(planId) || planId < 1) invalid('Selecciona un plan SaaS válido.')
  const validDate = (value) => {
    if (!datePattern.test(value)) return false
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }
  if (!validDate(startsAt) || !validDate(endsAt)) {
    invalid('Indica fechas de vigencia válidas.')
  }
  if (startsAt > new Date().toISOString().slice(0, 10)) invalid('La vigencia no puede comenzar en una fecha futura.')
  if (endsAt <= new Date().toISOString().slice(0, 10) || endsAt <= startsAt) {
    invalid('La fecha de fin debe ser posterior a hoy y a la fecha de inicio.')
  }

  return { organizationId, planId, startsAt, endsAt }
}

function currentEnvironment() {
  return process.env.STRIPE_ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'live' : 'test')
}

function mysqlDate(date, endOfDay = false) {
  return `${date} ${endOfDay ? '23:59:59' : '00:00:00'}`
}

async function activePlan(database, planId, environment) {
  const [plans] = await database.execute(`
    SELECT plans.id, prices.id AS priceVersionId
    FROM saas_plans AS plans
    LEFT JOIN saas_plan_prices AS prices
      ON prices.plan_id = plans.id AND prices.environment = ? AND prices.status = 'active'
    WHERE plans.id = ? AND plans.estado = 'active'
    ORDER BY prices.id DESC
    LIMIT 1
  `, [environment, planId])
  if (!plans[0]) invalid('El plan seleccionado no existe o no está publicado.', 404)
  return plans[0]
}

export async function listSaasSubscriptions(database) {
  const [rows] = await database.execute(`
    SELECT s.id, s.organization_id AS organizationId, organizations.name AS organizationName,
      organizations.slug AS organizationSlug, s.status,
      CASE WHEN s.status = 'active' AND s.current_period_end <= UTC_TIMESTAMP() THEN 'expired'
        ELSE s.status END AS effectiveStatus,
      s.saas_plan_id AS planId, plans.codigo AS planCode, plans.nombre AS planName,
      s.saas_plan_price_id AS priceVersionId, prices.amount, prices.currency,
      prices.interval_unit AS intervalUnit, prices.interval_count AS intervalCount,
      s.current_period_start AS startsAt, s.current_period_end AS endsAt,
      s.created_at AS createdAt,
      (s.stripe_subscription_id IS NOT NULL OR s.stripe_checkout_session_id IS NOT NULL
        OR s.stripe_customer_id IS NOT NULL) AS stripeManaged
    FROM subscriptions AS s
    JOIN organizations ON organizations.id = s.organization_id
    LEFT JOIN saas_plans AS plans ON plans.id = s.saas_plan_id
    LEFT JOIN saas_plan_prices AS prices ON prices.id = s.saas_plan_price_id
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT 1000
  `)
  return rows.map((row) => ({ ...row, stripeManaged: Number(row.stripeManaged) === 1 }))
}

export async function assignSaasSubscription(database, input = {}) {
  const values = normalizeSubscriptionInput(input)
  const connection = await database.getConnection()
  const environment = currentEnvironment()

  try {
    await connection.beginTransaction()
    const [organizations] = await connection.execute(
      'SELECT id FROM organizations WHERE id = ? LIMIT 1 FOR UPDATE',
      [values.organizationId],
    )
    if (!organizations[0]) invalid('La congregación seleccionada no existe.', 404)

    const [stripeSubscriptions] = await connection.execute(`
      SELECT id FROM subscriptions
      WHERE organization_id = ? AND (
        stripe_subscription_id IS NOT NULL OR stripe_checkout_session_id IS NOT NULL
        OR stripe_customer_id IS NOT NULL
      )
      LIMIT 1 FOR UPDATE
    `, [values.organizationId])
    if (stripeSubscriptions.length) {
      invalid('Esta congregación tiene una suscripción vinculada a Stripe. Adminístrala desde Stripe antes de asignar un acceso manual.', 409)
    }

    const plan = await activePlan(connection, values.planId, environment)
    const [existingSubscriptions] = await connection.execute(`
      SELECT id, status, current_period_end AS endsAt,
        (current_period_end > UTC_TIMESTAMP()) AS periodValid
      FROM subscriptions
      WHERE organization_id = ? AND stripe_subscription_id IS NULL
        AND stripe_checkout_session_id IS NULL AND stripe_customer_id IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1 FOR UPDATE
    `, [values.organizationId])
    const existing = existingSubscriptions[0]
    const reusable = existing && (
      existing.status === 'pending_payment'
      || (existing.status === 'active' && Number(existing.periodValid) === 1)
    )

    let subscriptionId
    if (reusable) {
      subscriptionId = existing.id
      await connection.execute(`
        UPDATE subscriptions SET status = 'active', saas_plan_id = ?, saas_plan_price_id = ?,
          stripe_price_id = NULL, current_period_start = ?, current_period_end = ?
        WHERE id = ? AND organization_id = ?
      `, [
        plan.id, plan.priceVersionId, mysqlDate(values.startsAt), mysqlDate(values.endsAt, true),
        subscriptionId, values.organizationId,
      ])
    } else {
      subscriptionId = `sub-${randomUUID()}`
      await connection.execute(`
        INSERT INTO subscriptions
          (id, organization_id, status, saas_plan_id, saas_plan_price_id,
            current_period_start, current_period_end)
        VALUES (?, ?, 'active', ?, ?, ?, ?)
      `, [
        subscriptionId, values.organizationId, plan.id, plan.priceVersionId,
        mysqlDate(values.startsAt), mysqlDate(values.endsAt, true),
      ])
    }

    await connection.commit()
    return { id: subscriptionId, ...values, status: 'active', planId: plan.id, stripeManaged: false }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function updateManualSaasSubscription(database, subscriptionId, input = {}) {
  const id = typeof subscriptionId === 'string' ? subscriptionId.trim() : ''
  if (!id || id.length > 64) invalid('La suscripción seleccionada no es válida.')
  const values = normalizeSubscriptionInput(input)
  const status = input.status === undefined ? 'active' : input.status
  if (!['active', 'canceled'].includes(status)) invalid('El estado de la suscripción no es válido.')

  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const [subscriptions] = await connection.execute(`
      SELECT id FROM subscriptions
      WHERE id = ? AND organization_id = ? LIMIT 1 FOR UPDATE
    `, [id, values.organizationId])
    if (!subscriptions[0]) invalid('No se encontró la suscripción.', 404)

    const [stripeReferences] = await connection.execute(`
      SELECT id FROM subscriptions
      WHERE id = ? AND (
        stripe_subscription_id IS NOT NULL OR stripe_checkout_session_id IS NOT NULL
        OR stripe_customer_id IS NOT NULL
      )
      LIMIT 1
    `, [id])
    if (stripeReferences.length) {
      invalid('Esta suscripción se administra desde Stripe y no puede modificarse manualmente.', 409)
    }

    const plan = await activePlan(connection, values.planId, currentEnvironment())
    await connection.execute(`
      UPDATE subscriptions SET status = ?, saas_plan_id = ?, saas_plan_price_id = ?,
        stripe_price_id = NULL, current_period_start = ?, current_period_end = ?
      WHERE id = ? AND organization_id = ?
    `, [
      status, plan.id, plan.priceVersionId, mysqlDate(values.startsAt), mysqlDate(values.endsAt, true),
      id, values.organizationId,
    ])
    await connection.commit()
    return { id, ...values, status, planId: plan.id, stripeManaged: false }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
