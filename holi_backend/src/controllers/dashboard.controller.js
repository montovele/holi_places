import { database } from '../db/database.js'
import { getOrganizationSubscription } from '../services/billing.service.js'
import { getDashboardData } from '../services/dashboard.service.js'

export async function getDashboardForAccount(database, auth, now = new Date()) {
  const subscription = await getOrganizationSubscription(database, auth.organizationId)
  if (auth.role !== 'superadmin' && subscription.status !== 'active') return { events: [], subscription }
  const dashboard = await getDashboardData(database, now, auth.organizationId)
  return { ...dashboard, subscription }
}

export async function readDashboard(request, response) {
  response.json(await getDashboardForAccount(database, request.auth))
}