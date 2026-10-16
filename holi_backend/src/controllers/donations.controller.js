import { database } from '../db/database.js'
import {
  createDonationCheckout,
  getDonationPaymentStatus,
  getDonationSettings,
  listDonations,
  publicDonationCampaign,
  saveDonationSettings,
} from '../services/donations.service.js'

export async function readPublicDonationCampaign(request, response) {
  const settings = await getDonationSettings(database)
  response.json({ data: publicDonationCampaign(settings) })
}

export async function createPublicDonationCheckout(request, response) {
  const checkout = await createDonationCheckout(database, request.body?.amount)
  response.status(201).json({ data: checkout })
}

export async function readPublicDonationPaymentStatus(request, response) {
  const status = await getDonationPaymentStatus(database, request.params.sessionId)
  response.json({ data: status })
}

export async function readDonationAdministration(request, response) {
  const [settings, donations] = await Promise.all([
    getDonationSettings(database),
    listDonations(database),
  ])
  response.json({ data: { ...settings, donations } })
}

export async function updateDonationAdministration(request, response) {
  const settings = await saveDonationSettings(database, request.auth.id, request.body || {})
  response.json({ data: settings })
}
