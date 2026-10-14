import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createOrganizationAdCheckout,
  getAdDisplaySettings,
  getAdPricing,
  listOrganizationAds,
  reconcilePaidOrganizationAdOrder,
  retryOrganizationAdOrder,
  updateAdDisplaySettings,
  validateAdRefreshInterval,
  validateAdDays,
  validateAdPricing,
} from './ad-purchases.service.js'

process.env.STRIPE_SECRET_KEY = 'sk_test_ads_checkout'

test('advertising duration accepts whole days up to one year', () => {
  assert.equal(validateAdDays('30'), 30)
  assert.equal(validateAdDays(365), 365)
})

test('advertising duration rejects fractional, zero, and excessive days', () => {
  for (const days of [0, -1, 1.5, 366, 'not-a-number']) {
    assert.throws(() => validateAdDays(days), { status: 400 })
  }
})

test('daily pricing converts configured major units into Stripe minor units', () => {
  assert.deepEqual(validateAdPricing({ pricePerDay: '12.34', currency: 'mxn' }), { amountMinor: 1234, currency: 'MXN' })
})

test('daily pricing rejects zero, excessive, and unsupported values', () => {
  assert.throws(() => validateAdPricing({ pricePerDay: 0, currency: 'MXN' }), { status: 400 })
  assert.throws(() => validateAdPricing({ pricePerDay: 100001, currency: 'MXN' }), { status: 400 })
  assert.throws(() => validateAdPricing({ pricePerDay: 10, currency: 'EUR' }), { status: 400 })
})

test('organization ad listing scopes campaigns and payment history to its tenant', async () => {
  const calls = []
  const database = {
    async execute(sql, parameters) {
      calls.push({ sql, parameters })
      return [[]]
    },
  }
  const result = await listOrganizationAds(database, 'org-north')
  assert.deepEqual(result, { campaigns: [], orders: [] })
  assert.equal(calls.length, 2)
  assert.ok(calls.every(({ parameters }) => parameters[0] === 'org-north'))
  assert.match(calls[1].sql, /ad_purchase_orders\.id/)
  assert.match(calls[1].sql, /ad_purchase_orders\.created_at/)
  assert.match(calls[1].sql, /ads\.headline AS campaignHeadline/)
})

test('organization ad checkout uses server pricing and creates an order before Stripe redirect', async () => {
  const calls = []
  const database = {
    async execute(sql, parameters) {
      calls.push({ sql, parameters })
      if (sql.includes('SELECT setting_value')) return [[{ settingValue: { amountMinor: 1250, currency: 'MXN' } }]]
      return [{ affectedRows: 1 }]
    },
  }
  let stripeRequest
  const stripe = {
    checkout: { sessions: { async create(input) {
      stripeRequest = input
      return { id: 'cs_ads_order', url: 'https://checkout.stripe.test/ad' }
    } } },
  }

  const result = await createOrganizationAdCheckout(database, {
    id: 'admin-1', email: 'admin@example.test', organizationId: 'org-north',
  }, {
    days: 3,
    campaign: {
      brandName: 'Congregación Norte', headline: 'Encuentro abierto', body: 'Ven a compartir.',
      ctaLabel: 'Conocer más', destinationUrl: 'https://example.test', placement: 'profile',
    },
  }, stripe)

  assert.equal(result.url, 'https://checkout.stripe.test/ad')
  assert.equal(result.amountMinor, 3750)
  assert.equal(stripeRequest.mode, 'payment')
  assert.equal(stripeRequest.line_items[0].price_data.unit_amount, 3750)
  assert.equal(stripeRequest.metadata.organizationId, 'org-north')
  assert.ok(calls.some(({ sql }) => sql.includes('INSERT INTO ad_purchase_orders')))
})

