import { database } from '../db/database.js'
import { authenticateCredentials, createSessionToken, sessionLifetimeSeconds } from '../services/auth.service.js'

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api',
  maxAge: sessionLifetimeSeconds * 1000,
}

export async function login(request, response) {
  const user = await authenticateCredentials(database, request.body?.email, request.body?.password)
  response.cookie('holi_session', createSessionToken(user), cookieOptions)
  response.json({ user })
}

export function logout(request, response) {
  response.clearCookie('holi_session', { ...cookieOptions, maxAge: undefined })
  response.status(204).end()
}

export function currentUser(request, response) {
  response.json({ user: request.auth })
}