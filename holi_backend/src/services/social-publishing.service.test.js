import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { deleteAdMedia, saveAdMedia } from './ads-media.service.js'
import {
  completeMetaOAuth,
  createMetaAuthorizationUrl,
  createAndPublishCommunityPost,
  readMetaAppSettings,
  readSocialConnection,
  removeSocialConnection,
  saveMetaAppSettings,
  saveSocialConnection,
  selectMetaPage,
} from './social-publishing.service.js'

const encryptionKey = Buffer.alloc(32, 7).toString('base64')
const configuration = {
  SOCIAL_CREDENTIALS_ENCRYPTION_KEY: encryptionKey,
  PUBLIC_API_ORIGIN: 'https://api.example.test',
  FRONTEND_ORIGIN: 'https://app.example.test',
}

function createDatabase({ locationId = 'location-1' } = {}) {
  const encryptedCredentials = new Map()
  const posts = []
  const calls = []
  return {
    posts,
    calls,
    async execute(sql, parameters = []) {
      calls.push(sql)
      if (sql.includes('FROM social_connections')) {
        const stored = encryptedCredentials.get(parameters[0])
        return [stored ? [{ encryptedCredentials: stored }] : []]
      }
      if (sql.includes('FROM locations') && sql.includes('ORDER BY name')) {
        return [[{ id: locationId, name: 'Sede Central' }]]
      }
      if (sql.includes('FROM locations') && sql.includes('id = ?')) {
        return [parameters[0] === locationId ? [{ id: locationId }] : []]
      }
      if (sql.includes('INSERT INTO social_connections')) {
        encryptedCredentials.set(parameters[0], parameters[1])
        return [{ affectedRows: 1 }]
      }
      if (sql.includes('DELETE FROM social_connections')) {
        encryptedCredentials.delete(parameters[0])
        return [{ affectedRows: 1 }]
      }
      if (sql.includes('SELECT organization_id AS organizationId')) {
        return [[{ organizationId: 'organization-1', initiatedBy: 'admin-1' }]]
      }
      if (sql.includes('social_oauth_states')) {
        return [{ affectedRows: 1 }]
      }
      if (sql.includes('INSERT INTO community_posts')) {
        posts.push(parameters)
        return [{ affectedRows: 1 }]
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
}

test('social credentials are encrypted and never returned by the connection reader', async () => {
  const database = createDatabase()
  const saved = await saveSocialConnection(database, 'organization-1', 'admin-1', {
    appId: '123456',
    appSecret: 'private-app-secret',
    pageId: '987654',
    pageAccessToken: 'private-page-token',
    instagramBusinessAccountId: '444555',
    graphApiVersion: 'v24.0',
  }, configuration)

  assert.equal(saved.facebook.configured, true)
  assert.equal(saved.instagram.configured, true)
  assert.equal(JSON.stringify(saved).includes('private-page-token'), false)
  assert.equal(JSON.stringify(saved).includes('private-app-secret'), false)
  assert.equal(database.calls.some((sql) => sql.includes('INSERT INTO social_connections')), true)
})

test('publishing uploads Facebook photos directly instead of relying on a public media URL', async () => {
  const database = createDatabase()
  const media = await saveAdMedia(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]))
  await saveSocialConnection(database, 'organization-1', 'admin-1', {
    pageId: '987654',
    pageAccessToken: 'private-page-token',
    graphApiVersion: 'v24.0',
  }, configuration)
  const requests = []
  try {
    const result = await createAndPublishCommunityPost(database, 'organization-1', {
      locationId: 'location-1',
      type: 'activity',
      title: 'Celebración comunitaria',
      body: 'Te esperamos este domingo.',
      mediaUrl: media.mediaUrl,
      mediaType: 'image',
      platforms: ['facebook'],
    }, {
      configuration: { ...configuration, SOCIAL_CREDENTIALS_ENCRYPTION_KEY: encryptionKey },
      fetch: async (url, options) => {
        requests.push({ url: String(url), options })
        if (String(url).includes('/facebook-post-1?')) {
          return { ok: true, json: async () => ({ permalink_url: 'https://www.facebook.com/page/posts/123' }) }
        }
        return { ok: true, json: async () => ({ id: 'facebook-post-1' }) }
      },
    })

    assert.equal(database.posts.length, 1)
    assert.equal(database.posts[0][2], 'activity')
    assert.equal(database.posts[0][7], 'image')
    assert.equal(result.results[0].success, true)
    assert.equal(result.results[0].postId, 'facebook-post-1')
    assert.equal(result.results[0].permalinkUrl, 'https://www.facebook.com/page/posts/123')
    assert.match(requests[0].options.body.get('caption'), /Ver publicación en Holi Places: https:\/\/app\.example\.test\/comunidad\?post=/)
    const communityUrl = new URL(result.communityUrl)
    assert.equal(communityUrl.origin, 'https://app.example.test')
    assert.equal(communityUrl.pathname, '/comunidad')
    assert.match(communityUrl.searchParams.get('post'), /^[0-9a-f-]{36}$/i)
    assert.match(requests[0].url, /987654\/photos$/)
    assert.equal(requests[0].options.headers, undefined)
    assert.equal(requests[0].options.body.get('access_token'), 'private-page-token')
    assert.match(requests[0].options.body.get('caption'), /^Celebración comunitaria\n\nTe esperamos este domingo\.\n\nVer publicación en Holi Places:/)
    const uploadedPhoto = requests[0].options.body.get('source')
    assert.equal(uploadedPhoto.name, media.mediaUrl.split('/').pop())
    assert.deepEqual(Buffer.from(await uploadedPhoto.arrayBuffer()), Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]))
  } finally {
    await deleteAdMedia(media.mediaUrl)
  }
})

