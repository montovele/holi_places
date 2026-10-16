import http from './http'

export const getPublicCommunity = async () => {
  const { data } = await http.get('/public/community')
  return data
}

export const getPublicCommunityPost = async (postId) => {
  const { data } = await http.get(`/public/community/posts/${encodeURIComponent(postId)}`)
  return data.data
}

export const getPublicAdRotation = async () => {
  const { data } = await http.get('/public/ads/rotation')
  return data.data
}

export function communityMediaSource(mediaUrl) {
  if (!mediaUrl || !/^\/api\/public\/media\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$/i.test(mediaUrl)) return ''
  const apiOrigin = new URL(import.meta.env.VITE_API_URL || 'http://localhost:3002/api').origin
  return new URL(mediaUrl, `${apiOrigin}/`).toString()
}