import { database } from '../db/database.js'
import { getPublicCommunityData } from '../services/community.service.js'

export async function readPublicCommunity(request, response) {
  response.json(await getPublicCommunityData(database))
}