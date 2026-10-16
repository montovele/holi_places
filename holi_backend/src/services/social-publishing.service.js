import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { detectAdMediaType, getAdMediaPath } from './ads-media.service.js'

const secretFieldNames = ['appId', 'appSecret', 'pageId', 'pageAccessToken', 'instagramBusinessAccountId']
const allowedMediaPath = /^\/api\/public\/media\/[0-9a-f-]{36}\.(?:jpg|png|webp|mp4|webm)$/i

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status })
}

function encryptionKey(configuration = process.env) {
  const value = configuration.SOCIAL_CREDENTIALS_ENCRYPTION_KEY
  if (!value) fail('Configura SOCIAL_CREDENTIALS_ENCRYPTION_KEY para guardar las credenciales sociales.', 503)

  let key
  if (/^[0-9a-f]{64}$/i.test(value)) key = Buffer.from(value, 'hex')
  else {
    key = Buffer.from(value, 'base64')
    if (key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) {
      fail('SOCIAL_CREDENTIALS_ENCRYPTION_KEY debe ser una clave de 32 bytes en hexadecimal o Base64.', 503)
    }
  }
  if (key.length !== 32) fail('SOCIAL_CREDENTIALS_ENCRYPTION_KEY debe contener exactamente 32 bytes.', 503)
  return key
}

function encryptCredentials(credentials, configuration) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(configuration), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()])
  return JSON.stringify({
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
  })
}

function decryptCredentials(encrypted, configuration) {
  try {
    const payload = JSON.parse(encrypted)
    if (payload.version !== 1) throw new Error('Unsupported credential version')
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(configuration), Buffer.from(payload.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
    return JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final(),
    ]).toString('utf8'))
  } catch (error) {
    if (error.status) throw error
    fail('No se pudieron descifrar las credenciales sociales; revisa la clave de cifrado configurada.', 503)
  }
}

function normalizeVersion(value) {
  if (typeof value !== 'string' || !/^v\d+\.\d+$/.test(value)) fail('La versión de Graph API debe tener el formato vNN.N.')
  return value
}

function normalizeCredentials(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Las credenciales deben enviarse como un objeto.')
  const credentials = { graphApiVersion: normalizeVersion(input.graphApiVersion || 'v23.0') }
  for (const name of secretFieldNames) {
    const value = input[name] === undefined || input[name] === null ? '' : input[name]
    if (typeof value !== 'string' || value.length > 4096) fail(`El campo ${name} no es válido.`)
    credentials[name] = value.trim()
  }
  for (const name of ['appId', 'pageId', 'instagramBusinessAccountId']) {
    if (credentials[name] && !/^\d+$/.test(credentials[name])) fail(`El campo ${name} debe contener solo dígitos.`)
  }
  return credentials
}

async function readStoredCredentials(database, organizationId, configuration) {
  const [rows] = await database.execute(
    'SELECT encrypted_credentials AS encryptedCredentials FROM social_connections WHERE organization_id = ? LIMIT 1',
    [organizationId],
  )
  return rows[0] ? decryptCredentials(rows[0].encryptedCredentials, configuration) : normalizeCredentials()
}

async function saveStoredCredentials(database, organizationId, actorId, credentials, configuration) {
  const encryptedCredentials = encryptCredentials(credentials, configuration)
  await database.execute(`
    INSERT INTO social_connections (organization_id, encrypted_credentials, updated_by)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE encrypted_credentials = VALUES(encrypted_credentials), updated_by = VALUES(updated_by)
  `, [organizationId, encryptedCredentials, actorId])
}

async function resolveMetaAppConfiguration(database, organizationId, configuration = process.env) {
  const credentials = await readStoredCredentials(database, organizationId, configuration)
  const hasOrganizationApp = Boolean(credentials.appId)
  return {
    ...configuration,
    META_APP_ID: hasOrganizationApp ? credentials.appId : configuration.META_APP_ID || '',
    META_APP_SECRET: hasOrganizationApp ? credentials.appSecret : configuration.META_APP_SECRET || '',
    META_GRAPH_API_VERSION: hasOrganizationApp
      ? credentials.graphApiVersion
      : configuration.META_GRAPH_API_VERSION || credentials.graphApiVersion,
  }
}