test('a created Stripe session leaves its order pending if saving the session ID fails', async () => {
  const calls = []
  const database = {
    async execute(sql) {
      calls.push(sql)
      if (sql.includes('SELECT setting_value')) return [[{ settingValue: { amountMinor: 1250, currency: 'MXN' } }]]
      if (sql.includes('UPDATE ad_purchase_orders SET stripe_checkout_session_id')) throw new Error('temporary database failure')
      return [{ affectedRows: 1 }]
    },
  }
  const stripe = { checkout: { sessions: { async create() {
    return { id: 'cs_recoverable', url: 'https://checkout.stripe.test/recoverable' }
  } } } }

  await assert.rejects(createOrganizationAdCheckout(database, {
    id: 'admin-1', email: 'admin@example.test', organizationId: 'org-north',
  }, {
    days: 2,
    campaign: {
      brandName: 'Congregación Norte', headline: 'Encuentro abierto', body: 'Ven a compartir.',
      ctaLabel: 'Conocer más', destinationUrl: 'https://example.test', placement: 'profile',
    },
  }, stripe), /temporary database failure/)
  assert.equal(calls.some((sql) => sql.includes("SET status = 'failed'")), false)
})

test('retry reopens the same Stripe checkout when its session is still open', async () => {
  let createCalls = 0
  const database = { async execute(sql, parameters) {
    if (sql.includes('FROM ad_purchase_orders')) return [[{
      id: 'order-open', campaignId: 'campaign-1', organizationId: 'org-north',
      daysPurchased: 5, amountMinor: 5000, currency: 'MXN', status: 'pending',
      stripeCheckoutSessionId: 'cs_open',
    }]]
    assert.fail(`Unexpected database write for an open session: ${sql} ${parameters}`)
  } }
  const stripe = { checkout: { sessions: {
    async retrieve(id) { assert.equal(id, 'cs_open'); return { id, status: 'open', url: 'https://checkout.stripe.test/open' } },
    async create() { createCalls += 1; throw new Error('Should reuse the existing session') },
  } } }

  const result = await retryOrganizationAdOrder(database, { organizationId: 'org-north', email: 'admin@example.test' }, 'order-open', stripe)
  assert.deepEqual(result, { id: 'cs_open', url: 'https://checkout.stripe.test/open', orderId: 'order-open', reused: true })
  assert.equal(createCalls, 0)
})

test('retry renews an expired checkout session without changing the existing order', async () => {
  const writes = []
  const order = {
    id: 'order-expired', campaignId: 'campaign-2', organizationId: 'org-north',
    daysPurchased: 12, amountMinor: 15000, currency: 'MXN', status: 'expired',
    stripeCheckoutSessionId: 'cs_expired',
  }
  const database = { async execute(sql, parameters) {
    if (sql.includes('FROM ad_purchase_orders')) return [[order]]
    writes.push({ sql, parameters })
    if (sql.includes("SET status = 'retrying'")) {
      order.status = 'retrying'
      order.stripeCheckoutSessionId = null
      return [{ affectedRows: 1 }]
    }
    if (sql.includes("SET status = 'pending'")) {
      order.status = 'pending'
      order.stripeCheckoutSessionId = parameters[0]
      return [{ affectedRows: 1 }]
    }
    assert.fail(`Unexpected database query: ${sql}`)
  } }
  let checkoutRequest
  const stripe = { checkout: { sessions: {
    async retrieve(id) { assert.equal(id, 'cs_expired'); return { id, status: 'expired', url: null } },
    async create(request) {
      checkoutRequest = request
      return { id: 'cs_retried', url: 'https://checkout.stripe.test/retried' }
    },
  } } }

  const result = await retryOrganizationAdOrder(database, { organizationId: 'org-north', email: 'admin@example.test' }, 'order-expired', stripe)
  assert.equal(result.orderId, 'order-expired')
  assert.equal(result.id, 'cs_retried')
  assert.equal(checkoutRequest.client_reference_id, 'order-expired')
  assert.equal(checkoutRequest.line_items[0].price_data.unit_amount, 15000)
  assert.equal(checkoutRequest.metadata.days, '12')
  assert.equal(order.status, 'pending')
  assert.equal(order.stripeCheckoutSessionId, 'cs_retried')
  assert.equal(writes.some(({ sql }) => sql.includes('INSERT INTO ad_purchase_orders')), false)
})

