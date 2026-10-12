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

test('administrative data endpoints reject requests without a session cookie', async () => {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}/api`
    const [dashboard, modules, organizations, appearance, updateAppearance] = await Promise.all([
      fetch(`${baseUrl}/dashboard`),
      fetch(`${baseUrl}/modules/members`),
      fetch(`${baseUrl}/admin/organizations`),
      fetch(`${baseUrl}/admin/appearance`),
      fetch(`${baseUrl}/admin/appearance`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    ])
    assert.deepEqual([dashboard.status, modules.status, organizations.status, appearance.status, updateAppearance.status], [401, 401, 401, 401, 401])
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})