export async function readMetaAppSettings(database, organizationId, configuration = process.env) {
  const credentials = await readStoredCredentials(database, organizationId, configuration)
  const usesOrganizationSettings = Boolean(credentials.appId && credentials.appSecret)
  const hasOrganizationApp = Boolean(credentials.appId)
  const appId = hasOrganizationApp ? credentials.appId : configuration.META_APP_ID || ''
  const appSecret = hasOrganizationApp ? credentials.appSecret : configuration.META_APP_SECRET || ''
  return {
    appId,
    graphApiVersion: usesOrganizationSettings
      ? credentials.graphApiVersion
      : configuration.META_GRAPH_API_VERSION || credentials.graphApiVersion,
    appSecretConfigured: Boolean(appSecret),
    configured: Boolean(appId && appSecret),
    source: usesOrganizationSettings ? 'organization' : appId && appSecret ? 'environment' : 'unconfigured',
  }
}

export async function saveMetaAppSettings(database, organizationId, actorId, input, configuration = process.env) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('La configuración de Meta debe enviarse como un objeto.')
  const current = await readStoredCredentials(database, organizationId, configuration)
  const appId = typeof input.appId === 'string' ? input.appId.trim() : ''
  const appSecretInput = typeof input.appSecret === 'string' ? input.appSecret.trim() : ''
  const isCurrentOrganizationApp = current.appId === appId && Boolean(current.appSecret)
  const isConfiguredEnvironmentApp = !current.appId && configuration.META_APP_ID === appId
  const appSecret = appSecretInput
    || (isCurrentOrganizationApp ? current.appSecret : '')
    || (isConfiguredEnvironmentApp ? configuration.META_APP_SECRET || '' : '')
  const version = normalizeVersion(
    input.graphApiVersion
      || (current.appId ? current.graphApiVersion : configuration.META_GRAPH_API_VERSION)
      || current.graphApiVersion,
  )
  if (!/^\d+$/.test(appId)) fail('El ID de la aplicación Meta debe contener solo números.')
  if (!appSecret || appSecret.length > 4096) fail('Ingresa el App Secret válido de Meta.')
  const previousAppId = current.appId || configuration.META_APP_ID || ''
  const hasExistingSocialAccounts = Boolean(
    current.pages?.length || current.pageId || current.pageAccessToken || current.instagramBusinessAccountId,
  )
  const appChanged = previousAppId
    ? previousAppId !== appId
    : hasExistingSocialAccounts
  const updated = {
    ...current,
    appId,
    appSecret,
    graphApiVersion: version,
    ...(appChanged ? {
      pages: [],
      selectedPageId: '',
      pageId: '',
      pageAccessToken: '',
      instagramBusinessAccountId: '',
    } : {}),
  }
  if (appChanged) {
    await database.execute('DELETE FROM social_oauth_states WHERE organization_id = ?', [organizationId])
  }
  await saveStoredCredentials(database, organizationId, actorId, updated, configuration)
  return readMetaAppSettings(database, organizationId, configuration)
}

export async function deleteMetaAppSettings(database, organizationId, configuration = process.env) {
  await database.execute('DELETE FROM social_oauth_states WHERE organization_id = ?', [organizationId])
  await database.execute('DELETE FROM social_connections WHERE organization_id = ?', [organizationId])
  return readMetaAppSettings(database, organizationId, configuration)
}

export async function readSocialConnection(database, organizationId, configuration = process.env) {
  const [rows] = await database.execute(`
    SELECT id, name FROM locations
    WHERE organization_id = ? ORDER BY name
  `, [organizationId])
  const credentials = await readStoredCredentials(database, organizationId, configuration)
  const hasOrganizationApp = Boolean(credentials.appId)
  const pages = Array.isArray(credentials.pages)
    ? credentials.pages.map(({ id, name, instagramBusinessAccountId, instagramUsername }) => ({
      id,
      name,
      hasInstagram: Boolean(instagramBusinessAccountId),
      instagramUsername: instagramUsername || '',
    }))
    : credentials.pageId
      ? [{ id: credentials.pageId, name: 'Página conectada', hasInstagram: Boolean(credentials.instagramBusinessAccountId), instagramUsername: '' }]
      : []
  const selectedPage = Array.isArray(credentials.pages)
    ? credentials.pages.find(({ id }) => id === credentials.selectedPageId)
    : credentials
  return {
    graphApiVersion: credentials.graphApiVersion,
    metaAppConfigured: Boolean(
      hasOrganizationApp
        ? credentials.appSecret
        : configuration.META_APP_ID && configuration.META_APP_SECRET,
    ),
    selectedPageId: selectedPage?.id || '',
    pages,
    facebook: { configured: Boolean(selectedPage?.pageAccessToken) },
    instagram: { configured: Boolean(selectedPage?.instagramBusinessAccountId && selectedPage?.pageAccessToken) },
    locations: rows,
  }
}

