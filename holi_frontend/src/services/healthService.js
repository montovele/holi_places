import http from './http'

export const getHealth = async () => {
  const { data } = await http.get('/health')
  return data
}