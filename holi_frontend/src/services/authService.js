import http from './http'

export async function login(credentials) {
  const { data } = await http.post('/auth/login', credentials)
  return data.user
}

export async function getCurrentUser() {
  const { data } = await http.get('/auth/me')
  return data.user
}

export async function logout() {
  await http.post('/auth/logout')
}

export async function getOrganizations() {
  const { data } = await http.get('/admin/organizations')
  return data.organizations
}

export async function createOrganization(organization) {
  const { data } = await http.post('/admin/organizations', organization)
  return data.organization
}