test('retry cannot access another congregation order or retry a paid order', async () => {
  const database = { async execute(sql, parameters) {
    assert.deepEqual(parameters, ['order-private', 'org-one'])
    return [[]]
  } }
  await assert.rejects(retryOrganizationAdOrder(database, { organizationId: 'org-one' }, 'order-private'), { status: 404 })
  const paidDatabase = { async execute() { return [[{ id: 'order-paid', organizationId: 'org-one', status: 'paid' }]] } }
  await assert.rejects(retryOrganizationAdOrder(paidDatabase, { organizationId: 'org-one' }, 'order-paid'), { status: 409 })
})

test('Stripe reconciliation activates a paid order and adds purchased days once', async () => {
  const order = {
    id: 'order-paid-reconcile', campaignId: 'campaign-paid', organizationId: 'org-north',
    daysPurchased: 8, amountMinor: 8000, currency: 'MXN', status: 'pending',
    stripeCheckoutSessionId: 'cs_paid_reconcile',
  }
  const writes = []
  const connection = {
    async beginTransaction() {},
    async execute(sql, parameters) {
      writes.push({ sql, parameters })
      if (sql.includes('SELECT') && sql.includes('FOR UPDATE')) return [[order]]
      if (sql.includes('UPDATE ad_purchase_orders')) return [{ affectedRows: 1 }]
      if (sql.includes('UPDATE brand_ads')) return [{ affectedRows: 1 }]
      assert.fail(`Unexpected transaction query: ${sql}`)
    },
    async commit() {}, async rollback() {}, release() {},
  }
  let openedTransaction = false
  const database = {
    async execute(sql, parameters) {
      assert.match(sql, /organization_id = \? LIMIT 1/)
      assert.deepEqual(parameters, [order.id, order.organizationId])
      return [[order]]
    },
    async getConnection() { openedTransaction = true; return connection },
  }
  const stripe = { checkout: { sessions: { async retrieve(id) {
    assert.equal(id, order.stripeCheckoutSessionId)
    return {
      id, mode: 'payment', status: 'complete', payment_status: 'paid',
      amount_total: 8000, currency: 'mxn', payment_intent: 'pi_reconcile',
      metadata: { adOrderId: order.id, organizationId: order.organizationId },
    }
  } } } }

  const result = await reconcilePaidOrganizationAdOrder(database, { organizationId: 'org-north' }, order.id, stripe)
  assert.deepEqual(result, { paid: true, alreadyPaid: false })
  assert.equal(openedTransaction, true)
  const activation = writes.find(({ sql }) => sql.includes('UPDATE brand_ads'))
  assert.ok(activation)
  assert.deepEqual(activation.parameters, [8, 8, 'campaign-paid', 'org-north'])
})

test('public rotation interval accepts bounded whole seconds', () => {
  assert.equal(validateAdRefreshInterval('15'), 15)
  assert.equal(validateAdRefreshInterval(3600), 3600)
  for (const interval of [14, 3601, 15.5, 'fast']) {
    assert.throws(() => validateAdRefreshInterval(interval), { status: 400 })
  }
})

test('global public-ad refresh interval defaults to one minute and persists the superadmin setting', async () => {
  let storedSetting = null
  const database = {
    async execute(sql, parameters) {
      if (sql.includes('SELECT setting_value')) return [[storedSetting ? { settingValue: storedSetting } : undefined].filter(Boolean)]
      if (sql.includes('INSERT INTO app_settings')) {
        storedSetting = JSON.parse(parameters[1])
        return [{ affectedRows: 1 }]
      }
      assert.fail(`Unexpected database query: ${sql}`)
    },
  }

  assert.deepEqual(await getAdDisplaySettings(database), { refreshIntervalSeconds: 60 })
  assert.deepEqual(await updateAdDisplaySettings(database, 'superadmin-1', { refreshIntervalSeconds: 45 }), { refreshIntervalSeconds: 45 })
  assert.deepEqual(storedSetting, { refreshIntervalSeconds: 45 })
  await assert.rejects(updateAdDisplaySettings(database, 'superadmin-1', { refreshIntervalSeconds: 5 }), { status: 400 })
})