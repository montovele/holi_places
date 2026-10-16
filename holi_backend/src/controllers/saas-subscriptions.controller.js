import { database } from '../db/database.js'
import {
  assignSaasSubscription,
  listSaasSubscriptions,
  updateManualSaasSubscription,
} from '../services/saas-subscriptions.service.js'

export async function readSaasSubscriptions(request, response) {
  response.json({ data: await listSaasSubscriptions(database) })
}

export async function addSaasSubscription(request, response) {
  const subscription = await assignSaasSubscription(database, request.body || {})
  response.status(201).json({ data: subscription })
}

export async function editSaasSubscription(request, response) {
  const subscription = await updateManualSaasSubscription(database, request.params.subscriptionId, request.body || {})
  response.json({ data: subscription })
}
