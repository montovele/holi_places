import { legacyAgendaModuleIds, moduleIds } from './modules.service.js'

const planStates = new Set(['draft', 'active', 'archived'])
const intervals = new Set(['month', 'year'])

function invalid(message, status = 400, code = 'INVALID_PLAN') {
  const error = new Error(message)
  error.status = status
  error.code = code
  throw error
}

function normalizePlan(input = {}) {
  const codigo = typeof input.codigo === 'string' ? input.codigo.trim().toLowerCase() : ''
  const nombre = typeof input.nombre === 'string' ? input.nombre.trim() : ''
  const descripcion = typeof input.descripcion === 'string' ? input.descripcion.trim() : ''
  const estado = input.estado === undefined ? 'draft' : input.estado
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(codigo)) invalid('El código debe tener entre 2 y 64 caracteres e incluir solo letras, números, guiones o guiones bajos.')
  if (!nombre || nombre.length > 120) invalid('El nombre del plan es obligatorio y no puede superar 120 caracteres.')
  if (!planStates.has(estado)) invalid('El estado del plan no es válido.')
  return { codigo, nombre, descripcion: descripcion || null, estado }
}

function normalizeEntitlements(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Los módulos habilitados deben enviarse como un objeto.')
  const unknown = Object.keys(input).filter((key) => !moduleIds.includes(key) && !legacyAgendaModuleIds.includes(key))
  if (unknown.length) invalid(`Módulo no reconocido: ${unknown[0]}.`)
  return Object.fromEntries(moduleIds.map((moduleId) => [
    moduleId,
    moduleId === 'events'
      ? input.events === true || legacyAgendaModuleIds.some((legacyId) => input[legacyId] === true)
      : input[moduleId] === true,
  ]))
}

function normalizePrice(input = {}, environment) {
  const amount = Number(input.amount)
  const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : ''
  const intervalUnit = input.interval_unit
  const intervalCount = Number(input.interval_count ?? 1)
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
    invalid('El precio debe ser mayor que cero y tener como máximo dos decimales.')
  }
  if (!/^[A-Z]{3}$/.test(currency)) invalid('La moneda debe ser un código ISO de tres letras, por ejemplo MXN.')
  if (!intervals.has(intervalUnit)) invalid('La periodicidad debe ser mensual o anual.')
  if (!Number.isInteger(intervalCount) || intervalCount < 1 || intervalCount > 12) invalid('El intervalo debe ser un entero entre 1 y 12.')
  return { amount, currency, intervalUnit, intervalCount, environment }
}

function currentEnvironment() {
  return process.env.STRIPE_ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'live' : 'test')
}

function stripeEnvironment(stripe) {
  const key = stripe?.apiKey || process.env.STRIPE_SECRET_KEY || ''
  return key.startsWith('sk_live_') ? 'live' : 'test'
}

async function requirePlan(database, planId) {
  const [rows] = await database.execute('SELECT id, codigo, nombre, descripcion, estado FROM saas_plans WHERE id = ? LIMIT 1', [planId])
  if (!rows[0]) invalid('El plan no existe.', 404, 'PLAN_NOT_FOUND')
  return rows[0]
}

async function replaceEntitlements(connection, planId, entitlements) {
  const storedEntitlements = {
    ...entitlements,
    ...Object.fromEntries(legacyAgendaModuleIds.map((moduleId) => [moduleId, false])),
  }
  for (const [featureKey, enabled] of Object.entries(storedEntitlements)) {
    await connection.execute(`
      INSERT INTO saas_plan_entitlements (plan_id, feature_key, enabled)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)
    `, [planId, featureKey, enabled ? 1 : 0])
  }
}

async function entitlementsForPlan(database, planId) {
  const [rows] = await database.execute(
    'SELECT feature_key AS featureKey, enabled FROM saas_plan_entitlements WHERE plan_id = ?',
    [planId],
  )
  const saved = new Map(rows.map(({ featureKey, enabled }) => [featureKey, Number(enabled) === 1]))
  const agendaEnabled = ['events', ...legacyAgendaModuleIds].some((moduleId) => saved.get(moduleId) === true)
  return Object.fromEntries(moduleIds.map((moduleId) => [
    moduleId,
    moduleId === 'events' ? agendaEnabled : saved.get(moduleId) || false,
  ]))
}

export async function listPlans(database, { environment = currentEnvironment(), estado = null } = {}) {
  const parameters = [environment]
  const stateClause = estado ? 'WHERE plans.estado = ?' : ''
  if (estado) parameters.push(estado)
  const [rows] = await database.execute(`
    SELECT plans.id, plans.codigo, plans.nombre, plans.descripcion, plans.estado,
      plans.created_at AS createdAt, plans.updated_at AS updatedAt,
      prices.id AS priceVersionId, prices.amount, prices.currency,
      prices.interval_unit AS intervalUnit, prices.interval_count AS intervalCount,
      prices.status AS priceStatus,
      (prices.stripe_price_id IS NOT NULL) AS stripeConfigured
    FROM saas_plans AS plans
    LEFT JOIN saas_plan_prices AS prices
      ON prices.plan_id = plans.id AND prices.environment = ? AND prices.status = 'active'
    ${stateClause}
    ORDER BY plans.created_at DESC, plans.id DESC
  `, parameters)
  const plans = []
  for (const row of rows) {
    plans.push({
      ...row,
      stripeConfigured: Number(row.stripeConfigured) === 1,
      entitlements: await entitlementsForPlan(database, row.id),
    })
  }
  return plans
}

