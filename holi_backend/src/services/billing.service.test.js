import assert from 'node:assert/strict'
import test from 'node:test'
import Stripe from 'stripe'
import { createCheckoutSession, getOrganizationSubscription, processStripeWebhook, registerCongregation } from './billing.service.js'

process.env.STRIPE_SECRET_KEY = 'sk_test_fake'
process.env.STRIPE_PRICE_ID = 'price_test_monthly'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'

test('congregation registration creates a pending account without starting Stripe Checkout', async () => {
  const previousSecret = process.env.STRIPE_SECRET_KEY
  const previousPrice = process.env.STRIPE_PRICE_ID
  delete process.env.STRIPE_SECRET_KEY
  delete process.env.STRIPE_PRICE_ID
  const calls = []
  const connection = {
    async beginTransaction() { calls.push('begin') },
    async execute(sql, parameters) { calls.push({ sql, parameters }); return [{ affectedRows: 1 }] },
    async commit() { calls.push('commit') },
    async rollback() { calls.push('rollback') },
    release() { calls.push('release') },
  }
  const database = { async getConnection() { return connection } }

  try {
    const registration = await registerCongregation(database, {
      organizationName: 'Congregación de prueba',
      email: 'admin@example.test',
      password: 'secure-registration-pass',
    })
    assert.equal(registration.email, 'admin@example.test')
    assert.equal(registration.subscriptionStatus, 'pending_payment')
    assert.equal(registration.planId, null)
    assert.equal('checkoutUrl' in registration, false)
    assert.equal(calls.filter((call) => typeof call === 'object').length, 3)
    assert.match(calls[1].sql, /INSERT INTO organizations/)
    assert.match(calls[2].sql, /INSERT INTO users/)
    assert.match(calls[3].sql, /INSERT INTO subscriptions/)
    assert.match(calls[3].sql, /VALUES \(\?, \?, 'pending_payment', NULL, NULL, NULL\)/)
    assert.equal(calls[4], 'commit')
  } finally {
    if (previousSecret === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = previousSecret
    if (previousPrice === undefined) delete process.env.STRIPE_PRICE_ID
    else process.env.STRIPE_PRICE_ID = previousPrice
  }
})

test('Stripe checkout completion is recorded idempotently but does not activate before invoice payment', async () => {
  const payload = Buffer.from(JSON.stringify({
    id: 'evt_checkout_1', type: 'checkout.session.completed', data: { object: {
      id: 'cs_test_1', mode: 'subscription', client_reference_id: 'sub_internal_1', subscription: 'sub_stripe_1',
      customer: 'cus_1', metadata: { subscriptionId: 'sub_internal_1' },
    } },
  }))
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET })
  const calls = []
  const connection = {
    async beginTransaction() { calls.push('begin') },
    async execute(sql, parameters) {
      calls.push({ sql, parameters })
      return sql.includes('INSERT IGNORE') ? [{ affectedRows: 1 }] : [{ affectedRows: 1 }]
    },
    async commit() { calls.push('commit') },
    async rollback() {},
    release() {},
  }
  const database = { async getConnection() { return connection } }

  const result = await processStripeWebhook(database, payload, signature)
  assert.deepEqual(result, { received: true, duplicate: false })
  assert.match(calls[1].sql, /INSERT IGNORE INTO billing_webhook_events/)
  assert.match(calls[2].sql, /stripe_subscription_id = \?/)
  assert.deepEqual(calls[2].parameters.slice(0, 2), ['sub_stripe_1', 'cus_1'])
})

