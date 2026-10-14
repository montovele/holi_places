import { database } from '../db/database.js'
import { detectAdMediaType, getAdMediaPath, saveAdMedia } from '../services/ads-media.service.js'
import { createCampaign, deleteCampaign, listCampaigns, listPublicAds, updateCampaign } from '../services/ads.service.js'
import { getAdDisplaySettings, listAdPurchases, getAdPricing, updateAdDisplaySettings, updateAdPricing } from '../services/ad-purchases.service.js'

export async function readCampaigns(request, response) {
  response.json({ data: await listCampaigns(database) })
}

export async function readAdPricing(request, response) {
  response.json({ data: await getAdPricing(database) })
}

export async function editAdPricing(request, response) {
  response.json({ data: await updateAdPricing(database, request.auth.id, request.body || {}) })
}

export async function readAdOrders(request, response) {
  response.json({ data: await listAdPurchases(database) })
}

export async function addCampaign(request, response) {
  response.status(201).json({ data: await createCampaign(database, request.auth.id, request.body || {}) })
}

export async function uploadCampaignImage(request, response) {
  if (!request.file) {
    return response.status(400).json({ error: { code: 'IMAGE_REQUIRED', message: 'Selecciona una imagen para subir.' } })
  }
  const mediaType = detectAdMediaType(request.file.buffer)
  if (!mediaType) {
    return response.status(400).json({ error: { code: 'INVALID_MEDIA', message: 'El archivo debe ser JPEG, PNG, WebP, MP4 o WebM válido.' } })
  }
  if (mediaType.kind === 'image' && request.file.size > 5 * 1024 * 1024) {
    return response.status(413).json({ error: { code: 'MEDIA_TOO_LARGE', message: 'La imagen no puede superar 5 MB.' } })
  }
  const media = await saveAdMedia(request.file.buffer)
  response.status(201).json({ data: { imageUrl: media.mediaUrl, mediaType: media.kind, contentType: media.contentType } })
}

export function readCampaignImage(request, response, next) {
  const mediaPath = getAdMediaPath(request.params.filename)
  if (!mediaPath) return response.status(404).end()
  response.sendFile(mediaPath, {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  }, (error) => {
    if (error && !response.headersSent) {
      if (error.code === 'ENOENT') return response.status(404).end()
      return next(error)
    }
  })
}

export async function editCampaign(request, response) {
  const campaign = await updateCampaign(database, request.params.campaignId, request.body || {})
  if (!campaign) return response.status(404).json({ error: { code: 'AD_NOT_FOUND', message: 'El anuncio solicitado no existe.' } })
  response.json({ data: campaign })
}

export async function removeCampaign(request, response) {
  const removed = await deleteCampaign(database, request.params.campaignId)
  if (!removed) return response.status(404).json({ error: { code: 'AD_NOT_FOUND', message: 'El anuncio solicitado no existe.' } })
  response.status(204).end()
}

export async function readAdDisplaySettings(request, response) {
  response.json({ data: await getAdDisplaySettings(database) })
}

export async function editAdDisplaySettings(request, response) {
  response.json({ data: await updateAdDisplaySettings(database, request.auth.id, request.body || {}) })
}

export async function readPublicAdRotation(request, response) {
  const [ads, settings] = await Promise.all([listPublicAds(database), getAdDisplaySettings(database)])
  response.json({ data: { ads, ...settings } })
}