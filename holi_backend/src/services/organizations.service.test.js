import assert from 'node:assert/strict'
import test from 'node:test'
import { createOrganization, listOrganizations } from './organizations.service.js'

test('organization onboarding creates an isolated tenant and its first administrator in one transaction', async () => {
  const calls = []
  const connection = {
    async beginTransaction() { calls.push('begin') },
    async execute(sql, parameters) { calls.push({ sql, parameters }) },
    async commit() { calls.push('commit') },
    async rollback() { calls.push('rollback') },
    release() { calls.push('release') },
  }
  const database = { async getConnection() { return connection } }
  const organization = await createOrganization(database, {
    name: 'Comunidad Norte', slug: 'comunidad-norte',
    adminEmail: 'ADMIN@EXAMPLE.TEST', initialPassword: 'long-test-password',
  })

  assert.equal(organization.slug, 'comunidad-norte')
  assert.equal(organization.admin.email, 'admin@example.test')
  assert.equal(organization.admin.role, 'admin')
  assert.equal(calls[0], 'begin')
  assert.match(calls[1].sql, /INSERT INTO organizations/)
  assert.match(calls[2].sql, /INSERT INTO users/)
  assert.equal(calls[2].parameters[1], organization.id)
  assert.match(calls[2].parameters[3], /^\$2[aby]\$/)
  assert.match(calls[3].sql, /INSERT INTO subscriptions/)
  assert.equal(calls[4], 'commit')
})

test('invalid organization input is rejected before opening a database connection', async () => {
  const database = { async getConnection() { throw new Error('Should not acquire connection') } }
  await assert.rejects(createOrganization(database, {
    name: 'Invalid', slug: 'Invalid Slug', adminEmail: 'not-an-email', initialPassword: 'short',
  }), { status: 400 })
})

test('organization list returns tenant identifiers without passwords', async () => {
  const rows = [{ id: 'org-1', name: 'Comunidad Norte', slug: 'comunidad-norte', status: 'active', userCount: 1 }]
  const database = { async execute(sql) { assert.match(sql, /FROM organizations/); return [rows] } }
  assert.deepEqual(await listOrganizations(database), rows)
})