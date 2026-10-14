import assert from 'node:assert/strict'
import test from 'node:test'
import app from './app.js'

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
    const [dashboard, modules, organizations, appearance, updateAppearance, ads, adPricing, adDisplaySettings, updateAdDisplaySettings, adOrders, tenantAds, tenantAdPricing, tenantAdCheckout, tenantAdRetry, uploadTenantAdImage, uploadAdImage, invalidAdImage, invalidNeutralMedia] = await Promise.all([
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
      [dashboard.status, modules.status, organizations.status, appearance.status, updateAppearance.status, ads.status, adPricing.status, adDisplaySettings.status, updateAdDisplaySettings.status, adOrders.status, tenantAds.status, tenantAdPricing.status, tenantAdCheckout.status, tenantAdRetry.status, uploadTenantAdImage.status, uploadAdImage.status, invalidAdImage.status, invalidNeutralMedia.status],
      [401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 404, 404],
    )
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})