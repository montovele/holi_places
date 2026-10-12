import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const sessionLifetimeSeconds = 60 * 60

function configurationError() {
  const error = new Error('JWT_SECRET debe tener al menos 32 caracteres.')
  error.status = 500
  throw error
}

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret || Buffer.byteLength(secret) < 32) configurationError()
  return secret
}

export function assertAuthConfiguration() {
  getJwtSecret()
}

export async function hashPassword(password) {
  if (Buffer.byteLength(password, 'utf8') > 72) {
    const error = new Error('La contraseña no puede superar 72 bytes UTF-8.')
    error.status = 400
    throw error
  }
  return bcrypt.hash(password, 12)
}

export async function authenticateCredentials(database, email, password) {
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    const error = new Error('Correo y contraseña son obligatorios.')
    error.status = 400
    throw error
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    const error = new Error('Correo o contraseña incorrectos.')
    error.status = 401
    throw error
  }

  const [users] = await database.execute(`
    SELECT users.id, users.email, users.password_hash AS passwordHash, users.role,
      users.organization_id AS organizationId, organizations.name AS organizationName, users.status
    FROM users
    LEFT JOIN organizations ON organizations.id = users.organization_id
    WHERE email = ?
    LIMIT 1
  `, [email.trim().toLowerCase()])
  const user = users[0]
  const passwordMatches = user && user.status === 'active'
    ? await bcrypt.compare(password, user.passwordHash)
    : false

  if (!passwordMatches) {
    const error = new Error('Correo o contraseña incorrectos.')
    error.status = 401
    throw error
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    organizationName: user.organizationName,
  }
}

export function createSessionToken(user) {
  return jwt.sign({ sub: user.id }, getJwtSecret(), { expiresIn: sessionLifetimeSeconds })
}

export function verifySessionToken(token) {
  return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] })
}

export { sessionLifetimeSeconds }