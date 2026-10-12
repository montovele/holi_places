import assert from 'node:assert/strict'
import test from 'node:test'
import { ensureBootstrapSuperadmin } from './database.js'

test('database startup skips optional superadmin bootstrap when credentials are absent', async () => {
  const warnings = []
  const database = {
    async execute(sql) {
      assert.match(sql, /role = 'superadmin'/)
      return [[]]
    },
  }

  await assert.doesNotReject(ensureBootstrapSuperadmin(database, {}, { warn: (message) => warnings.push(message) }))
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /La API continuará sin superadmin/)
})

test('existing superadmin skips bootstrap without requiring initial email or password', async () => {
  let writes = 0
  const database = {
    async execute(sql) {
      if (sql.includes('SELECT id')) return [[{ id: 'root-1' }]]
      writes += 1
      return [{ affectedRows: 1 }]
    },
  }

  await ensureBootstrapSuperadmin(database, {}, { warn() { assert.fail('No warning expected') } })
  assert.equal(writes, 0)
})

