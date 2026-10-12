import { database } from '../db/database.js'
import { createOrganization, listOrganizations } from '../services/organizations.service.js'

export async function readOrganizations(request, response) {
  response.json({ organizations: await listOrganizations(database) })
}

export async function addOrganization(request, response) {
  const organization = await createOrganization(database, request.body)
  response.status(201).json({ organization })
}