import assert from 'node:assert/strict'
import test from 'node:test'
import { getDashboardForAccount } from './dashboard.controller.js'

test('an unpaid congregation can enter the dashboard but receives no agenda records', async () => {
  const database = {
    async execute(sql) {
      assert.match(sql, /FROM subscriptions/)
      return [[{ status: 'pending_payment', currentPeriodEnd: null, periodValid: 1 }]]
    },
  }
  const result = await getDashboardForAccount(database, { role: 'admin', organizationId: 'org-pending' })
  assert.deepEqual(result.events, [])
  assert.equal(result.subscription.status, 'pending_payment')
})

test('an active congregation receives its tenant agenda in the dashboard', async () => {
  const events = [{ id: 'evt-1', name: 'Actividad', startsAt: '2026-10-20T18:00:00.000Z' }]
  const database = {
    async execute(sql) {
      if (sql.includes('FROM subscriptions')) return [[{ status: 'active', currentPeriodEnd: null, periodValid: 1 }]]
      assert.match(sql, /events\.organization_id = \?/)
      return [events]
    },
  }
  const result = await getDashboardForAccount(database, { role: 'admin', organizationId: 'org-active' })
  assert.deepEqual(result.events, events)
  assert.equal(result.subscription.status, 'active')
})