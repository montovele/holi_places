import { getHealthStatus } from '../services/health.service.js'
import { database } from '../db/database.js'

export async function readHealth(request, response) {
  await database.execute('SELECT 1')
  response.json({ ...getHealthStatus(), database: { status: 'ok', engine: 'mysql' } })
}