export async function saveSocialConnection(database, organizationId, actorId, input, configuration = process.env) {
  const current = await readStoredCredentials(database, organizationId, configuration)
  const update = normalizeCredentials({ ...current, ...input })
  for (const name of secretFieldNames) {
    if (!input[name]?.trim()) update[name] = current[name] || ''
  }
  const encryptedCredentials = encryptCredentials(update, configuration)
  await database.execute(`
    INSERT INTO social_connections (organization_id, encrypted_credentials, updated_by)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE encrypted_credentials = VALUES(encrypted_credentials), updated_by = VALUES(updated_by)
  `, [organizationId, encryptedCredentials, actorId])
  return readSocialConnection(database, organizationId, configuration)
}

export async function removeSocialConnection(database, organizationId, configuration = process.env) {
  await database.execute('DELETE FROM social_oauth_states WHERE organization_id = ?', [organizationId])
  const credentials = await readStoredCredentials(database, organizationId, configuration)
  if (credentials.appId && credentials.appSecret) {
    await saveStoredCredentials(database, organizationId, null, {
      ...normalizeCredentials({ graphApiVersion: credentials.graphApiVersion }),
      appId: credentials.appId,
      appSecret: credentials.appSecret,
    }, configuration)
    return
  }
  await database.execute('DELETE FROM social_connections WHERE organization_id = ?', [organizationId])
}

function graphVersion(configuration) {
  return normalizeVersion(configuration.META_GRAPH_API_VERSION || 'v23.0')
}

function getApiOrigin(configuration) {
  const value = configuration.PUBLIC_API_ORIGIN
  let origin
  try {
    origin = new URL(value)
  } catch {
    fail('Configura PUBLIC_API_ORIGIN con el origen público de la API.', 503)
  }
  const localHttp = origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)
  if ((origin.protocol !== 'https:' && !localHttp) || origin.username || origin.password || origin.pathname !== '/') {
    fail('PUBLIC_API_ORIGIN debe ser un origen HTTPS válido; solo localhost puede usar HTTP.', 503)
  }
  return origin.origin
}

function getFrontendOrigin(configuration) {
  const value = configuration.FRONTEND_ORIGIN || 'http://localhost:5188'
  let origin
  try {
    origin = new URL(value)
  } catch {
    fail('Configura FRONTEND_ORIGIN con el origen de la aplicación web.', 503)
  }
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') {
    fail('FRONTEND_ORIGIN debe ser un origen HTTP(S) válido.', 503)
  }
  return origin.origin
}

function requireMetaApp(configuration) {
  if (!configuration.META_APP_ID || !/^\d+$/.test(configuration.META_APP_ID)) {
    fail('Configura el Meta App ID de esta congregación o define META_APP_ID en el servidor.', 503)
  }
  if (!configuration.META_APP_SECRET) fail('Configura el Meta App Secret de esta congregación o define META_APP_SECRET en el servidor.', 503)
}

export async function createMetaAuthorizationUrl(database, organizationId, actorId, configuration = process.env) {
  const appConfiguration = await resolveMetaAppConfiguration(database, organizationId, configuration)
  requireMetaApp(appConfiguration)
  const apiOrigin = getApiOrigin(appConfiguration)
  const version = graphVersion(appConfiguration)
  const state = randomBytes(32).toString('hex')
  const stateHash = createHash('sha256').update(state).digest('hex')
  await database.execute(`
    DELETE FROM social_oauth_states WHERE expires_at <= UTC_TIMESTAMP() OR consumed_at IS NOT NULL
  `)
  await database.execute(`
    INSERT INTO social_oauth_states (state_hash, organization_id, initiated_by, expires_at)
    VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))
  `, [stateHash, organizationId, actorId])

  const authorizationUrl = new URL(`https://www.facebook.com/${version}/dialog/oauth`)
  authorizationUrl.searchParams.set('client_id', appConfiguration.META_APP_ID)
  authorizationUrl.searchParams.set('redirect_uri', `${apiOrigin}/api/social/meta/callback`)
  authorizationUrl.searchParams.set('response_type', 'code')
  authorizationUrl.searchParams.set('state', state)
  authorizationUrl.searchParams.set('scope', [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'instagram_basic',
    'instagram_content_publish',
  ].join(','))
  return { authorizationUrl: authorizationUrl.toString() }
}

