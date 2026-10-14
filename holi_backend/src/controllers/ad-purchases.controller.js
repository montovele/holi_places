import { database } from '../db/database.js'
import {
  createOrganizationAdCheckout,
  getAdPricing,
  listAdPurchases,
  listOrganizationAds,
  retryOrganizationAdOrder,
  updateAdPricing,
  updateOrganizationAd,
  updateOrganizationAdStatus,
} from '../services/ad-purchases.service.js'

export async function readAdvertisingPricing(request, response) {
  response.json({ data: await getAdPricing(database) })
}

export async function saveAdvertisingPricing(request, response) {
  response.json({ data: await updateAdPricing(database, request.auth.id, request.body || {}) })
}

export async function readAdvertisingPurchases(request, response) {
  response.json({ data: await listAdPurchases(database) })
}

export async function readOrganizationAds(request, response) {
  const data = await listOrganizationAds(database, request.auth.organizationId)
  response.json({ data: { ...data, pricing: await getAdPricing(database) } })
}

export async function startOrganizationAdCheckout(request, response) {
  const checkout = await createOrganizationAdCheckout(database, request.auth, request.body || {})
  response.status(201).json({ data: checkout })
}

export async function editOrganizationAd(request, response) {
  const campaign = await updateOrganizationAd(
    database, request.auth.organizationId, request.params.campaignId, request.body || {},
  )
  if (!campaign) return response.status(404).json({ error: { code: 'AD_NOT_FOUND', message: 'No encontramos esa campaña de la congregación.' } })
  response.json({ data: campaign })
}

export async function changeOrganizationAdStatus(request, response) {
  const updated = await updateOrganizationAdStatus(
    database, request.auth.organizationId, request.params.campaignId, request.body?.status,
  )
  if (!updated) return response.status(409).json({ error: { code: 'AD_STATUS_CONFLICT', message: 'La campaña no tiene días pagados vigentes o no puede cambiar a ese estado.' } })
  response.json({ data: { status: request.body.status } })
}

export async function retryOrganizationAdvertisingOrder(request, response) {
  const checkout = await retryOrganizationAdOrder(
    database, request.auth, request.params.orderId,
  )
  response.json({ data: checkout })
}