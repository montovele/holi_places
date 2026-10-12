import http from './http'

export async function listPlans() {
  const { data } = await http.get('/admin/saas/plans')
  return data.data || []
}

export async function createPlan(plan) {
  const { data } = await http.post('/admin/saas/plans', plan)
  return data.data
}

export async function updatePlan(planId, plan) {
  const { data } = await http.put(`/admin/saas/plans/${planId}`, plan)
  return data.data
}

export async function deletePlan(planId) {
  const { data } = await http.delete(`/admin/saas/plans/${planId}`)
  return data.data
}

export async function createPlanPrice(planId, priceInput) {
  const { data } = await http.post(`/admin/saas/plans/${planId}/prices`, priceInput)
  return data.data
}

export async function getPublicPlans() {
  const { data } = await http.get('/public/plans')
  return data.data || []
}
