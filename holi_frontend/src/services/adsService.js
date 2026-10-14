import http from './http'

export async function listAds() {
  const { data } = await http.get('/admin/ads')
  return data.data || []
}

export async function getAdPricing() {
  const { data } = await http.get('/admin/ads/pricing')
  return data.data
}

export async function updateAdPricing(pricing) {
  const { data } = await http.put('/admin/ads/pricing', pricing)
  return data.data
}

export async function listAdPurchases() {
  const { data } = await http.get('/admin/ads/purchases')
  return data.data || []
}

export async function getOrganizationAds() {
  const { data } = await http.get('/tenant/ads')
  return data.data
}

export async function startOrganizationAdCheckout(purchase) {
  const { data } = await http.post('/tenant/ads/checkout', purchase)
  return data.data
}

export async function updateOrganizationAd(campaignId, campaign) {
  const { data } = await http.put(`/tenant/ads/${campaignId}`, campaign)
  return data.data
}

export async function setOrganizationAdStatus(campaignId, status) {
  const { data } = await http.patch(`/tenant/ads/${campaignId}/status`, { status })
  return data.data
}

export async function createAd(campaign) {
  const { data } = await http.post('/admin/ads', campaign)
  return data.data
}

export async function updateAd(campaignId, campaign) {
  const { data } = await http.put(`/admin/ads/${campaignId}`, campaign)
  return data.data
}

export async function deleteAd(campaignId) {
  await http.delete(`/admin/ads/${campaignId}`)
}

export async function uploadAdMedia(file, onUploadProgress) {
  return uploadMediaTo('/admin/ads/upload-image', file, onUploadProgress)
}

export async function uploadOrganizationAdMedia(file, onUploadProgress) {
  return uploadMediaTo('/tenant/ads/upload-image', file, onUploadProgress)
}

async function uploadMediaTo(endpoint, file, onUploadProgress) {
  const formData = new FormData()
  formData.append('image', file)
  const { data } = await http.post(endpoint, formData, {
    onUploadProgress: (event) => {
      if (event.total) onUploadProgress?.(Math.round((event.loaded / event.total) * 100))
    },
  })
  return data.data
}

export function adMediaSource(imageUrl) {
  if (!imageUrl || !/^\/api\/public\/media\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$/i.test(imageUrl)) return ''
  const apiOrigin = new URL(import.meta.env.VITE_API_URL || 'http://localhost:3002/api').origin
  return new URL(imageUrl, `${apiOrigin}/`).toString()
}

export function isVideoAdMedia(mediaUrl) {
  return /\.(mp4|webm)$/i.test(mediaUrl || '')
}

export async function retryOrganizationAdOrder(orderId) {
  const { data } = await http.post(`/tenant/ads/orders/${orderId}/retry`)
  return data.data
}

export async function getAdDisplaySettings() {
  const { data } = await http.get('/admin/ads/display-settings')
  return data.data
}

export async function updateAdDisplaySettings(settings) {
  const { data } = await http.put('/admin/ads/display-settings', settings)
  return data.data
}