export async function getPlan(database, planId, environment = currentEnvironment()) {
  const plans = await listPlans(database, { environment })
  return plans.find(({ id, codigo }) => String(id) === String(planId) || codigo === String(planId)) || null
}

export async function createPlan(database, input = {}) {
  const plan = normalizePlan(input)
  const entitlements = normalizeEntitlements(input.entitlements || {})
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const [result] = await connection.execute(
      'INSERT INTO saas_plans (codigo, nombre, descripcion, estado) VALUES (?, ?, ?, ?)',
      [plan.codigo, plan.nombre, plan.descripcion, plan.estado],
    )
    await replaceEntitlements(connection, result.insertId, entitlements)
    await connection.commit()
    return { id: result.insertId, ...plan, entitlements, priceVersionId: null, amount: null, currency: null, intervalUnit: null, intervalCount: null, priceStatus: null, stripeConfigured: false }
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') invalid('Ya existe un plan con ese código.', 409, 'PLAN_CODE_EXISTS')
    throw error
  } finally {
    connection.release()
  }
}

export async function updatePlan(database, planId, input = {}) {
  const existing = await requirePlan(database, planId)
  const values = normalizePlan({ ...existing, ...input })
  const hasEntitlements = Object.prototype.hasOwnProperty.call(input, 'entitlements')
  const entitlements = hasEntitlements ? normalizeEntitlements(input.entitlements) : null
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const [result] = await connection.execute(`
      UPDATE saas_plans SET codigo = ?, nombre = ?, descripcion = ?, estado = ? WHERE id = ?
    `, [values.codigo, values.nombre, values.descripcion, values.estado, existing.id])
    if (!result.affectedRows) invalid('El plan no existe.', 404, 'PLAN_NOT_FOUND')
    if (entitlements) await replaceEntitlements(connection, existing.id, entitlements)
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') invalid('Ya existe un plan con ese código.', 409, 'PLAN_CODE_EXISTS')
    throw error
  } finally {
    connection.release()
  }
  return getPlan(database, existing.id)
}

export async function archivePlan(database, planId) {
  const existing = await requirePlan(database, planId)
  await database.execute("UPDATE saas_plans SET estado = 'archived' WHERE id = ?", [existing.id])
  return getPlan(database, existing.id)
}

export async function listPlanPrices(database, planId, environment = currentEnvironment()) {
  const plan = await requirePlan(database, planId)
  const [rows] = await database.execute(`
    SELECT id, plan_id AS planId, environment, amount, currency,
      interval_unit AS intervalUnit, interval_count AS intervalCount,
      status, (stripe_price_id IS NOT NULL) AS stripeConfigured,
      created_at AS createdAt
    FROM saas_plan_prices WHERE plan_id = ? AND environment = ? ORDER BY id DESC
  `, [plan.id, environment])
  return rows.map((row) => ({ ...row, stripeConfigured: Number(row.stripeConfigured) === 1 }))
}

export async function createPlanPrice(database, planId, input = {}, stripeClient = null, environment = currentEnvironment()) {
  const plan = await requirePlan(database, planId)
  if (plan.estado === 'archived') invalid('No se pueden cambiar precios de un plan archivado.', 409, 'PLAN_ARCHIVED')
  const price = normalizePrice(input, stripeClient ? stripeEnvironment(stripeClient) : environment)
  if (!stripeClient) invalid('Stripe no está configurado; no se puede crear un precio contratable.', 503, 'STRIPE_UNAVAILABLE')

  const product = await stripeClient.products.create({
    name: plan.nombre,
    description: plan.descripcion || undefined,
    metadata: { holi_plan_id: String(plan.id), holi_plan_code: plan.codigo },
  })
  const stripePrice = await stripeClient.prices.create({
    product: product.id,
    unit_amount: Math.round(price.amount * 100),
    currency: price.currency.toLowerCase(),
    recurring: { interval: price.intervalUnit, interval_count: price.intervalCount },
    metadata: { holi_plan_id: String(plan.id), environment: price.environment },
  })

  const connection = await database.getConnection()
  let priceVersionId
  try {
    await connection.beginTransaction()
    await connection.execute(`
      UPDATE saas_plan_prices SET status = 'archived'
      WHERE plan_id = ? AND environment = ? AND status = 'active'
    `, [plan.id, price.environment])
    const [result] = await connection.execute(`
      INSERT INTO saas_plan_prices
        (plan_id, environment, amount, currency, interval_unit, interval_count, stripe_price_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `, [plan.id, price.environment, price.amount, price.currency, price.intervalUnit, price.intervalCount, stripePrice.id])
    priceVersionId = result.insertId
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
  const [rows] = await database.execute(`
    SELECT id, plan_id AS planId, environment, amount, currency,
      interval_unit AS intervalUnit, interval_count AS intervalCount, status,
      (stripe_price_id IS NOT NULL) AS stripeConfigured, created_at AS createdAt
    FROM saas_plan_prices WHERE id = ?
  `, [priceVersionId])
  return { ...rows[0], stripeConfigured: true }
}

export async function publicPlans(database, environment = currentEnvironment()) {
  const plans = await listPlans(database, { environment, estado: 'active' })
  return plans.filter((plan) => plan.priceStatus === 'active')
}

export const planModuleIds = moduleIds
