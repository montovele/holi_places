import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { database } from './database.js'

const fixturePath = fileURLToPath(new URL('../../data/synthetic-module-records.json', import.meta.url))
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
const moduleIds = [
  'events', 'reservations', 'members', 'groups', 'attendance', 'locations',
  'resources', 'communications', 'reports', 'subscription', 'settings',
]

test('synthetic module fixture covers all 12 directory congregations privately', () => {
  assert.equal(fixture.congregations.length, 12)
  assert.deepEqual(fixture.modules, moduleIds)
  assert.equal(fixture.synthetic, true)
  assert.equal(fixture.visibility, 'private')
  assert.equal(fixture.public, false)

  for (const congregation of fixture.congregations) {
    assert.equal(congregation.syntheticRecords, true)
    assert.deepEqual(Object.keys(congregation.modules).sort(), [...moduleIds].sort())
    for (const records of Object.values(congregation.modules)) {
      assert.ok(Array.isArray(records))
      for (const record of records) {
        assert.equal(record.public, false)
        assert.equal(record.visibility, 'private')
      }
    }
    for (const member of congregation.modules.members) {
      assert.match(member.email, /@example\.invalid$/)
    }
    assert.equal(congregation.modules.subscription.length, 0)
    assert.equal(congregation.modules.locations.length, 1)
    assert.equal(congregation.modules.locations[0].synthetic, false)
    assert.match(congregation.modules.locations[0].source, /^https:\/\/www\.google\.com\/maps\//)
  }

  const records = fixture.congregations.flatMap((congregation) => moduleIds
    .flatMap((moduleId) => congregation.modules[moduleId]))
  assert.equal(records.length, 156)
  assert.equal(records.filter((record) => record.synthetic).length, 144)
})

test('persisted synthetic fixture is associated with all directory entries and stays isolated', async () => {
  try {
    const [[summaryRows], [byModule], [byCongregation]] = await Promise.all([
      database.execute(`
        SELECT COUNT(*) AS total, COUNT(DISTINCT congregation_id) AS congregations,
          COUNT(DISTINCT module_id) AS modules, SUM(is_public) AS publicRecords,
          SUM(synthetic) AS syntheticRecords
        FROM synthetic_module_fixtures WHERE fixture_id = ?
      `, ['synthetic-tijuana-directory-v1']),
      database.execute(`
        SELECT module_id AS moduleId, COUNT(*) AS total
        FROM synthetic_module_fixtures WHERE fixture_id = ?
        GROUP BY module_id
      `, ['synthetic-tijuana-directory-v1']),
      database.execute(`
        SELECT directory.id, directory.name, COUNT(fixtures.record_id) AS total
        FROM public_congregation_directory AS directory
        LEFT JOIN synthetic_module_fixtures AS fixtures
          ON fixtures.congregation_id = directory.id AND fixtures.fixture_id = ?
        GROUP BY directory.id, directory.name
      `, ['synthetic-tijuana-directory-v1']),
    ])
    const summary = summaryRows[0]

    assert.equal(Number(summary.total), 156)
    assert.equal(Number(summary.congregations), 12)
    assert.equal(Number(summary.modules), 10)
    assert.equal(Number(summary.publicRecords), 0)
    assert.equal(Number(summary.syntheticRecords), 144)
    assert.deepEqual(byModule.map(({ moduleId }) => moduleId).sort(), [
      'attendance', 'communications', 'events', 'groups', 'locations', 'members',
      'reports', 'reservations', 'resources', 'settings',
    ])
    assert.ok(byModule.every(({ total }) => Number(total) > 0))
    assert.equal(byCongregation.length, 12)
    assert.ok(byCongregation.every(({ total }) => Number(total) === 13))

    for (const table of ['events', 'members', 'reservations', 'space_reservations', 'module_records', 'community_posts']) {
      const [rows] = await database.execute(`SELECT COUNT(*) AS total FROM ${table} WHERE id LIKE ?`, ['synthetic-%'])
      assert.equal(Number(rows[0].total), 0, `No deben insertarse filas sintéticas en ${table}.`)
    }
  } finally {
    // The shared pool is closed by the test runner process.
  }
})