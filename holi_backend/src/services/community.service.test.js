import assert from 'node:assert/strict'
import test from 'node:test'
import { getPublicCommunityData } from './community.service.js'

test('public community feed returns congregation, future events, and published posts only', async () => {
  const now = new Date('2026-10-09T12:00:00.000Z')
  const database = {
    async execute(sql, parameters) {
      if (sql.includes('FROM public_congregation_directory')) {
        assert.match(sql, /NULL AS organizationId/)
        assert.match(sql, /maps_url AS mapsUrl/)
        return [[{
          id: 'directory-central', name: 'Parroquia Central', city: 'Tijuana',
          type: 'Iglesia católica', address: 'Av. Central 100', rating: 4.8,
          reviewCount: 20, latitude: 32.5, longitude: -117, mapsUrl: 'https://maps.google.com/?q=central',
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
      if (sql.includes('FROM brand_ads')) {
        assert.match(sql, /status = 'active'/)
        assert.match(sql, /organization_id IS NULL OR purchased_days > 0/)
        assert.match(sql, /\(jpg\|png\|webp\|mp4\|webm\)/)
        assert.match(sql, /ORDER BY RAND\(\)/)
        assert.deepEqual(parameters, ['2026-10-09 12:00:00', '2026-10-09 12:00:00'])
        return [[{ id: 'ad-public', brandName: 'Librería Central', placement: 'content', organizationId: null }]]
      }
      if (sql.includes('FROM synthetic_module_fixtures')) return [[]]
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  const result = await getPublicCommunityData(database, now)
  assert.equal(result.congregations.length, 1)
  assert.equal(result.congregations[0].latitude, 32.5)
  assert.equal(result.congregations[0].type, 'Iglesia católica')
  assert.equal(result.congregations[0].mapsUrl, 'https://maps.google.com/?q=central')
  assert.equal(result.events[0].id, 'event-public')
  assert.equal(result.events[0].longitude, -99.1332)
  assert.equal(result.posts[0].id, 'post-public')
  assert.equal(result.moduleUpdates[0].id, 'public-group-1')
  assert.equal(result.moduleUpdates[0].status, 'Activo')
  assert.equal(result.moduleUpdates[0].congregation, 'Congregación Central')
  assert.equal(result.ads[0].id, 'ad-public')
  assert.equal(result.syntheticFixturesEnabled, process.env.NODE_ENV !== 'production')
})

test('synthetic module fixture records are returned only outside production and always remain marked private', async () => {
  const originalNodeEnvironment = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  const database = {
    async execute(sql) {
      if (sql.includes('FROM public_congregation_directory')) return [[]]
      if (sql.includes('FROM events')) return [[]]
      if (sql.includes('FROM community_posts')) return [[]]
      if (sql.includes('FROM module_records')) return [[]]
      if (sql.includes('FROM brand_ads')) return [[]]
      if (sql.includes('FROM synthetic_module_fixtures')) return [[{
        id: 'synthetic-record-1',
        moduleId: 'groups',
        congregationId: 'directory-church-1',
        congregation: 'Iglesia de ejemplo',
        recordData: JSON.stringify({ title: 'Grupo sintético', status: 'Borrador sintético' }),
      }]]
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
  try {
    const result = await getPublicCommunityData(database)
    const record = result.moduleUpdates[0]
    assert.equal(result.syntheticFixturesEnabled, true)
    assert.equal(record.title, 'Grupo sintético')
    assert.equal(record.congregationId, 'directory-church-1')
    assert.equal(record.isSynthetic, true)
    assert.equal(record.synthetic, true)
    assert.equal(record.public, false)
    assert.equal(record.visibility, 'private')
  } finally {
    if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnvironment
  }
})

test('production community feed does not query synthetic module fixtures', async () => {
  const originalNodeEnvironment = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  const database = {
    async execute(sql) {
      if (sql.includes('FROM public_congregation_directory')) return [[]]
      if (sql.includes('FROM events')) return [[]]
      if (sql.includes('FROM community_posts')) return [[]]
      if (sql.includes('FROM module_records')) return [[]]
      if (sql.includes('FROM brand_ads')) return [[]]
      if (sql.includes('FROM synthetic_module_fixtures')) throw new Error('Production must not read synthetic fixture data.')
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
  try {
    const result = await getPublicCommunityData(database)
    assert.equal(result.syntheticFixturesEnabled, false)
    assert.deepEqual(result.moduleUpdates, [])
  } finally {
    if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnvironment
  }
})