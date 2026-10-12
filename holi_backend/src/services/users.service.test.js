import assert from 'node:assert/strict'
import test from 'node:test'
import { createOrganizationUser, listOrganizationUsers } from './users.service.js'

test('organization administrators can create operators only inside their own tenant', async () => {
  let saved
  const database = {
    async execute(sql, parameters) {
      assert.match(sql, /INSERT INTO users/)
      saved = parameters
    },
  }
  const auth = { id: 'admin-1', role: 'admin', organizationId: 'org-north' }
  const user = await createOrganizationUser(database, auth, {
    email: 'operator@example.test', initialPassword: 'secure-test-password', role: 'operator',
  })
  assert.equal(user.organizationId, 'org-north')
  assert.equal(user.role, 'operator')
  assert.equal(saved[1], 'org-north')
  assert.match(saved[3], /^\$2[aby]\$/)
})

test('organization administrators cannot provision another administrator', async () => {
  const database = { async execute() { throw new Error('Should not write') } }
  await assert.rejects(createOrganizationUser(database, {
    id: 'admin-1', role: 'admin', organizationId: 'org-north',
  }, {
    email: 'other@example.test', initialPassword: 'secure-test-password', role: 'admin',
  }), { status: 403 })
})

test('user listing is always scoped to the active tenant', async () => {
  const database = {
    async execute(sql, parameters) {
      assert.match(sql, /WHERE organization_id = \? /)
      assert.deepEqual(parameters, ['org-north'])
      return [[{ id: 'operator-1', email: 'operator@example.test', role: 'operator' }]]
    },
  }
  const users = await listOrganizationUsers(database, 'org-north')
  assert.equal(users[0].role, 'operator')
  assert.deepEqual(await listOrganizationUsers(database, null), [])
})