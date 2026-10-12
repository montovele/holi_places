import http from './http'

export async function getOrganizationUsers() {
  const { data } = await http.get('/admin/users')
  return data.users
}

export async function createOrganizationUser(user) {
  const { data } = await http.post('/admin/users', user)
  return data.user
}