test('paid community donations are confirmed by a signed Stripe webhook and recorded idempotently', async () => {
  const payload = Buffer.from(JSON.stringify({
    id: 'evt_donation_paid_1', type: 'checkout.session.completed', data: { object: {
      id: 'cs_donation_1', mode: 'payment', payment_status: 'paid', amount_total: 25000, currency: 'mxn',
      payment_intent: 'pi_donation_1', metadata: { donationId: 'donation_1' },
    } },
  }))
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET })
  const calls = []
  const connection = {
    async beginTransaction() {},
    async execute(sql, parameters = []) {
      calls.push({ sql, parameters })
      if (sql.includes('FROM donations')) {
        return [[{ id: 'donation_1', amountMinor: 25000, currency: 'MXN', status: 'pending' }], []]
      }
      if (sql.includes('INSERT IGNORE')) return [{ affectedRows: 1 }, []]
      return [{ affectedRows: 1 }, []]
    },
    async commit() {},
    async rollback() {},
    release() {},
  }

  const result = await processStripeWebhook({ async getConnection() { return connection } }, payload, signature)
  assert.deepEqual(result, { received: true, duplicate: false })
  const paymentUpdate = calls.find(({ sql }) => sql.includes("UPDATE donations SET status = 'paid'"))
  assert.ok(paymentUpdate)
  assert.deepEqual(paymentUpdate.parameters, ['cs_donation_1', 'pi_donation_1', 'donation_1', 'cs_donation_1'])
})

test('paid advertising checkout activates only its matching organization order and extends days once', async () => {
  const payload = Buffer.from(JSON.stringify({
    id: 'evt_ad_paid_1', type: 'checkout.session.completed', data: { object: {
      id: 'cs_ad_1', mode: 'payment', payment_status: 'paid', amount_total: 4200, currency: 'mxn',
      payment_intent: 'pi_ad_1', metadata: { adOrderId: 'order_ad_1', organizationId: 'org_ad_1' },
    } },
  }))
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET })
  const calls = []
  const connection = {
    async beginTransaction() {},
    async execute(sql, parameters) {
      calls.push({ sql, parameters })
      if (sql.includes('INSERT IGNORE')) return [{ affectedRows: 1 }]
      if (sql.includes('FROM ad_purchase_orders')) return [[{
        id: 'order_ad_1', campaignId: 'campaign_ad_1', organizationId: 'org_ad_1',
        daysPurchased: 7, amountMinor: 4200, currency: 'MXN', status: 'pending',
      }]]
      return [{ affectedRows: 1 }]
    },
    async commit() {}, async rollback() {}, release() {},
  }

  const result = await processStripeWebhook({ async getConnection() { return connection } }, payload, signature)
  assert.deepEqual(result, { received: true, duplicate: false })
  assert.ok(calls.some(({ sql, parameters }) => sql.includes("SET status = 'paid'") && parameters[2] === 'order_ad_1'))
  const activation = calls.find(({ sql }) => sql.includes('UPDATE brand_ads SET starts_at'))
  assert.ok(activation)
  assert.deepEqual(activation.parameters, [7, 7, 'campaign_ad_1', 'org_ad_1'])
})

test('paid advertising checkout rejects Stripe amount that differs from its order', async () => {
  const payload = Buffer.from(JSON.stringify({
    id: 'evt_ad_mismatch', type: 'checkout.session.completed', data: { object: {
      id: 'cs_ad_mismatch', mode: 'payment', payment_status: 'paid', amount_total: 100, currency: 'mxn',
      metadata: { adOrderId: 'order_ad_mismatch', organizationId: 'org_ad_1' },
    } },
  }))
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET })
  const connection = {
    async beginTransaction() {},
    async execute(sql) {
      if (sql.includes('INSERT IGNORE')) return [{ affectedRows: 1 }]
      if (sql.includes('FROM ad_purchase_orders')) return [[{
        id: 'order_ad_mismatch', campaignId: 'campaign_ad_1', organizationId: 'org_ad_1',
        daysPurchased: 7, amountMinor: 4200, currency: 'MXN', status: 'pending',
      }]]
      return [{ affectedRows: 1 }]
    },
    async commit() {}, async rollback() {}, release() {},
  }
  await assert.rejects(
    processStripeWebhook({ async getConnection() { return connection } }, payload, signature),
    { status: 409 },
  )
})

