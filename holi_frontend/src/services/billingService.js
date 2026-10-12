import http from './http'

export async function getPublicPlans() {
  const { data } = await http.get('/public/plans')
  return data.data || []
}

export async function registerCongregation(registration) {
  const { data } = await http.post('/public/registrations', registration)
  return data
}

export async function getSubscriptionStatus() {
  const { data } = await http.get('/billing/status')
  return data
}

export async function startSubscriptionCheckout(planId) {
  const { data } = await http.post('/billing/checkout', { plan_id: planId })
  return data
}