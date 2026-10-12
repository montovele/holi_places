import { randomUUID } from 'node:crypto'
import { hashPassword } from './auth.service.js'

function invalid(message, status = 400) {
  const error = new Error(message)
  error.status = status
  throw error
}

export async function listOrganizationUsers(database, organizationId) {
  if (!organizationId) return []
  const [users] = await database.execute(`
    SELECT id, email, role, status, created_at AS createdAt
    FROM users WHERE organization_id = ? ORDER BY email
  `, [organizationId])
  return users
}

export async function createOrganizationUser(database, auth, input = {}) {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const password = input.initialPassword
  const role = input.role || 'operator'
  if (!auth.organizationId) invalid('Selecciona una organización antes de administrar sus usuarios.', 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('El correo no es válido.')
  if (!['operator', 'admin'].includes(role)) invalid('El rol solicitado no es válido.')
  if (auth.role === 'admin' && role !== 'operator') invalid('Un administrador solo puede crear cuentas de operador.', 403)
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    invalid('La contraseña inicial debe tener al menos 12 caracteres y no superar 72 bytes UTF-8.')
  }

  const id = `user-${randomUUID()}`
  try {
    await database.execute(`
      INSERT INTO users (id, organization_id, email, password_hash, role, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `, [id, auth.organizationId, email, await hashPassword(password), role])
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') invalid('El correo ya está registrado.', 409)
    throw error
  }
  return { id, email, role, status: 'active', organizationId: auth.organizationId }
}