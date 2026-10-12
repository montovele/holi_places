import { database } from '../db/database.js'
import { readAppearance, saveAppearance } from '../services/appearance.service.js'

export async function readPublicAppearance(request, response) {
  response.json({ appearance: await readAppearance(database) })
}

export async function readAdminAppearance(request, response) {
  response.json({ appearance: await readAppearance(database) })
}

export async function updateAdminAppearance(request, response) {
  response.json({ appearance: await saveAppearance(database, request.body, request.auth.id) })
}