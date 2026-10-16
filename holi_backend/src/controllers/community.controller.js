import { database } from '../db/database.js'
import { getPublicCommunityData, getPublicCommunityPost } from '../services/community.service.js'

export async function readPublicCommunity(request, response) {
  response.json(await getPublicCommunityData(database))
}

export async function readPublicCommunityPost(request, response) {
  const post = await getPublicCommunityPost(database, request.params.postId)
  if (!post) {
    return response.status(404).json({
      error: { code: 'POST_NOT_FOUND', message: 'La publicación no existe o ya no está disponible públicamente.' },
    })
  }
  response.json({ data: post })
}