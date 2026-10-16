import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignSaasSubscription,
  listSaasSubscriptions,
  updateManualSaasSubscription,
} from './saas-subscriptions.service.js'

function dates() {
  const startsAt = new Date().toISOString().slice(0, 10)
  const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return { organizationId: 'org-1', planId: 4, startsAt, endsAt }
}

function createConnection(execute) {
  const calls = []
  const connection = {
    async beginTransaction() { calls.push('begin') },
    async execute(sql, parameters = []) {
      calls.push({ sql, parameters })
      return execute(sql, parameters)
    },
    async commit() { calls.push('commit') },
    async rollback() { calls.push('rollback') },
    release() { calls.push('release') },
  }
  return { connection, calls }
}

test('manual assignment activates an existing signup without creating a Stripe payment', async () => {
  const { connection, calls } = createConnection((sql) => {
    if (sql.includes('FROM organizations')) return [[{ id: 'org-1' }]]
    if (sql.includes('stripe_subscription_id IS NOT NULL')) return [[]]
    if (sql.includes('FROM saas_plans AS plans')) return [[{ id: 4, priceVersionId: 42 }]]
    if (sql.includes('FROM subscriptions') && sql.includes('periodValid')) {
      return [[{ id: 'sub-pending', status: 'pending_payment', periodValid: 0 }]]
    }
    return [{ affectedRows: 1 }]
  })
  const database = { async getConnection() { return connection } }

  const result = await assignSaasSubscription(database, dates())
  assert.equal(result.id, 'sub-pending')
  assert.equal(result.status, 'active')
  assert.equal(result.planId, 4)
  assert.equal(result.stripeManaged, false)
  const update = calls.find(({ sql }) => typeof sql === 'string' && sql.includes("UPDATE subscriptions SET status = 'active'"))
  assert.ok(update)
  assert.deepEqual(update.parameters.slice(0, 2), [4, 42])
  assert.match(update.parameters[3], /23:59:59$/)
  assert.equal(calls.some(({ sql }) => typeof sql === 'string' && sql.includes('INSERT INTO subscriptions')), false)
  assert.equal(calls.at(-2), 'commit')
})

test('manual assignment creates a new subscription after a previous canceled record', async () => {
  let subscriptionSequence = 0
  const { connection, calls } = createConnection((sql) => {
    if (sql.includes('FROM organizations')) return [[{ id: 'org-1' }]]
    if (sql.includes('stripe_subscription_id IS NOT NULL')) return [[]]
    if (sql.includes('FROM saas_plans AS plans')) return [[{ id: 4, priceVersionId: null }]]
    if (sql.includes('FROM subscriptions') && sql.includes('periodValid')) {
      return [[{ id: 'sub-old', status: 'canceled', periodValid: 0 }]]
    }
    if (sql.includes('INSERT INTO subscriptions')) subscriptionSequence += 1
    return [{ affectedRows: 1 }]
  })
  const database = { async getConnection() { return connection } }

  const result = await assignSaasSubscription(database, dates())
  assert.match(result.id, /^sub-/)
  assert.equal(result.id === 'sub-old', false)
  assert.equal(subscriptionSequence, 1)
  assert.ok(calls.some(({ sql }) => typeof sql === 'string' && sql.includes('INSERT INTO subscriptions')))
})

test('manual assignment cannot replace a subscription with Stripe references', async () => {
  const { connection, calls } = createConnection((sql) => {
    if (sql.includes('FROM organizations')) return [[{ id: 'org-1' }]]
    if (sql.includes('stripe_subscription_id IS NOT NULL')) return [[{ id: 'sub-stripe' }]]
    return [[]]
  })
  const database = { async getConnection() { return connection } }

  await assert.rejects(assignSaasSubscription(database, dates()), {
    status: 409,
    message: /vinculada a Stripe/,
  })
  assert.ok(calls.includes('rollback'))
  assert.equal(calls.some(({ sql }) => typeof sql === 'string' && sql.includes('UPDATE subscriptions')), false)
})

test('invalid manual subscription dates are rejected before acquiring a connection', async () => {
  const database = { async getConnection() { throw new Error('Must validate dates first') } }
  await assert.rejects(assignSaasSubscription(database, { ...dates(), startsAt: '2026-02-30' }), {
    status: 400,
    message: /fechas de vigencia válidas/,
  })
})

test('manual subscriptions can be canceled but Stripe-managed subscriptions are immutable here', async () => {
  const { connection, calls } = createConnection((sql) => {
    if (sql.includes('stripe_subscription_id IS NOT NULL')) return [[]]
    if (sql.includes('SELECT id FROM subscriptions')) return [[{ id: 'sub-manual' }]]
    if (sql.includes('FROM saas_plans AS plans')) return [[{ id: 4, priceVersionId: 42 }]]
    return [{ affectedRows: 1 }]
  })
  const database = { async getConnection() { return connection } }
  const result = await updateManualSaasSubscription(database, 'sub-manual', { ...dates(), status: 'canceled' })
  assert.equal(result.status, 'canceled')
  assert.ok(calls.some(({ sql, parameters }) => (
    typeof sql === 'string' && sql.includes('UPDATE subscriptions SET status = ?') && parameters[0] === 'canceled'
  )))

  const stripeConnection = createConnection((sql) => {
    if (sql.includes('stripe_subscription_id IS NOT NULL')) return [[{ id: 'sub-stripe' }]]
    if (sql.includes('SELECT id FROM subscriptions')) return [[{ id: 'sub-stripe' }]]
    return [[]]
  })
  await assert.rejects(updateManualSaasSubscription(
    { async getConnection() { return stripeConnection.connection } },
    'sub-stripe',
    { ...dates(), status: 'canceled' },
  ), { status: 409, message: /se administra desde Stripe/ })
})

test('subscription administration list returns provider source and effective expiration status', async () => {
  const expected = [{
    id: 'sub-1', organizationId: 'org-1', effectiveStatus: 'expired', stripeManaged: 0,
  }]
  const database = {
    async execute(sql) {
      assert.match(sql, /FROM subscriptions AS s/)
      assert.match(sql, /current_period_end <= UTC_TIMESTAMP\(\)/)
      return [expected]
    },
  }
  const [subscription] = await listSaasSubscriptions(database)
  assert.equal(subscription.effectiveStatus, 'expired')
  assert.equal(subscription.stripeManaged, false)
})
