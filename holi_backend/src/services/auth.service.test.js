import assert from 'node:assert/strict'
import test from 'node:test'
import {
  authenticateCredentials,
  createSessionToken,
  hashPassword,
  verifySessionToken,
} from './auth.service.js'

process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters-long'

test('credentials are normalized and successful login returns no password hash', async () => {
  const passwordHash = await hashPassword('correct horse battery staple')
  const database = {
    async execute(sql, parameters) {
      assert.match(sql, /FROM users/)
      assert.deepEqual(parameters, ['admin@example.test'])
      return [[{
        id: 'user-1', email: 'admin@example.test', passwordHash,
        role: 'admin', organizationId: 'org-1', organizationName: 'Congregación Norte', status: 'active',
      }]]
    },
  }

  const user = await authenticateCredentials(database, ' Admin@Example.Test ', 'correct horse battery staple')
  assert.deepEqual(user, {
    id: 'user-1', email: 'admin@example.test', role: 'admin', organizationId: 'org-1', organizationName: 'Congregación Norte',
  })
})

test('invalid credentials share a generic unauthorized response', async () => {
  const database = { async execute() { return [[]] } }
  await assert.rejects(authenticateCredentials(database, 'missing@example.test', 'wrong'), {
    status: 401,
    message: 'Correo o contraseña incorrectos.',
  })
})

test('session tokens contain only the user subject and are signed', () => {
  const token = createSessionToken({ id: 'user-1', role: 'admin', organizationId: 'org-1' })
  assert.deepEqual(verifySessionToken(token).sub, 'user-1')
  assert.throws(() => verifySessionToken(`${token}invalid`))
})

test('password hashes reject inputs beyond bcrypt byte limits', async () => {
  await assert.rejects(hashPassword('a'.repeat(73)), { status: 400 })
})