export function getMetaOAuthClientOrigin(configuration = process.env) {
  return getFrontendOrigin(configuration)
}

async function requestMetaJson(url, fetchImplementation) {
  const response = await fetchImplementation(url)
  const result = await response.json()
  if (!response.ok || result.error) {
    throw Object.assign(new Error(metaErrorMessage(result.error, 'Meta rechazó la solicitud de conexión.')), { status: 502 })
  }
  return result
}

function metaErrorMessage(error, fallback) {
  const description = error?.error_user_msg || error?.message || fallback
  const details = [
    error?.code ? `código ${error.code}` : '',
    error?.error_subcode ? `subcódigo ${error.error_subcode}` : '',
  ].filter(Boolean)
  return details.length ? `${description} (Meta: ${details.join(', ')}).` : description
}

async function listMetaPages(userAccessToken, version, fetchImplementation) {
  const pages = []
  let after = ''
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const url = new URL(`https://graph.facebook.com/${version}/me/accounts`)
    url.searchParams.set('fields', 'id,name,access_token')
    url.searchParams.set('limit', '100')
    url.searchParams.set('access_token', userAccessToken)
    if (after) url.searchParams.set('after', after)
    const result = await requestMetaJson(url, fetchImplementation)
    pages.push(...(result.data || []))
    after = result.paging?.cursors?.after || ''
    if (!result.paging?.next || !after) break
  }
  return Promise.all(pages.map(async ({ id, name, access_token: pageAccessToken }) => {
    if (!id || !pageAccessToken) return null
    const url = new URL(`https://graph.facebook.com/${version}/${id}`)
    url.searchParams.set('fields', 'instagram_business_account{id,username}')
    url.searchParams.set('access_token', pageAccessToken)
    const result = await requestMetaJson(url, fetchImplementation)
    const instagramBusinessAccountId = result.instagram_business_account?.id || ''
    const instagramUsername = result.instagram_business_account?.username || ''
    return { id, name: name || id, pageAccessToken, instagramBusinessAccountId, instagramUsername }
  })).then((resolved) => resolved.filter(Boolean))
}

export async function completeMetaOAuth(database, { state, code, error: oauthError, errorDescription }, options = {}) {
  const configuration = options.configuration || process.env
  if (oauthError) fail(errorDescription || 'Se canceló o rechazó la autorización de Meta.')
  if (typeof state !== 'string' || !/^[0-9a-f]{64}$/.test(state) || typeof code !== 'string' || !code) {
    fail('Meta devolvió una respuesta de autorización no válida.')
  }
  const stateHash = createHash('sha256').update(state).digest('hex')
  const [update] = await database.execute(`
    UPDATE social_oauth_states SET consumed_at = UTC_TIMESTAMP()
    WHERE state_hash = ? AND expires_at > UTC_TIMESTAMP() AND consumed_at IS NULL
  `, [stateHash])
  if (update.affectedRows !== 1) fail('El enlace de autorización expiró o ya fue utilizado. Intenta conectar de nuevo.', 400)
  const [states] = await database.execute(`
    SELECT organization_id AS organizationId, initiated_by AS initiatedBy
    FROM social_oauth_states WHERE state_hash = ? LIMIT 1
  `, [stateHash])
  const oauthState = states[0]
  if (!oauthState) fail('No encontramos la organización de esta autorización.', 400)

  const appConfiguration = await resolveMetaAppConfiguration(database, oauthState.organizationId, configuration)
  requireMetaApp(appConfiguration)
  const version = graphVersion(appConfiguration)
  const redirectUri = `${getApiOrigin(appConfiguration)}/api/social/meta/callback`
  const fetchImplementation = options.fetch || globalThis.fetch
  const exchangeUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`)
  exchangeUrl.searchParams.set('client_id', appConfiguration.META_APP_ID)
  exchangeUrl.searchParams.set('client_secret', appConfiguration.META_APP_SECRET)
  exchangeUrl.searchParams.set('redirect_uri', redirectUri)
  exchangeUrl.searchParams.set('code', code)
  const shortLivedToken = await requestMetaJson(exchangeUrl, fetchImplementation)
  if (!shortLivedToken.access_token) fail('Meta no devolvió un token de autorización válido.', 502)

  const longLivedUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`)
  longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token')
  longLivedUrl.searchParams.set('client_id', appConfiguration.META_APP_ID)
  longLivedUrl.searchParams.set('client_secret', appConfiguration.META_APP_SECRET)
  longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken.access_token)
  const longLivedToken = await requestMetaJson(longLivedUrl, fetchImplementation)
  if (!longLivedToken.access_token) fail('Meta no devolvió un token de larga duración.', 502)

  const pages = await listMetaPages(longLivedToken.access_token, version, fetchImplementation)
  if (!pages.length) fail('La cuenta autorizada no tiene páginas de Facebook que puedas administrar.')
  const previousCredentials = await readStoredCredentials(database, oauthState.organizationId, configuration)
  const credentials = {
    ...previousCredentials,
    graphApiVersion: version,
    pages,
    selectedPageId: pages[0].id,
    connectedAt: new Date().toISOString(),
  }
  await saveStoredCredentials(database, oauthState.organizationId, oauthState.initiatedBy, credentials, configuration)
  return { pages: pages.map(({ id, name, instagramBusinessAccountId, instagramUsername }) => ({ id, name, instagramBusinessAccountId, instagramUsername })) }
}

