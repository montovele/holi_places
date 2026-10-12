import axios from 'axios'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3002/api',
  timeout: 8000,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
})

http.interceptors.request.use((request) => {
  const organizationId = globalThis.sessionStorage?.getItem('holi_organization_id')
  if (organizationId) request.headers['X-Organization-ID'] = organizationId
  return request
})

export default http