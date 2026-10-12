import assert from 'node:assert/strict'
import test from 'node:test'
import { getHealthStatus } from './health.service.js'

test('health response identifies the API and includes an ISO timestamp', () => {
  const status = getHealthStatus(new Date('2026-10-01T12:00:00.000Z'))

  assert.deepEqual(status, {
    status: 'ok',
    service: 'holi-places-api',
    timestamp: '2026-10-01T12:00:00.000Z',
  })
})