import assert from 'node:assert/strict'
import test from 'node:test'
import { getPublicCommunityData } from './community.service.js'

test('public community feed returns congregation, future events, and published posts only', async () => {
  const now = new Date('2026-10-09T12:00:00.000Z')
  const database = {
    async execute(sql, parameters) {
      if (sql.includes('FROM locations')) {
        assert.match(sql, /locations\.latitude/)
        assert.match(sql, /subscriptions\.status = 'active'/)
        return [[{
          id: 'loc-central', name: 'Sede Central', city: 'Ciudad de México',
          latitude: 19.4326, longitude: -99.1332,
        }]]
      }
      if (sql.includes('FROM events')) {
        assert.match(sql, /events\.status = 'scheduled'/)
        assert.match(sql, /subscriptions\.status = 'active'/)
        assert.match(sql, /reservations\.organization_id = events\.organization_id/)
        assert.deepEqual(parameters, [now.toISOString()])
        return [[{
          id: 'event-public', title: 'Próximo encuentro', congregation: 'Sede Central',
          startsAt: '2026-10-10T18:00:00.000Z', latitude: 19.4326, longitude: -99.1332,
        }]]
      }
      if (sql.includes('FROM community_posts')) {
        assert.match(sql, /community_posts\.status = 'published'/)
        assert.match(sql, /subscriptions\.status = 'active'/)
        assert.match(sql, /community_posts\.organization_id = locations\.organization_id/)
        return [[{
          id: 'post-public', type: 'article', title: 'Una historia pública', congregation: 'Sede Central',
          latitude: 19.4326, longitude: -99.1332,
        }]]
      }
      if (sql.includes('FROM module_records')) {
        assert.match(sql, /module_records\.title, module_records\.status/)
        assert.match(sql, /module_records\.is_public = 1/)
        assert.match(sql, /module_records\.module_id IN \('groups', 'attendance', 'resources', 'communications', 'reports', 'settings'\)/)
        assert.match(sql, /subscriptions\.status = 'active'/)
        return [[{
          id: 'public-group-1', moduleId: 'groups', title: 'Grupo comunitario', status: 'Activo',
          description: 'Encuentro semanal abierto.', detail: '', recordDate: '2026-10-08',
          organizationId: 'org-central', congregation: 'Congregación Central',
        }]]
      }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  const result = await getPublicCommunityData(database, now)
  assert.equal(result.congregations.length, 1)
  assert.equal(result.congregations[0].latitude, 19.4326)
  assert.equal(result.events[0].id, 'event-public')
  assert.equal(result.events[0].longitude, -99.1332)
  assert.equal(result.posts[0].id, 'post-public')
  assert.equal(result.moduleUpdates[0].id, 'public-group-1')
  assert.equal(result.moduleUpdates[0].status, 'Activo')
  assert.equal(result.moduleUpdates[0].congregation, 'Congregación Central')
})