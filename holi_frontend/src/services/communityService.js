import http from './http'

export const getPublicCommunity = async () => {
  const { data } = await http.get('/public/community')
  return data
}

export const getPublicAdRotation = async () => {
  const { data } = await http.get('/public/ads/rotation')
  return data.data
}