test('active subscription webhook stores period dates from subscription items', async () => {
  const calls = []
  const payload = Buffer.from(JSON.stringify({
    id: 'evt_subscription_period',
    type: 'customer.subscription.updated',
    data: { object: {
      id: 'sub_stripe_period',
      object: 'subscription',
      status: 'active',
      customer: 'cus_period',
      metadata: { subscriptionId: 'sub_internal_period' },
      items: { data: [{ current_period_start: 1811536000, current_period_end: 1814214400 }] },
    } },
  }))
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET })
  const connection = {
    async beginTransaction() {},
    async execute(sql, parameters) {
      calls.push({ sql, parameters })
      return [{ affectedRows: 1 }]
    },
    async commit() {}, async rollback() {}, release() {},
  }
  const database = { async getConnection() { return connection } }

  await processStripeWebhook(database, payload, signature)
  const update = calls.find(({ sql }) => sql.includes('UPDATE subscriptions SET status'))
  assert.ok(update)
  assert.match(update.sql, /status = COALESCE\(\?, status\)/)
  assert.equal(update.parameters[0], null)
  assert.equal(update.parameters[3], '2027-05-28 20:26:40')
  assert.equal(update.parameters[4], '2027-06-28 20:26:40')
})

test('subscription status backfills missing period dates from Stripe subscription items', async () => {
  const calls = []
  const database = {
    async execute(sql, parameters) {
      calls.push({ sql, parameters })
      if (sql.includes('FROM subscriptions s')) return [[{
        id: 'sub_local_legacy', status: 'pending_payment', currentPeriodStart: null, currentPeriodEnd: null, saasPlanId: null,
        stripeSubscriptionId: null, stripeCheckoutSessionId: 'cs_legacy', stripeCustomerId: null, planCode: null, planName: null,
        periodValid: 1, createdAt: '2026-05-01T00:00:00.000Z', amount: null,
      }]]
      return [{ affectedRows: 1 }]
    },
  }
  const stripe = {
    checkout: {
      sessions: {
        async retrieve(id, options) {
          assert.equal(id, 'cs_legacy')
          assert.deepEqual(options, { expand: ['subscription'] })
          return {
            customer: 'cus_legacy',
            subscription: {
              id: 'sub_stripe_legacy',
              status: 'active',
              items: { data: [{ current_period_start: 1811536000, current_period_end: 1814214400 }] },
            },
          }
        },
      },
    },
  }

  const result = await getOrganizationSubscription(database, 'org_period', stripe)
  assert.equal(result.currentPeriodStart, '2027-05-28 20:26:40')
  assert.equal(result.currentPeriodEnd, '2027-06-28 20:26:40')
  assert.equal(result.status, 'active')
  assert.equal('stripeSubscriptionId' in result, false)
  assert.ok(calls.some(({ sql }) => sql.includes('UPDATE subscriptions') && sql.includes('current_period_start')))
})

test('subscription status recovers dates from customer subscriptions and latest invoice', async () => {
  const calls = []
  const database = {
    async execute(sql) {
      calls.push(sql)
      if (sql.includes('FROM subscriptions s')) return [[{
        id: 'sub_local_customer', status: 'pending_payment', currentPeriodStart: null, currentPeriodEnd: null,
        saasPlanId: 2, stripeSubscriptionId: null, stripeCheckoutSessionId: null, stripeCustomerId: 'cus_saved',
        planCode: 'starter', planName: 'Starter', periodValid: 1, createdAt: '2026-05-01T00:00:00.000Z',
        amount: '290.00', currency: 'MXN', intervalUnit: 'month', intervalCount: 1,
      }]]
      if (sql.includes('UPDATE subscriptions')) return [{ affectedRows: 1 }]
      if (sql.includes('FROM saas_plan_entitlements')) return [[]]
      return [[]]
    },
  }
  const stripe = {
    subscriptions: {
      async list(options) {
        assert.deepEqual(options, { customer: 'cus_saved', status: 'all', limit: 100 })
        return { data: [{ id: 'sub_customer', status: 'active', latest_invoice: 'in_latest', created: 1811536000 }] }
      },
    },
    invoices: {
      async retrieve(id) {
        assert.equal(id, 'in_latest')
        return { period_start: 1811536000, period_end: 1814214400 }
      },
    },
  }

  const result = await getOrganizationSubscription(database, 'org_customer', stripe)
  assert.equal(result.currentPeriodStart, '2027-05-28 20:26:40')
  assert.equal(result.currentPeriodEnd, '2027-06-28 20:26:40')
  assert.equal(result.status, 'active')
  assert.ok(calls.some((sql) => sql.includes('UPDATE subscriptions')))
})

