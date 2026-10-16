import assert from 'node:assert/strict'
import test from 'node:test'
import app from './app.js'
import { database } from './db/database.js'

test('public donation campaign endpoint is mounted and returns public settings', async () => {
  const originalExecute = database.execute
  database.execute = async (sql) => {
    assert.match(sql, /FROM app_settings/)
    return [[], []]
  }
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/donations`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      data: {
        enabled: false,
        title: 'Apoya a Holi Places',
        description: 'Tu donación ayuda a mantener este espacio abierto y a conectar comunidades.',
        currency: 'MXN',
        amounts: [100, 250, 500, 1000],
      },
    })
  } finally {
    database.execute = originalExecute
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('unexpected API errors are logged while the response keeps the generic message', async () => {
  const originalExecute = database.execute
  const originalConsoleError = console.error
  const loggedErrors = []
  database.execute = async () => {
    throw Object.assign(new Error('diagnostic test failure'), { code: 'TEST_FAILURE' })
  }
  console.error = (...args) => loggedErrors.push(args)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/donations`)
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), {
      error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error interno.' },
    })
    assert.equal(loggedErrors.length, 1)
    assert.equal(loggedErrors[0][0], 'Unhandled API error')
    assert.deepEqual(loggedErrors[0][1], {
      method: 'GET',
      path: '/api/public/donations',
      name: 'Error',
      message: 'diagnostic test failure',
      code: 'TEST_FAILURE',
      stack: loggedErrors[0][1].stack,
    })
  } finally {
    database.execute = originalExecute
    console.error = originalConsoleError
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('public donation status endpoint returns only the payment state for a checkout session', async () => {
  const originalExecute = database.execute
  database.execute = async (sql, parameters) => {
    assert.match(sql, /SELECT status FROM donations/)
    assert.deepEqual(parameters, ['cs_test_session123'])
    return [[{ status: 'paid' }], []]
  }
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/donations/status/cs_test_session123`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { data: { status: 'paid' } })
  } finally {
    database.execute = originalExecute
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('SaaS subscription administration endpoints require an authenticated superadmin', async () => {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/saas/subscriptions`)
    assert.equal(response.status, 401)
    assert.equal((await response.json()).error.code, 'UNAUTHENTICATED')
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('CORS allows the Vite frontend origin on port 5188', async () => {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5188',
        'Access-Control-Request-Method': 'GET',
      },
    })

    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5188')
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('CORS allows the Vite frontend origin on port 5190', async () => {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5190',
        'Access-Control-Request-Method': 'GET',
      },
    })

    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5190')
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('administrative data endpoints reject requests without a session cookie', async () => {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}/api`
    const [dashboard, modules, organizations, appearance, updateAppearance, ads, adPricing, adDisplaySettings, updateAdDisplaySettings, adOrders, donations, updateDonations, saasSubscriptions, tenantAds, tenantAdPricing, tenantAdCheckout, tenantAdRetry, uploadTenantAdImage, uploadAdImage, invalidAdImage, invalidNeutralMedia] = await Promise.all([
      fetch(`${baseUrl}/dashboard`),
      fetch(`${baseUrl}/modules/members`),
      fetch(`${baseUrl}/admin/organizations`),
      fetch(`${baseUrl}/admin/appearance`),
      fetch(`${baseUrl}/admin/appearance`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch(`${baseUrl}/admin/ads`),
      fetch(`${baseUrl}/admin/ads/pricing`),
      fetch(`${baseUrl}/admin/ads/display-settings`),
      fetch(`${baseUrl}/admin/ads/display-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshIntervalSeconds: 60 }) }),
      fetch(`${baseUrl}/admin/ads/purchases`),
      fetch(`${baseUrl}/admin/donations`),
      fetch(`${baseUrl}/admin/donations`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch(`${baseUrl}/admin/saas/subscriptions`),
      fetch(`${baseUrl}/tenant/ads`),
      fetch(`${baseUrl}/tenant/ads/pricing`),
      fetch(`${baseUrl}/tenant/ads/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch(`${baseUrl}/tenant/ads/orders/order-one/retry`, { method: 'POST' }),
      fetch(`${baseUrl}/tenant/ads/upload-image`, { method: 'POST' }),
      fetch(`${baseUrl}/admin/ads/upload-image`, { method: 'POST' }),
      fetch(`${baseUrl}/public/ads/media/not-a-uuid.jpg`),
      fetch(`${baseUrl}/public/media/not-a-uuid.jpg`),
    ])
    assert.deepEqual(
      [dashboard.status, modules.status, organizations.status, appearance.status, updateAppearance.status, ads.status, adPricing.status, adDisplaySettings.status, updateAdDisplaySettings.status, adOrders.status, donations.status, updateDonations.status, saasSubscriptions.status, tenantAds.status, tenantAdPricing.status, tenantAdCheckout.status, tenantAdRetry.status, uploadTenantAdImage.status, uploadAdImage.status, invalidAdImage.status, invalidNeutralMedia.status],
      [401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 404, 404],
    )
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('social media management endpoints reject requests without a session cookie', async () => {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/tenant/social`
    const [settings, application, updateApplication, deleteApplication, connect, selectPage, remove, media, publish] = await Promise.all([
      fetch(baseUrl),
      fetch(`${baseUrl}/application`),
      fetch(`${baseUrl}/application`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch(`${baseUrl}/application`, { method: 'DELETE' }),
      fetch(`${baseUrl}/connect`, { method: 'POST' }),
      fetch(`${baseUrl}/page`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch(baseUrl, { method: 'DELETE' }),
      fetch(`${baseUrl}/media`, { method: 'POST' }),
      fetch(`${baseUrl}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    ])
    assert.deepEqual(
      [settings.status, application.status, updateApplication.status, deleteApplication.status, connect.status, selectPage.status, remove.status, media.status, publish.status],
      [401, 401, 401, 401, 401, 401, 401, 401, 401],
    )
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('Meta OAuth callback is public, returns an isolated popup response, and reports missing state', async () => {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/social/meta/callback`)
    const html = await response.text()
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-security-policy'), /script-src 'nonce-/)
    assert.match(html, /holi-meta-oauth/)
    assert.match(html, /Meta devolvió una respuesta de autorización no válida/)
    assert.doesNotMatch(html, /window\.opener\.postMessage\([^;]+,\s*['"]\*['"]\)/)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})