export async function selectMetaPage(database, organizationId, pageId, configuration = process.env) {
  if (typeof pageId !== 'string' || !pageId) fail('Selecciona una página de Facebook.')
  const credentials = await readStoredCredentials(database, organizationId, configuration)
  if (!Array.isArray(credentials.pages) || !credentials.pages.some(({ id }) => id === pageId)) {
    fail('La página seleccionada no está conectada a esta congregación.', 403)
  }
  credentials.selectedPageId = pageId
  const encryptedCredentials = encryptCredentials(credentials, configuration)
  await database.execute(`
    INSERT INTO social_connections (organization_id, encrypted_credentials)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE encrypted_credentials = VALUES(encrypted_credentials)
  `, [organizationId, encryptedCredentials])
  return readSocialConnection(database, organizationId, configuration)
}

function publicMediaUrl(mediaUrl, configuration) {
  if (!mediaUrl) return ''
  let origin
  try {
    origin = new URL(configuration.PUBLIC_API_ORIGIN)
  } catch {
    fail('Configura PUBLIC_API_ORIGIN con el origen público HTTPS de la API para publicar medios en Meta.', 503)
  }
  if (origin.protocol !== 'https:' || origin.username || origin.password) {
    fail('PUBLIC_API_ORIGIN debe ser un origen HTTPS válido y público.')
  }
  let supplied
  try {
    supplied = new URL(mediaUrl, origin)
  } catch {
    fail('El medio seleccionado no es válido.')
  }
  if (supplied.origin !== origin.origin || !allowedMediaPath.test(supplied.pathname)) {
    fail('Selecciona un medio que se haya subido a esta congregación.')
  }
  return new URL(supplied.pathname, origin).toString()
}

function localMediaPath(mediaUrl) {
  let media
  try {
    media = new URL(mediaUrl, 'https://local-media.invalid')
  } catch {
    fail('El medio seleccionado no es válido.')
  }
  if (media.origin !== 'https://local-media.invalid' || !allowedMediaPath.test(media.pathname)) {
    fail('Selecciona un medio que se haya subido a esta congregación.')
  }
  const filePath = getAdMediaPath(media.pathname.split('/').pop())
  if (!filePath) fail('El medio seleccionado no es válido.')
  return filePath
}

async function graphPost(path, parameters, graphApiVersion, fetchImplementation) {
  const isMultipart = parameters instanceof FormData
  const response = await fetchImplementation(`https://graph.facebook.com/${graphApiVersion}/${path}`, {
    method: 'POST',
    ...(isMultipart ? {} : { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }),
    body: isMultipart ? parameters : new URLSearchParams(parameters),
  })
  const result = await response.json()
  if (!response.ok || result.error) {
    const message = metaErrorMessage(result.error, 'Meta rechazó la solicitud de publicación.')
    throw Object.assign(new Error(message), { status: 502 })
  }
  return result
}

