import http from './http'
export { communityMediaSource } from './communityService'

export async function getMetaAppSettings() {
  const { data } = await http.get('/tenant/social/application')
  return data.data
}

export async function saveMetaAppSettings(settings) {
  const { data } = await http.put('/tenant/social/application', settings)
  return data.data
}

export async function resetMetaAppSettings() {
  const { data } = await http.delete('/tenant/social/application')
  return data.data
}

export async function getSocialSettings() {
  const { data } = await http.get('/tenant/social')
  return data.data
}

export async function createMetaConnectUrl() {
  const { data } = await http.post('/tenant/social/connect')
  return data.data.authorizationUrl
}

export async function selectMetaPage(pageId) {
  const { data } = await http.put('/tenant/social/page', { pageId })
  return data.data
}

export async function deleteSocialSettings() {
  await http.delete('/tenant/social')
}

export async function uploadCommunityMedia(file) {
  const formData = new FormData()
  formData.append('media', file)
  const { data } = await http.post('/tenant/social/media', formData, {
    timeout: 120000,
  })
  return data.data
}

export async function publishCommunityPost(post) {
  const { data } = await http.post('/tenant/social/publish', post, {
    timeout: 120000,
  })
  return data.data
}
