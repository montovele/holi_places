import http from './http'

export async function getPublicDonationCampaign() {
  const { data } = await http.get('/public/donations')
  return data.data
}

export async function createDonationCheckout(amount) {
  const { data } = await http.post('/public/donations/checkout', { amount })
  return data.data
}

export async function getPublicDonationPaymentStatus(sessionId) {
  const { data } = await http.get(`/public/donations/status/${encodeURIComponent(sessionId)}`)
  return data.data
}

export async function getDonationAdministration() {
  const { data } = await http.get('/admin/donations')
  return data.data
}

export async function updateDonationAdministration(settings) {
  const { data } = await http.put('/admin/donations', settings)
  return data.data
}