async function readPublishedPermalink(platform, postId, accessToken, graphApiVersion, fetchImplementation) {
  if (!postId) return {}
  const field = platform === 'instagram' ? 'permalink' : 'permalink_url'
  const url = new URL(`https://graph.facebook.com/${graphApiVersion}/${postId}`)
  url.searchParams.set('fields', field)
  url.searchParams.set('access_token', accessToken)
  try {
    const response = await fetchImplementation(url)
    const result = await response.json()
    if (!response.ok || result.error) {
      throw new Error(metaErrorMessage(result.error, 'Meta no devolvió el enlace de la publicación.'))
    }
    const permalinkUrl = result[field]
    if (typeof permalinkUrl !== 'string' || !/^https:\/\/(?:www\.)?(?:facebook|instagram)\.com\//.test(permalinkUrl)) {
      throw new Error('Meta publicó el contenido, pero no devolvió un enlace válido.')
    }
    return { permalinkUrl }
  } catch (error) {
    return { linkError: `Meta publicó el contenido, pero no se pudo obtener su enlace: ${error.message}` }
  }
}

async function publishInstagram(credentials, caption, mediaUrl, mediaType, fetchImplementation, wait) {
  if (!mediaUrl) fail('Instagram requiere una foto o video para publicar.')
  const isVideo = mediaType === 'video'
  const accountId = credentials.instagramBusinessAccountId
  const parameters = {
    access_token: credentials.pageAccessToken,
    caption,
    [isVideo ? 'video_url' : 'image_url']: mediaUrl,
  }
  if (isVideo) parameters.media_type = 'REELS'
  const container = await graphPost(
    `${accountId}/media`,
    parameters,
    credentials.graphApiVersion,
    fetchImplementation,
  )
  if (!container.id) fail('Meta no devolvió un identificador para el contenido de Instagram.', 502)

  if (isVideo) {
    let ready = false
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const url = new URL(`https://graph.facebook.com/${credentials.graphApiVersion}/${container.id}`)
      url.searchParams.set('fields', 'status_code')
      url.searchParams.set('access_token', credentials.pageAccessToken)
      const response = await fetchImplementation(url)
      const status = await response.json()
      if (!response.ok || status.error) {
        throw Object.assign(new Error(status.error?.message || 'No se pudo consultar el procesamiento del video en Instagram.'), { status: 502 })
      }
      if (status.status_code === 'FINISHED') {
        ready = true
        break
      }
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        fail('Meta no pudo procesar el video para Instagram.', 502)
      }
      await wait(2000)
    }
    if (!ready) fail('Meta sigue procesando el video. Intenta publicar de nuevo más tarde.', 504)
  }

  return graphPost(
    `${accountId}/media_publish`,
    { creation_id: container.id, access_token: credentials.pageAccessToken },
    credentials.graphApiVersion,
    fetchImplementation,
  )
}

async function publishFacebook(credentials, title, caption, mediaUrl, mediaType, fetchImplementation) {
  const parameters = { access_token: credentials.pageAccessToken }
  let endpoint = `${credentials.pageId}/feed`
  if (!mediaUrl) {
    parameters.message = caption || title
    return graphPost(endpoint, parameters, credentials.graphApiVersion, fetchImplementation)
  }

  let contents
  try {
    contents = await readFile(localMediaPath(mediaUrl))
  } catch (error) {
    if (error.code === 'ENOENT') fail('El archivo multimedia ya no está disponible. Súbelo de nuevo antes de publicar.')
    throw error
  }

  const detectedMedia = detectAdMediaType(contents)
  if (!detectedMedia || detectedMedia.kind !== mediaType) {
    fail('El archivo multimedia no coincide con el tipo seleccionado. Súbelo de nuevo.')
  }
  endpoint = `${credentials.pageId}/${mediaType === 'video' ? 'videos' : 'photos'}`
  if (mediaType === 'image' && contents.length > 4 * 1024 * 1024) {
    fail('Facebook admite imágenes de hasta 4 MB. Reduce el tamaño de la imagen y vuelve a subirla.')
  }
  const formData = new FormData()
  formData.set('access_token', credentials.pageAccessToken)
  formData.set(mediaType === 'video' ? 'description' : 'caption', caption)
  formData.set('source', new Blob([contents], { type: detectedMedia.contentType }), mediaUrl.split('/').pop())
  return graphPost(endpoint, formData, credentials.graphApiVersion, fetchImplementation)
}

