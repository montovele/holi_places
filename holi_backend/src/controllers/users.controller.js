import { database } from '../db/database.js'
import { createOrganizationUser, listOrganizationUsers } from '../services/users.service.js'

export async function readOrganizationUsers(request, response) {
  response.json({ users: await listOrganizationUsers(database, request.auth.organizationId) })
}

export async function addOrganizationUser(request, response) {
  const user = await createOrganizationUser(database, request.auth, request.body)
  response.status(201).json({ user })
}