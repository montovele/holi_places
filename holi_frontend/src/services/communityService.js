import http from './http'

export const getPublicCommunity = async () => {
  const { data } = await http.get('/public/community')
  return data
}