export async function createAndPublishCommunityPost(database, organizationId, input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('El contenido debe enviarse como un objeto.')
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  const locationId = typeof input.locationId === 'string' ? input.locationId.trim() : ''
  const type = input.type || 'article'
  const mediaType = input.mediaType || 'image'
  if (input.platforms !== undefined && !Array.isArray(input.platforms)) fail('La lista de redes sociales no es válida.')
  const platforms = [...new Set(input.platforms || [])]
  if (!title || title.length > 255) fail('El título debe tener entre 1 y 255 caracteres.')
  if (body.length > 5000) fail('El texto no puede superar 5000 caracteres.')
  if (!locationId) fail('Selecciona una sede o congregación.')
  if (!['article', 'activity'].includes(type)) fail('El tipo de publicación no es válido.')
  if (!['image', 'video'].includes(mediaType)) fail('El tipo de medio no es válido.')
  if (platforms.some((platform) => !['facebook', 'instagram'].includes(platform))) fail('Selecciona redes sociales válidas.')
  const mediaUrl = typeof input.mediaUrl === 'string' ? input.mediaUrl.trim() : ''
  if (mediaType === 'video' && !mediaUrl) fail('Sube un video antes de publicar.')
  if (mediaUrl) localMediaPath(mediaUrl)
  const configuration = options.configuration || process.env
  const frontendOrigin = getFrontendOrigin(configuration)

  const [locations] = await database.execute(
    'SELECT id FROM locations WHERE id = ? AND organization_id = ? LIMIT 1',
    [locationId, organizationId],
  )
  if (!locations.length) fail('La sede seleccionada no pertenece a esta congregación.', 403  )

  const postId = randomUUID()
  const communityUrl = new URL('/comunidad', frontendOrigin)
  communityUrl.searchParams.set('post', postId)
  const communityPostUrl = communityUrl.toString()
  await database.execute(`
    INSERT INTO community_posts
      (id, location_id, type, title, excerpt, body, image_url, media_type, status, published_at, organization_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
  `, [
    postId,
    locationId,
    type,
    title,
    body.slice(0, 500),
    body,
    mediaUrl,
    mediaUrl ? mediaType : 'image',
    new Date().toISOString(),
    organizationId,
  ])

  const credentials = await readStoredCredentials(database, organizationId, options.configuration || process.env)
  const fetchImplementation = options.fetch || globalThis.fetch
  const wait = options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const caption = [
    [title, body].filter(Boolean).join('\n\n'),
    `Ver publicación en Holi Places: ${communityPostUrl}`,
  ].filter(Boolean).join('\n\n')
  const selectedPage = Array.isArray(credentials.pages)
    ? credentials.pages.find(({ id }) => id === credentials.selectedPageId)
    : null
  const publishCredentials = selectedPage
    ? {
      ...credentials,
      pageId: selectedPage.id,
      pageAccessToken: selectedPage.pageAccessToken,
      instagramBusinessAccountId: selectedPage.instagramBusinessAccountId,
    }
    : credentials
  const results = await Promise.all(platforms.map(async (platform) => {
    try {
      let result
      if (platform === 'facebook') {
        if (!publishCredentials.pageId || !publishCredentials.pageAccessToken) fail('Conecta una página de Facebook antes de publicar.', 400)
        result = await publishFacebook(publishCredentials, title, caption, mediaUrl, mediaType, fetchImplementation)
      } else {
        if (!publishCredentials.instagramBusinessAccountId || !publishCredentials.pageAccessToken) fail('Conecta una cuenta profesional de Instagram a la página seleccionada.', 400)
        const absoluteMediaUrl = publicMediaUrl(mediaUrl, options.configuration || process.env)
        result = await publishInstagram(publishCredentials, caption, absoluteMediaUrl, mediaType, fetchImplementation, wait)
      }
      const metaPostId = platform === 'facebook' ? result.post_id || result.id : result.id
      const permalink = await readPublishedPermalink(
        platform,
        metaPostId,
        publishCredentials.pageAccessToken,
        publishCredentials.graphApiVersion,
        fetchImplementation,
      )
      return { platform, success: true, postId: result.id || null, ...permalink }
    } catch (error) {
      return { platform, success: false, message: error.message }
    }
  }))
  return { postId, communityUrl: communityPostUrl, results }
}
