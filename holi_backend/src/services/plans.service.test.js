import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlan, createPlanPrice, listPlans, updatePlan, archivePlan } from './plans.service.js'

test('creating a plan stores per-module entitlements in the same transaction', async () => {
  const statements = []
  const connection = {
    async beginTransaction() { statements.push('begin') },
    async execute(sql, parameters) { statements.push({ sql, parameters }); return [{ insertId: 12, affectedRows: 1 }] },
    async commit() { statements.push('commit') },
    async rollback() { statements.push('rollback') },
    release() {},
  }
  const database = { async getConnection() { return connection } }
  const plan = await createPlan(database, {
    codigo: 'comunidad', nombre: 'Comunidad', descripcion: 'Plan base', estado: 'draft',
    entitlements: { events: true, locations: true },
  })

  assert.equal(plan.id, 12)
  assert.equal(plan.codigo, 'comunidad')
  assert.equal(plan.entitlements.events, true)
  assert.equal(plan.entitlements.members, false)
  assert.equal(statements[0], 'begin')
  assert.equal(statements.at(-1), 'commit')
  assert.equal(statements.filter((statement) => typeof statement === 'object' && statement.sql.includes('INSERT INTO saas_plan_entitlements')).length, 13)
  const legacyEntitlements = statements.filter((statement) => typeof statement === 'object'
    && statement.sql.includes('INSERT INTO saas_plan_entitlements')
    && ['calendar', 'meetings'].includes(statement.parameters[1]))
  assert.deepEqual(legacyEntitlements.map(({ parameters }) => parameters.slice(1)), [
    ['calendar', 0], ['meetings', 0],
  ])
})

test('invalid plan input is rejected before acquiring a connection', async () => {
  const database = { async getConnection() { throw new Error('Must validate before acquiring a connection') } }
  await assert.rejects(createPlan(database, { codigo: 'x', nombre: '', estado: 'unknown' }), { status: 400 })
})

test('plan update preserves missing fields and archives rather than physically deleting', async () => {
  const calls = []
  const database = {
    async execute(sql, parameters) {
      calls.push({ sql, parameters })
      if (sql.includes('SELECT id, codigo, nombre, descripcion, estado')) return [[{ id: 4, codigo: 'pro', nombre: 'Pro', descripcion: 'Existente', estado: 'active' }]]
      if (sql.includes('SELECT plans.id')) return [[{ id: 4, codigo: 'pro', nombre: 'Pro Plus', descripcion: 'Existente', estado: 'active', stripeConfigured: 0 }]]
      if (sql.includes('SELECT feature_key')) return [[{ featureKey: 'calendar', enabled: 1 }]]
      return [{ affectedRows: 1 }]
    },
    async getConnection() {
      return {
        async beginTransaction() {}, async execute(sql, parameters) { calls.push({ sql, parameters }); return [{ affectedRows: 1 }] },
        async commit() {}, async rollback() {}, release() {},
      }
    },
  }
  const result = await updatePlan(database, 4, { nombre: 'Pro Plus' })
  assert.equal(result.nombre, 'Pro Plus')
  assert.equal(calls.find(({ sql }) => sql.includes('UPDATE saas_plans')).parameters[2], 'Existente')

  await archivePlan(database, 4)
  assert.ok(calls.some(({ sql }) => sql.includes("SET estado = 'archived'")))
})

test('price creation asks Stripe to create a recurring price and stores a new active version', async () => {
  const calls = []
  const database = {
    async execute(sql, parameters) {
      calls.push({ sql, parameters })
      if (sql.includes('SELECT id, codigo, nombre, descripcion, estado')) return [[{ id: 3, codigo: 'pro', nombre: 'Pro', descripcion: null, estado: 'draft' }]]
      if (sql.includes('FROM saas_plan_prices WHERE id')) return [[{ id: 31, planId: 3, status: 'active', stripeConfigured: 1 }]]
      return [{ affectedRows: 1 }]
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async execute(sql, parameters) { calls.push({ sql, parameters }); return [{ insertId: 31, affectedRows: 1 }] },
        async commit() {}, async rollback() {}, release() {},
      }
    },
  }
  const stripe = {
    apiKey: 'sk_test_mock',
    products: { async create(input) { calls.push({ product: input }); return { id: 'prod_test' } } },
    prices: { async create(input) { calls.push({ stripePrice: input }); return { id: 'price_test' } } },
  }
  const result = await createPlanPrice(database, 3, {
    amount: 299.5, currency: 'mxn', interval_unit: 'month', interval_count: 1,
    stripe_price_id: 'price-controlled-by-client',
  }, stripe, 'test')

  assert.equal(result.stripeConfigured, true)
  assert.equal(calls.find(({ stripePrice }) => stripePrice)?.stripePrice.unit_amount, 29950)
  assert.equal(calls.find(({ stripePrice }) => stripePrice)?.stripePrice.currency, 'mxn')
  assert.equal(calls.find(({ sql }) => sql?.includes('INSERT INTO saas_plan_prices')).parameters[6], 'price_test')
})

test('plan listing returns a normalized entitlement map and current price data', async () => {
  const database = {
    async execute(sql) {
      if (sql.includes('SELECT plans.id')) return [[{
        id: 2, codigo: 'pro', nombre: 'Pro', estado: 'active', amount: '450.00',
        currency: 'MXN', intervalUnit: 'month', intervalCount: 1, priceStatus: 'active', stripeConfigured: 1,
      }]]
      if (sql.includes('SELECT feature_key')) return [[{ featureKey: 'events', enabled: 1 }]]
      return [[]]
    },
  }
  const [plan] = await listPlans(database, { environment: 'test' })
  assert.equal(plan.entitlements.events, true)
  assert.equal('calendar' in plan.entitlements, false)
  assert.equal(plan.amount, '450.00')
})