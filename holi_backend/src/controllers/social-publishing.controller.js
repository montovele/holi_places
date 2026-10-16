import { randomBytes } from 'node:crypto'
import { database } from '../db/database.js'
import { detectAdMediaType, saveAdMedia } from '../services/ads-media.service.js'
import {
  createMetaAuthorizationUrl,
  createAndPublishCommunityPost,
  deleteMetaAppSettings,
  getMetaOAuthClientOrigin,
  readMetaAppSettings,
  readSocialConnection,
  removeSocialConnection,
  saveMetaAppSettings,
  selectMetaPage,
  completeMetaOAuth,
} from '../services/social-publishing.service.js'

function requireOrganization(request, response) {
  if (request.auth.organizationId) return request.auth.organizationId
  response.status(400).json({
    error: { code: 'ORGANIZATION_REQUIRED', message: 'Selecciona una congregación para administrar sus redes sociales.' },
  })
  return null
}

export async function readSocialSettings(request, response) {
  const organizationId = requireOrganization(request, response)
  if (!organizationId) return
  response.json({ data: await readSocialConnection(database, organizationId) })
}

export async function readMetaApplication(request, response) {
  const organizationId = requireOrganization(request, response)
  if (!organizationId) return
  response.json({ data: await readMetaAppSettings(database, organizationId) })
}

export async function updateMetaApplication(request, response) {
  const organizationId = requireOrganization(request, response)
  if (!organizationId) return
  response.json({
    data: await saveMetaAppSettings(database, organizationId, request.auth.id, request.body || {}),
  })
}

export async function resetMetaApplication(request, response) {
  const organizationId = requireOrganization(request, response)
  if (!organizationId) return
  response.json({ data: await deleteMetaAppSettings(database, organizationId) })
}

export async function beginMetaConnection(request, response) {
  const organizationId = requireOrganization(request, response)
  if (!organizationId) return
  response.json({ data: await createMetaAuthorizationUrl(database, organizationId, request.auth.id) })
}

export async function changeMetaPage(request, response) {
  const organizationId = requireOrganization(request, response)
  if (!organizationId) return
  response.json({ data: await selectMetaPage(database, organizationId, request.body?.pageId) })
}

export async function deleteSocialSettings(request, response) {
  const organizationId = requireOrganization(request, response)
  if (!organizationId) return
  await removeSocialConnection(database, organizationId)
  response.status(204).end()
}

export async function uploadCommunityMedia(request, response) {
  const organizationId = requireOrganization(request, response)
  if (!organizationId) return
  if (!request.file) {
    return response.status(400).json({ error: { code: 'MEDIA_REQUIRED', message: 'Selecciona una foto o video para subir.' } })
  }
  const mediaType = detectAdMediaType(request.file.buffer)
  if (!mediaType) {
    return response.status(400).json({ error: { code: 'INVALID_MEDIA', message: 'El archivo debe ser JPEG, PNG, WebP, MP4 o WebM válido.' } })
  }
  const maxSize = mediaType.kind === 'image' ? 10 * 1024 * 1024 : 100 * 1024 * 1024
  if (request.file.size > maxSize) {
    return response.status(413).json({ error: { code: 'MEDIA_TOO_LARGE', message: mediaType.kind === 'image' ? 'La imagen no puede superar 10 MB.' : 'El video no puede superar 100 MB.' } })
  }
  const media = await saveAdMedia(request.file.buffer)
  response.status(201).json({
    data: { mediaUrl: media.mediaUrl, mediaType: media.kind, contentType: media.contentType },
  })
}

export async function publishCommunityPost(request, response) {
  const organizationId = requireOrganization(request, response)
  if (!organizationId) return
  const post = await createAndPublishCommunityPost(database, organizationId, request.body || {})
  response.status(201).json({ data: post })
}

function callbackHtml(origin, result, nonce) {
  const payload = JSON.stringify({ type: 'holi-meta-oauth', ...result })
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conexión de Meta</title></head>
<body><p>La conexión con Meta terminó. Puedes cerrar esta ventana.</p>
<script nonce="${nonce}">if(window.opener){window.opener.postMessage(${payload},${JSON.stringify(origin)});}setTimeout(function(){window.close();},300);</script></body></html>`
}

export async function completeMetaConnection(request, response) {
  const origin = getMetaOAuthClientOrigin()
  let result
  try {
    const data = await completeMetaOAuth(database, {
      state: request.query.state,
      code: request.query.code,
      error: request.query.error,
      errorDescription: request.query.error_description,
    })
    result = { success: true, pages: data.pages }
  } catch (error) {
    result = { success: false, message: error.message || 'No se pudo completar la conexión con Meta.' }
  }
  const nonce = randomBytes(18).toString('base64')
  response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`)
  response.setHeader('Cache-Control', 'no-store')
  response.type('html').send(callbackHtml(origin, result, nonce))
}
