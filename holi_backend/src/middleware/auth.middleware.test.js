import assert from 'node:assert/strict'
import test from 'node:test'
import { createSessionToken } from '../services/auth.service.js'
import { createActiveSubscriptionMiddleware, createAuthMiddleware, requireModuleOperatorScope, requireRoles } from './auth.middleware.js'

process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters-long'

function responseProbe() {
  return {
    statusCode: 200,
    status(value) { this.statusCode = value; return this },
    json(value) { this.body = value; return this },
  }
}

test('an operator cannot switch tenants by sending an organization header', async () => {
  const database = {
    async execute() {
      return [[{ id: 'user-1', email: 'operator@example.test', role: 'operator', organizationId: 'org-one', organizationName: 'Congregación Uno', status: 'active' }]]
    },
  }
  const request = {
    cookies: { holi_session: createSessionToken({ id: 'user-1' }) },
    get() { return 'org-two' },
  }
  const response = responseProbe()
  let nextCalled = false
  await createAuthMiddleware(database)(request, response, () => { nextCalled = true })
  assert.equal(nextCalled, true)
  assert.equal(request.auth.organizationId, 'org-one')
  assert.equal(request.auth.organizationName, 'Congregación Uno')
})

test('a superadmin tenant header is checked against active organizations', async () => {
  const database = {
    async execute(sql, parameters) {
      if (sql.includes('FROM users')) return [[{ id: 'root-1', email: 'root@example.test', role: 'superadmin', organizationId: null, organizationName: null, status: 'active' }]]
      assert.deepEqual(parameters, ['org-two'])
      return [[{ id: 'org-two', name: 'Congregación Dos' }]]
    },
  }
  const request = {
    cookies: { holi_session: createSessionToken({ id: 'root-1' }) },
    get() { return 'org-two' },
  }
  const response = responseProbe()
  await createAuthMiddleware(database)(request, response, () => {})
  assert.equal(request.auth.organizationId, 'org-two')
  assert.equal(request.auth.organizationName, 'Congregación Dos')
})

test('operators can write only to reservations and attendance', () => {
  const request = { auth: { role: 'operator' }, params: { moduleId: 'members' } }
  const response = responseProbe()
  let nextCalled = false
  requireModuleOperatorScope(request, response, () => { nextCalled = true })
  assert.equal(nextCalled, false)
  assert.equal(response.statusCode, 403)

  request.params.moduleId = 'attendance'
  requireModuleOperatorScope(request, response, () => { nextCalled = true })
  assert.equal(nextCalled, true)
})

test('role checks do not treat operators as administrators', () => {
  const request = { auth: { role: 'operator' } }
  const response = responseProbe()
  let nextCalled = false
  requireRoles('superadmin', 'admin')(request, response, () => { nextCalled = true })
  assert.equal(nextCalled, false)
  assert.equal(response.statusCode, 403)
})

test('authentication database errors are delegated to the central error handler', async () => {
  const request = {
    cookies: { holi_session: createSessionToken({ id: 'user-1' }) },
    get() { return undefined },
  }
  const response = responseProbe()
  const databaseError = new Error('database unavailable')
  let delegated
  await createAuthMiddleware({ async execute() { throw databaseError } })(request, response, (error) => { delegated = error })
  assert.equal(delegated, databaseError)
})

test('tenant modules remain blocked until an active subscription is present', async () => {
  const request = { auth: { role: 'admin', organizationId: 'org-pending' } }
  const response = responseProbe()
  let nextCalled = false
  await createActiveSubscriptionMiddleware({ async execute() { return [[]] } })(request, response, () => { nextCalled = true })
  assert.equal(nextCalled, false)
  assert.equal(response.statusCode, 402)
  assert.equal(response.body.error.code, 'SUBSCRIPTION_REQUIRED')

  await createActiveSubscriptionMiddleware({ async execute(sql, parameters) {
    assert.deepEqual(parameters, ['org-pending'])
    assert.match(sql, /current_period_end > UTC_TIMESTAMP\(\)/)
    return [[{ id: 'sub-active', status: 'active', periodValid: 1 }]]
  } })(request, response, () => { nextCalled = true })
  assert.equal(nextCalled, true)
})

test('the canonical agenda accepts legacy calendar entitlements', async () => {
  const calls = []
  const database = {
    async execute(sql, parameters) {
      calls.push({ sql, parameters })
      if (sql.includes('FROM subscriptions')) {
        return [[{ id: 'sub-active', status: 'active', saas_plan_id: 7, periodValid: 1 }]]
      }
      assert.match(sql, /feature_key IN \(\?, \?, \?\)/)
      assert.deepEqual(parameters, [7, 'events', 'calendar', 'meetings'])
      return [[{ feature_key: 'calendar' }]]
    },
  }
  const response = responseProbe()
  let nextCalled = false

  await createActiveSubscriptionMiddleware(database)(
    { auth: { role: 'admin', organizationId: 'org-paid' }, params: { moduleId: 'events' } },
    response,
    () => { nextCalled = true },
  )

  assert.equal(nextCalled, true)
  assert.equal(calls.length, 2)
})

test('superadmins retain support access without a tenant subscription', async () => {
  let queryCalled = false
  let nextCalled = false
  await createActiveSubscriptionMiddleware({ async execute() { queryCalled = true; return [[]] } })(
    { auth: { role: 'superadmin' } }, responseProbe(), () => { nextCalled = true },
  )
  assert.equal(queryCalled, false)
  assert.equal(nextCalled, true)
})