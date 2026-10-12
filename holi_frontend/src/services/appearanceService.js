import http from './http'

export async function getPublicAppearance() {
  const { data } = await http.get('/public/appearance')
  return data.appearance
}

export async function getAdminAppearance() {
  const { data } = await http.get('/admin/appearance')
  return data.appearance
}

export async function saveAdminAppearance(appearance) {
  const { data } = await http.put('/admin/appearance', appearance)
  return data.appearance
}