test('Facebook video publishing uploads the video bytes directly to the Page videos endpoint', async () => {
  const database = createDatabase()
  const media = await saveAdMedia(Buffer.from('0000ftypisom0000', 'ascii'))
  await saveSocialConnection(database, 'organization-1', 'admin-1', {
    pageId: '987654',
    pageAccessToken: 'private-page-token',
  }, configuration)
  let request

  try {
    const result = await createAndPublishCommunityPost(database, 'organization-1', {
      locationId: 'location-1',
      title: 'Video de la congregación',
      body: 'Mensaje en video.',
      mediaUrl: media.mediaUrl,
      mediaType: 'video',
      platforms: ['facebook'],
    }, {
      configuration: { ...configuration, SOCIAL_CREDENTIALS_ENCRYPTION_KEY: encryptionKey },
      fetch: async (url, options) => {
        if (String(url).includes('/facebook-video-1?')) {
          return { ok: true, json: async () => ({ permalink_url: 'https://www.facebook.com/page/videos/456' }) }
        }
        request = { url: String(url), options }
        return { ok: true, json: async () => ({ id: 'facebook-video-1' }) }
      },
    })

    assert.equal(result.results[0].success, true)
    assert.equal(result.results[0].permalinkUrl, 'https://www.facebook.com/page/videos/456')
    assert.match(request.url, /987654\/videos$/)
    assert.equal(request.options.body.get('access_token'), 'private-page-token')
    assert.match(request.options.body.get('description'), /^Video de la congregación\n\nMensaje en video\.\n\nVer publicación en Holi Places:/)
    assert.match(request.options.body.get('description'), new RegExp(result.communityUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.deepEqual(Buffer.from(await request.options.body.get('source').arrayBuffer()), Buffer.from('0000ftypisom0000', 'ascii'))
  } finally {
    await deleteAdMedia(media.mediaUrl)
  }
})

test('Facebook image uploads over 4 MB fail with the platform size limit before calling Meta', async () => {
  const database = createDatabase()
  const imageContents = Buffer.alloc(4 * 1024 * 1024 + 1)
  imageContents.set([0xff, 0xd8, 0xff])
  const media = await saveAdMedia(imageContents)
  await saveSocialConnection(database, 'organization-1', 'admin-1', {
    pageId: '987654',
    pageAccessToken: 'private-page-token',
  }, configuration)
  let fetchCalled = false

  try {
    const result = await createAndPublishCommunityPost(database, 'organization-1', {
      locationId: 'location-1',
      title: 'Imagen grande',
      mediaUrl: media.mediaUrl,
      mediaType: 'image',
      platforms: ['facebook'],
    }, {
      configuration: { ...configuration, SOCIAL_CREDENTIALS_ENCRYPTION_KEY: encryptionKey },
      fetch: async () => {
        fetchCalled = true
        return { ok: true, json: async () => ({ id: 'unexpected-post' }) }
      },
    })

    assert.equal(result.results[0].success, false)
    assert.match(result.results[0].message, /Facebook admite imágenes de hasta 4 MB/)
    assert.equal(fetchCalled, false)
  } finally {
    await deleteAdMedia(media.mediaUrl)
  }
})

test('Instagram video publishing waits for Meta processing before publishing the reel', async () => {
  const database = createDatabase()
  await saveSocialConnection(database, 'organization-1', 'admin-1', {
    pageAccessToken: 'private-page-token',
    instagramBusinessAccountId: '444555',
    graphApiVersion: 'v24.0',
  }, configuration)
  const requests = []
  const result = await createAndPublishCommunityPost(database, 'organization-1', {
    locationId: 'location-1',
    title: 'Un encuentro especial',
    body: 'Resumen de la reunión.',
    mediaUrl: '/api/public/media/123e4567-e89b-12d3-a456-426614174000.mp4',
    mediaType: 'video',
    platforms: ['instagram'],
  }, {
    configuration,
    wait: async () => {},
    fetch: async (url, options = {}) => {
      requests.push({ url: String(url), options })
      if (String(url).endsWith('/444555/media')) return { ok: true, json: async () => ({ id: 'container-1' }) }
      if (String(url).includes('/container-1?')) return { ok: true, json: async () => ({ status_code: 'FINISHED' }) }
      if (String(url).includes('/instagram-post-1?')) return { ok: true, json: async () => ({ permalink: 'https://www.instagram.com/p/abc123/' }) }
      return { ok: true, json: async () => ({ id: 'instagram-post-1' }) }
    },
  })

  assert.equal(result.results[0].success, true)
  assert.equal(result.results[0].postId, 'instagram-post-1')
  assert.equal(result.results[0].permalinkUrl, 'https://www.instagram.com/p/abc123/')
  assert.match(requests[0].options.body.get('caption'), /Ver publicación en Holi Places: https:\/\/app\.example\.test\/comunidad\?post=/)
  assert.equal(new URLSearchParams(requests[0].options.body).get('media_type'), 'REELS')
  assert.equal(new URLSearchParams(requests[0].options.body).get('video_url'), 'https://api.example.test/api/public/media/123e4567-e89b-12d3-a456-426614174000.mp4')
  assert.equal(requests.some(({ url }) => url.endsWith('/container-1?fields=status_code&access_token=private-page-token')), true)
})

test('Meta publishing errors are reported without discarding the public community post', async () => {
  const database = createDatabase()
  await saveSocialConnection(database, 'organization-1', 'admin-1', {
    pageId: '987654',
    pageAccessToken: 'private-page-token',
  }, configuration)
  const result = await createAndPublishCommunityPost(database, 'organization-1', {
    locationId: 'location-1',
    title: 'Aviso comunitario',
    body: 'Información importante.',
    platforms: ['facebook'],
  }, {
    configuration,
    fetch: async () => ({ ok: false, json: async () => ({ error: { message: 'Permisos insuficientes.' } }) }),
  })

  assert.equal(database.posts.length, 1)
  assert.equal(database.posts[0][2], 'article')
  assert.deepEqual(result.results, [{ platform: 'facebook', success: false, message: 'Permisos insuficientes.' }])
})

test('Facebook Graph API error codes are included to diagnose invalid parameters', async () => {
  const database = createDatabase()
  await saveSocialConnection(database, 'organization-1', 'admin-1', {
    pageId: '987654',
    pageAccessToken: 'private-page-token',
  }, configuration)
  const result = await createAndPublishCommunityPost(database, 'organization-1', {
    locationId: 'location-1',
    title: 'Aviso comunitario',
    platforms: ['facebook'],
  }, {
    configuration,
    fetch: async () => ({
      ok: false,
      json: async () => ({ error: { message: 'Invalid parameter', code: 100, error_subcode: 1366046 } }),
    }),
  })

  assert.equal(result.results[0].success, false)
  assert.match(result.results[0].message, /Invalid parameter \(Meta: código 100, subcódigo 1366046\)/)
})

test('publishing refuses a location belonging to another congregation', async () => {
  const database = createDatabase()
  await assert.rejects(
    createAndPublishCommunityPost(database, 'organization-1', {
      locationId: 'location-other',
      title: 'Contenido',
      body: '',
      platforms: [],
    }, { configuration }),
    { status: 403 },
  )
  assert.equal(database.posts.length, 0)
})

test('publishing to Meta is allowed with a localhost community link during development', async () => {
  const database = createDatabase()
  await saveSocialConnection(database, 'organization-1', 'admin-1', {
    pageId: '987654',
    pageAccessToken: 'private-page-token',
  }, configuration)

  const result = await createAndPublishCommunityPost(database, 'organization-1', {
      locationId: 'location-1',
      title: 'Anuncio local',
      platforms: ['facebook'],
    }, {
      configuration: {
        ...configuration,
        FRONTEND_ORIGIN: 'http://localhost:5188',
      },
      fetch: async (url, options) => {
        if (options?.method === 'POST') {
          assert.match(options.body.get('message'), /Ver publicación en Holi Places: http:\/\/localhost:5188\/comunidad\?post=/)
          return { ok: true, json: async () => ({ id: 'facebook-post-local' }) }
        }
        if (String(url).includes('/facebook-post-local?')) {
          return { ok: true, json: async () => ({ permalink_url: 'https://www.facebook.com/page/posts/local' }) }
        }
        throw new Error(`Unexpected Meta request: ${url}`)
      },
    })
  assert.equal(database.posts.length, 1)
  assert.equal(result.results[0].success, true)
  assert.match(result.communityUrl, /^http:\/\/localhost:5188\/comunidad\?post=/)
})

test('reading credentials reports a clear configuration error when stored secrets cannot be decrypted', async () => {
  const database = createDatabase()
  await saveSocialConnection(database, 'organization-1', 'admin-1', { pageId: '987654' }, configuration)
  await assert.rejects(
    readSocialConnection(database, 'organization-1', { SOCIAL_CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64') }),
    /No se pudieron descifrar las credenciales sociales/,
  )
})

test('Meta authorization opens the configured app with a hashed, tenant-bound OAuth state', async () => {
  const database = createDatabase()
  const { authorizationUrl } = await createMetaAuthorizationUrl(database, 'organization-1', 'admin-1', {
    ...configuration,
    META_APP_ID: '123456789',
    META_APP_SECRET: 'server-only-app-secret',
  })
  const authorization = new URL(authorizationUrl)
  assert.equal(authorization.origin, 'https://www.facebook.com')
  assert.equal(authorization.searchParams.get('client_id'), '123456789')
  assert.equal(authorization.searchParams.get('redirect_uri'), 'https://api.example.test/api/social/meta/callback')
  assert.match(authorization.searchParams.get('state'), /^[0-9a-f]{64}$/)
  assert.match(authorization.searchParams.get('scope'), /pages_manage_posts/)
  assert.equal(database.calls.some((sql) => sql.includes('social_oauth_states')), true)
})

test('Meta app credentials are managed per congregation and secrets stay encrypted', async () => {
  const database = createDatabase()
  const saved = await saveMetaAppSettings(database, 'organization-1', 'admin-1', {
    appId: '123456789',
    appSecret: 'organization-one-secret',
    graphApiVersion: 'v24.0',
  }, configuration)

  assert.equal(saved.configured, true)
  assert.equal(saved.appId, '123456789')
  assert.equal(saved.appSecretConfigured, true)
  assert.equal(saved.source, 'organization')
  assert.equal(JSON.stringify(saved).includes('organization-one-secret'), false)
  assert.equal(database.calls.some((sql) => sql.includes('INSERT INTO social_connections')), true)

  await saveMetaAppSettings(database, 'organization-2', 'admin-2', {
    appId: '987654321',
    appSecret: 'organization-two-secret',
    graphApiVersion: 'v25.0',
  }, configuration)
  const [organizationOneSettings, organizationTwoSettings] = await Promise.all([
    readMetaAppSettings(database, 'organization-1', configuration),
    readMetaAppSettings(database, 'organization-2', configuration),
  ])
  assert.equal(organizationOneSettings.appId, '123456789')
  assert.equal(organizationTwoSettings.appId, '987654321')
  assert.equal(JSON.stringify(organizationTwoSettings).includes('organization-one-secret'), false)

  const authorizedOne = await createMetaAuthorizationUrl(database, 'organization-1', 'admin-1', configuration)
  const authorizedTwo = await createMetaAuthorizationUrl(database, 'organization-2', 'admin-2', configuration)
  const urlOne = new URL(authorizedOne.authorizationUrl)
  const urlTwo = new URL(authorizedTwo.authorizationUrl)
  assert.equal(urlOne.searchParams.get('client_id'), '123456789')
  assert.equal(urlOne.pathname, '/v24.0/dialog/oauth')
  assert.equal(urlTwo.searchParams.get('client_id'), '987654321')
  assert.equal(urlTwo.pathname, '/v25.0/dialog/oauth')

  await assert.rejects(
    saveMetaAppSettings(database, 'organization-1', 'admin-1', {
      appId: 'not-numeric',
      appSecret: 'another-secret',
    }, configuration),
    /solo números/,
  )
  await assert.rejects(
    saveMetaAppSettings(database, 'organization-1', 'admin-1', {
      appId: '111222333',
    }, {
      ...configuration,
      META_APP_ID: '123456789',
      META_APP_SECRET: 'unrelated-environment-secret',
    }),
    /App Secret válido/,
  )
})

test('disconnecting social accounts preserves the congregation Meta app credentials', async () => {
  const database = createDatabase()
  await saveMetaAppSettings(database, 'organization-1', 'admin-1', {
    appId: '123456789',
    appSecret: 'organization-one-secret',
  }, configuration)
  await saveSocialConnection(database, 'organization-1', 'admin-1', {
    pageId: '987654',
    pageAccessToken: 'private-page-token',
  }, configuration)

  await removeSocialConnection(database, 'organization-1', configuration)

  const app = await readMetaAppSettings(database, 'organization-1', configuration)
  const connection = await readSocialConnection(database, 'organization-1', configuration)
  assert.equal(app.appId, '123456789')
  assert.equal(app.configured, true)
  assert.equal(connection.facebook.configured, false)
})

test('Meta OAuth callback exchanges the code and stores page tokens without returning them', async () => {
  const oauthState = 'a'.repeat(64)
  const database = createDatabase()
  await saveMetaAppSettings(database, 'organization-1', 'admin-1', {
    appId: '123456789',
    appSecret: 'organization-one-secret',
  }, configuration)
  const expectedStateHash = createHash('sha256').update(oauthState).digest('hex')
  let persistedCredentials
  const execute = database.execute.bind(database)
  database.execute = async (sql, parameters = []) => {
    if (sql.includes('INSERT INTO social_oauth_states')) {
      assert.equal(parameters[0], expectedStateHash)
      return [{ affectedRows: 1 }]
    }
    if (sql.includes('UPDATE social_oauth_states')) {
      assert.equal(parameters[0], expectedStateHash)
      return [{ affectedRows: 1 }]
    }
    if (sql.includes('SELECT organization_id AS organizationId')) {
      return [[{ organizationId: 'organization-1', initiatedBy: 'admin-1' }]]
    }
    if (sql.includes('INSERT INTO social_connections')) {
      persistedCredentials = parameters[1]
      return execute(sql, parameters)
    }
    return execute(sql, parameters)
  }
  const requests = []
  const result = await completeMetaOAuth(database, { state: oauthState, code: 'oauth-code' }, {
    configuration,
    fetch: async (requestUrl) => {
      const url = new URL(requestUrl)
      requests.push(url)
      if (url.searchParams.has('code')) return { ok: true, json: async () => ({ access_token: 'short-user-token' }) }
      if (url.searchParams.get('grant_type') === 'fb_exchange_token') return { ok: true, json: async () => ({ access_token: 'long-user-token' }) }
      if (url.pathname.endsWith('/me/accounts')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { id: 'page-1', name: 'Comunidad', access_token: 'page-secret-token' },
              { id: 'page-2', name: 'Comunidad Norte', access_token: 'second-page-secret' },
            ],
          }),
        }
      }
      return {
        ok: true,
        json: async () => url.pathname.endsWith('/page-1')
          ? ({ instagram_business_account: { id: 'instagram-1', username: 'comunidad' } })
          : ({}),
      }
    },
  })

  assert.equal(result.pages[0].id, 'page-1')
  assert.equal(result.pages[0].instagramBusinessAccountId, 'instagram-1')
  assert.equal(result.pages.length, 2)
  assert.equal(JSON.stringify(result).includes('page-secret-token'), false)
  assert.equal(expectedStateHash.length, 64)
  assert.notEqual(expectedStateHash, oauthState)
  assert.equal(persistedCredentials.includes('page-secret-token'), false)
  const savedConnection = await readSocialConnection(database, 'organization-1', {
    ...configuration,
    META_APP_ID: '123456789',
    META_APP_SECRET: 'server-only-app-secret',
  })
  assert.equal(savedConnection.pages[0].id, 'page-1')
  assert.equal(savedConnection.instagram.configured, true)
  assert.equal(JSON.stringify(savedConnection).includes('page-secret-token'), false)
  const selectedConnection = await selectMetaPage(database, 'organization-1', 'page-2', {
    ...configuration,
    META_APP_ID: '123456789',
    META_APP_SECRET: 'server-only-app-secret',
  })
  assert.equal(selectedConnection.selectedPageId, 'page-2')
  assert.equal(selectedConnection.instagram.configured, false)
  await assert.rejects(selectMetaPage(database, 'organization-1', 'unlinked-page', configuration), { status: 403 })
  assert.equal(requests[0].searchParams.get('client_secret'), 'organization-one-secret')
  assert.equal(requests[1].searchParams.get('fb_exchange_token'), 'short-user-token')
})

test('Meta OAuth callback rejects an expired or previously used state before exchanging credentials', async () => {
  const database = createDatabase()
  const execute = database.execute.bind(database)
  database.execute = async (sql, parameters = []) => {
    if (sql.includes('UPDATE social_oauth_states')) return [{ affectedRows: 0 }]
    return execute(sql, parameters)
  }
  let fetchCalled = false
  await assert.rejects(
    completeMetaOAuth(database, { state: 'b'.repeat(64), code: 'oauth-code' }, {
      configuration: {
        ...configuration,
        META_APP_ID: '123456789',
        META_APP_SECRET: 'server-only-app-secret',
      },
      fetch: async () => {
        fetchCalled = true
        throw new Error('Should not be called')
      },
    }),
    /expiró o ya fue utilizado/,
  )
  assert.equal(fetchCalled, false)
})
