import http from './http'

export async function listSaasSubscriptions() {
  const { data } = await http.get('/admin/saas/subscriptions')
  return data.data || []
}

export async function assignSaasSubscription(subscription) {
  const { data } = await http.post('/admin/saas/subscriptions', subscription)
  return data.data
}

export async function updateSaasSubscription(subscriptionId, subscription) {
  const { data } = await http.put(`/admin/saas/subscriptions/${encodeURIComponent(subscriptionId)}`, subscription)
  return data.data
}
