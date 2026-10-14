import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'
import { deleteCampaign, updateCampaign, validateCampaign } from './ads.service.js'
import { deleteAdMedia, detectAdMediaType, getAdMediaPath, saveAdMedia } from './ads-media.service.js'

const validCampaign = {
  brandName: 'Librería Central',
  headline: 'Lecturas para compartir',
  body: 'Descubre títulos para tu comunidad.',
  imageUrl: '/api/public/media/123e4567-e89b-12d3-a456-426614174000.jpg',
  ctaLabel: 'Ver catálogo',
  destinationUrl: 'https://example.com/catalogo',
  placement: 'content',
  status: 'active',
  startsAt: '2026-10-12T09:00',
  endsAt: '2026-10-20T18:00',
}

test('campaign validation trims content and accepts public placements', () => {
  const campaign = validateCampaign({ ...validCampaign, headline: '  Lecturas para compartir  ' })
  assert.equal(campaign.headline, 'Lecturas para compartir')
  assert.equal(campaign.placement, 'content')
})

test('campaign creation defaults to draft', () => {
  const campaign = validateCampaign({ ...validCampaign, status: undefined }, { creating: true })
  assert.equal(campaign.status, 'draft')
})

test('campaign validation rejects unsafe URLs, unknown placements, and invalid date windows', () => {
  assert.throws(() => validateCampaign({ ...validCampaign, destinationUrl: 'javascript:alert(1)' }), { status: 400 })
  assert.throws(() => validateCampaign({ ...validCampaign, imageUrl: 'https://example.com/ad.jpg' }), { status: 400 })
  assert.throws(() => validateCampaign({ ...validCampaign, placement: 'admin' }), { status: 400 })
  assert.throws(() => validateCampaign({ ...validCampaign, endsAt: '2026-10-11T18:00' }), { status: 400 })
})

test('uploaded media type is determined from its bytes, not its filename', () => {
  assert.deepEqual(detectAdMediaType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), { extension: 'jpg', contentType: 'image/jpeg', kind: 'image' })
  assert.deepEqual(detectAdMediaType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), { extension: 'png', contentType: 'image/png', kind: 'image' })
  assert.deepEqual(detectAdMediaType(Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])), { extension: 'mp4', contentType: 'video/mp4', kind: 'video' })
  assert.deepEqual(detectAdMediaType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00])), { extension: 'webm', contentType: 'video/webm', kind: 'video' })
  assert.equal(detectAdMediaType(Buffer.from('not an image')), null)
})

test('legacy campaign media URLs normalize to the neutral public route', () => {
  const campaign = validateCampaign({ ...validCampaign, imageUrl: '/api/public/ads/media/123e4567-e89b-12d3-a456-426614174000.jpg' })
  assert.equal(campaign.imageUrl, '/api/public/media/123e4567-e89b-12d3-a456-426614174000.jpg')
})

test('uploaded media are stored locally and removed by their generated media URL', async () => {
  const buffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
  const media = await saveAdMedia(buffer)
  const storedPath = getAdMediaPath(media.filename)
  try {
    assert.match(media.mediaUrl, /^\/api\/public\/media\/[0-9a-f-]{36}\.png$/)
    assert.deepEqual(await readFile(storedPath), buffer)
  } finally {
    await deleteAdMedia(media.mediaUrl)
  }
  await assert.rejects(access(storedPath), { code: 'ENOENT' })
})

test('superadmin cannot activate or manually extend an unpaid tenant campaign', async () => {
  const existing = {
    id: 'tenant-ad-1', organizationId: 'org-one', brandName: 'Comunidad Uno',
    headline: 'Encuentro abierto', body: 'Ven a compartir.', imageUrl: '',
    ctaLabel: 'Conocer más', destinationUrl: 'https://example.test', placement: 'profile',
    status: 'draft', purchasedDays: 0, startsAt: '', endsAt: '',
  }
  const database = { async execute(sql) {
    if (sql.includes('SELECT')) return [[existing]]
    assert.fail('Campaign updates should be rejected before writing')
  } }
  await assert.rejects(updateCampaign(database, existing.id, { ...existing, status: 'active' }), { status: 409 })
  await assert.rejects(updateCampaign(database, existing.id, { ...existing, endsAt: '2027-01-01T00:00:00Z' }), { status: 409 })
})

test('superadmin cannot delete a tenant campaign and lose its payment history', async () => {
  const database = { async execute(sql) {
    if (sql.includes('SELECT')) return [[{
      id: 'tenant-ad-paid', organizationId: 'org-one', purchasedDays: 0, imageUrl: '',
    }]]
    assert.fail('A paid campaign must not be deleted')
  } }
  await assert.rejects(deleteCampaign(database, 'tenant-ad-paid'), { status: 409 })
})