test('checkout uses the selected plan price without requiring a global Stripe price id', async () => {
  const previousPrice = process.env.STRIPE_PRICE_ID
  delete process.env.STRIPE_PRICE_ID
  const calls = []

  const database = {
    async execute(sql, parameters) {
      if (sql.includes('FROM subscriptions WHERE id = ?')) {
        return [[{ id: 'sub_123', organization_id: 'org_123', status: 'pending_payment', saas_plan_id: null, saas_plan_price_id: null, stripe_price_id: null, stripe_checkout_session_id: null }]]
      }
      if (sql.includes('FROM saas_plans p')) {
        assert.deepEqual(parameters, [null, 'starter', 'test'])
        return [[{ planId: 7, planCode: 'starter', planName: 'Starter', priceId: 19, stripePriceId: 'price_starter_test', environment: 'test', amount: 290, currency: 'MXN', intervalUnit: 'month', intervalCount: 1 }]]
      }
      if (sql.includes('UPDATE subscriptions SET stripe_checkout_session_id')) return [{ affectedRows: 1 }]
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
  const stripe = {
    checkout: {
      sessions: {
        async create(input) {
          calls.push(input)
          return { id: 'cs_test_selected_plan', url: 'https://checkout.stripe.test/session', customer: 'cus_test' }
        },
      },
    },
  }

  try {
    const result = await createCheckoutSession(database, 'sub_123', {
      organizationId: 'org_123', email: 'admin@example.test', planId: 'starter',
    }, stripe)
    assert.equal(result.url, 'https://checkout.stripe.test/session')
    assert.equal(calls[0].line_items[0].price, 'price_starter_test')
    assert.equal(calls[0].metadata.planId, 'starter')
  } finally {
    if (previousPrice === undefined) delete process.env.STRIPE_PRICE_ID
    else process.env.STRIPE_PRICE_ID = previousPrice
  }
})

test('checkout rejects a selected plan without a Stripe price instead of charging another plan', async () => {
  const previousPrice = process.env.STRIPE_PRICE_ID
  process.env.STRIPE_PRICE_ID = 'price_your_recurring_price_id_here'
  const database = {
    async execute(sql) {
      if (sql.includes('FROM subscriptions WHERE id = ?')) {
        return [[{ id: 'sub_123', organization_id: 'org_123', status: 'pending_payment', saas_plan_id: null, saas_plan_price_id: null, stripe_price_id: null, stripe_checkout_session_id: null }]]
      }
      if (sql.includes('FROM saas_plans p')) return [[]]
      throw new Error(`Unexpected query: ${sql}`)
    },
  }

  try {
    await assert.rejects(() => createCheckoutSession(database, 'sub_123', {
      organizationId: 'org_123', email: 'admin@example.test', planId: 'starter',
    }, {}), {
      status: 503,
      message: /plan seleccionado no tiene un precio válido/i,
    })
  } finally {
    if (previousPrice === undefined) delete process.env.STRIPE_PRICE_ID
    else process.env.STRIPE_PRICE_ID = previousPrice
  }
})

test('invalid Stripe signatures are rejected before database access', async () => {
  const database = { async getConnection() { throw new Error('Must not access database') } }
  await assert.rejects(processStripeWebhook(database, Buffer.from('{}'), 't=0,v1=invalid'), { status: 400 })
})
