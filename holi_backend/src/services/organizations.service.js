import { randomUUID } from 'node:crypto'
import { hashPassword } from './auth.service.js'

function invalid(message, status = 400) {
  const error = new Error(message)
  error.status = status
  throw error
}

export async function listOrganizations(database) {
  const [organizations] = await database.execute(`
    SELECT organizations.id, organizations.name, organizations.slug, organizations.status,
      COUNT(users.id) AS userCount
    FROM organizations LEFT JOIN users ON users.organization_id = organizations.id
    GROUP BY organizations.id, organizations.name, organizations.slug, organizations.status
    ORDER BY organizations.name
  `)
  return organizations
}

export async function createOrganization(database, input = {}) {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : ''
  const email = typeof input.adminEmail === 'string' ? input.adminEmail.trim().toLowerCase() : ''
  const password = input.initialPassword
  if (!name || name.length > 255) invalid('El nombre de la organización es obligatorio y no puede exceder 255 caracteres.')
  if (!/^[a-z0-9](?:[a-z0-9-]{1,98}[a-z0-9])?$/.test(slug)) invalid('El identificador debe usar letras minúsculas, números y guiones.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('El correo del administrador no es válido.')
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    invalid('La contraseña inicial debe tener al menos 12 caracteres y no superar 72 bytes UTF-8.')
  }

  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const organizationId = `org-${randomUUID()}`
    const userId = `user-${randomUUID()}`
    const subscriptionId = `sub-${randomUUID()}`
    await connection.execute('INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)', [organizationId, name, slug])
    await connection.execute(`
      INSERT INTO users (id, organization_id, email, password_hash, role, status)
      VALUES (?, ?, ?, ?, 'admin', 'active')
    `, [userId, organizationId, email, await hashPassword(password)])
    await connection.execute(`
      INSERT INTO subscriptions (id, organization_id, status, stripe_price_id)
      VALUES (?, ?, 'pending_payment', ?)
    `, [subscriptionId, organizationId, process.env.STRIPE_PRICE_ID || null])
    await connection.commit()
    return { id: organizationId, name, slug, admin: { id: userId, email, role: 'admin' } }
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') invalid('El identificador o correo ya está en uso.', 409)
    throw error
  } finally {
    connection.release()
  }
}