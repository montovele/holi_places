import assert from 'node:assert/strict'
import test from 'node:test'
import { getDashboardData } from './dashboard.service.js'

test('dashboard returns upcoming events and binds the requested timestamp', async () => {
  const now = new Date('2026-10-01T12:00:00.000Z')
  const events = [
    { id: 'evt-community', name: 'Encuentro comunitario', location: 'Sede Central', reservationCount: 3 },
    { id: 'evt-workshop', name: 'Taller de bienvenida', location: 'Centro Comunitario Norte', reservationCount: 2 },
  ]
  const database = {
    async execute(sql, parameters) {
      assert.match(sql, /GROUP BY events\.id/)
      assert.deepEqual(parameters, [now.toISOString(), 'org-demo'])
      return [events]
    },
  }

  assert.deepEqual(await getDashboardData(database, now, 'org-demo'), { events })
})