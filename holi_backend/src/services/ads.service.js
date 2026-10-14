import { randomUUID } from 'node:crypto'
import { deleteAdMedia } from './ads-media.service.js'

const campaignStatuses = new Set(['draft', 'active', 'paused', 'archived'])
const placements = new Set(['community', 'content', 'profile'])
const localAdMediaPattern = /^\/api\/public\/(?:ads\/media|media)\/([0-9a-f-]{36}\.(?:jpg|png|webp|mp4|webm))$/i

function normalizeMediaUrl(value) {
  const match = localAdMediaPattern.exec(String(value || ''))
  return match ? `/api/public/media/${match[1]}` : ''
}

function normalizeCampaign(campaign) {
  if (!campaign) return campaign
  return {
    ...campaign,
    imageUrl: normalizeMediaUrl(campaign.imageUrl),
  }
}

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 })
}

function parseCampaignDate(value) {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`
  return Date.parse(normalized)
}

function parsePublicUrl(value, field, required = true) {
  const text = String(value ?? '').trim()
  if (!text && !required) return ''
  let url
  try {
    url = new URL(text)
  } catch {
    throw invalid(`${field} debe ser una URL válida.`)
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw invalid(`${field} debe ser una URL pública HTTP o HTTPS.`)
  }
  return url.toString()
}

function parseLocalImage(value) {
  const imageUrl = String(value ?? '').trim()
  if (!imageUrl) return ''
  const normalized = normalizeMediaUrl(imageUrl)
  if (!normalized) throw invalid('El archivo multimedia debe cargarse desde el equipo.')
  return normalized
}

export function validateCampaign(input = {}, { creating = false } = {}) {
  const campaign = {
    brandName: String(input.brandName ?? '').trim(),
    headline: String(input.headline ?? '').trim(),
    body: String(input.body ?? '').trim(),
    imageUrl: parseLocalImage(input.imageUrl),
    ctaLabel: String(input.ctaLabel ?? 'Conocer más').trim(),
    destinationUrl: parsePublicUrl(input.destinationUrl, 'El destino'),
    placement: String(input.placement ?? 'community').trim(),
    status: String(input.status ?? (creating ? 'draft' : '')).trim(),
    startsAt: String(input.startsAt ?? '').trim(),
    endsAt: String(input.endsAt ?? '').trim(),
  }

  if (campaign.brandName.length < 2 || campaign.brandName.length > 120) throw invalid('La marca debe tener entre 2 y 120 caracteres.')
  if (campaign.headline.length < 3 || campaign.headline.length > 160) throw invalid('El titular debe tener entre 3 y 160 caracteres.')
  if (campaign.body.length < 3 || campaign.body.length > 1000) throw invalid('El texto debe tener entre 3 y 1000 caracteres.')
  if (campaign.ctaLabel.length < 2 || campaign.ctaLabel.length > 40) throw invalid('El texto del botón debe tener entre 2 y 40 caracteres.')
  if (!placements.has(campaign.placement)) throw invalid('La ubicación del anuncio no es válida.')
  if (!campaignStatuses.has(campaign.status)) throw invalid('El estado del anuncio no es válido.')

  for (const [field, value] of [['inicio', campaign.startsAt], ['fin', campaign.endsAt]]) {
    if (value && Number.isNaN(parseCampaignDate(value))) throw invalid(`La fecha de ${field} no es válida.`)
  }
  if (campaign.startsAt && campaign.endsAt && parseCampaignDate(campaign.endsAt) <= parseCampaignDate(campaign.startsAt)) {
    throw invalid('La fecha de fin debe ser posterior al inicio.')
  }

  return campaign
}

function databaseDate(value) {
  if (!value) return null
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`
  return new Date(normalized).toISOString().slice(0, 19).replace('T', ' ')
}

function utcDatabaseDate(value) {
  return value.toISOString().slice(0, 19).replace('T', ' ')
}

const campaignColumns = `brand_ads.id, brand_ads.organization_id AS organizationId,
  organizations.name AS organizationName, brand_ads.brand_name AS brandName, brand_ads.headline, brand_ads.body,
  brand_ads.image_url AS imageUrl, brand_ads.cta_label AS ctaLabel,
  brand_ads.destination_url AS destinationUrl, brand_ads.placement, brand_ads.status,
  brand_ads.purchased_days AS purchasedDays,
  DATE_FORMAT(brand_ads.starts_at, '%Y-%m-%dT%H:%i') AS startsAt,
  DATE_FORMAT(brand_ads.ends_at, '%Y-%m-%dT%H:%i') AS endsAt,
  brand_ads.created_at AS createdAt, brand_ads.updated_at AS updatedAt`

export async function listCampaigns(database) {
  const [campaigns] = await database.execute(`
    SELECT ${campaignColumns} FROM brand_ads
    LEFT JOIN organizations ON organizations.id = brand_ads.organization_id
    ORDER BY brand_ads.created_at DESC
  `)
  return campaigns.map(normalizeCampaign)
}

export async function listPublicAds(database, now = new Date()) {
  const [campaigns] = await database.execute(`
    SELECT id, brand_name AS brandName, headline, body, image_url AS imageUrl,
      cta_label AS ctaLabel, destination_url AS destinationUrl, placement
    FROM brand_ads
    WHERE status = 'active' AND (organization_id IS NULL OR purchased_days > 0)
      AND (starts_at IS NULL OR starts_at <= ?)
      AND (ends_at IS NULL OR ends_at > ?)
    ORDER BY RAND()
    LIMIT 20
  `, [utcDatabaseDate(now), utcDatabaseDate(now)])
  return campaigns.map(normalizeCampaign)
}

export async function createCampaign(database, actorId, input) {
  const campaign = validateCampaign(input, { creating: true })
  const id = randomUUID()
  await database.execute(`
    INSERT INTO brand_ads (id, brand_name, headline, body, image_url, cta_label, destination_url,
      placement, status, starts_at, ends_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, campaign.brandName, campaign.headline, campaign.body, campaign.imageUrl, campaign.ctaLabel,
    campaign.destinationUrl, campaign.placement, campaign.status, databaseDate(campaign.startsAt),
    databaseDate(campaign.endsAt), actorId])
  return getCampaign(database, id)
}

export async function getCampaign(database, id) {
  const [campaigns] = await database.execute(`
    SELECT ${campaignColumns} FROM brand_ads
    LEFT JOIN organizations ON organizations.id = brand_ads.organization_id
    WHERE brand_ads.id = ? LIMIT 1
  `, [id])
  return normalizeCampaign(campaigns[0] || null)
}

export async function updateCampaign(database, id, input) {
  const existing = await getCampaign(database, id)
  if (!existing) return null
  const campaign = validateCampaign({ ...existing, ...input })
  if (existing.organizationId) {
    const sameDate = (first, second) => (!first && !second) || parseCampaignDate(first) === parseCampaignDate(second)
    if (campaign.placement !== existing.placement
      || !sameDate(campaign.startsAt, existing.startsAt) || !sameDate(campaign.endsAt, existing.endsAt)) {
      throw Object.assign(new Error('La ubicación y la vigencia de campañas de congregación dependen de sus días pagados.'), { status: 409 })
    }
    if (campaign.status === 'active' && (
      Number(existing.purchasedDays) < 1 || !existing.endsAt || parseCampaignDate(existing.endsAt) <= Date.now()
    )) {
      throw Object.assign(new Error('No se puede activar una campaña de congregación sin días pagados vigentes.'), { status: 409 })
    }
  }
  await database.execute(`
    UPDATE brand_ads SET brand_name = ?, headline = ?, body = ?, image_url = ?, cta_label = ?,
      destination_url = ?, placement = ?, status = ?, starts_at = ?, ends_at = ?
    WHERE id = ?
  `, [campaign.brandName, campaign.headline, campaign.body, campaign.imageUrl, campaign.ctaLabel,
    campaign.destinationUrl, campaign.placement, campaign.status, databaseDate(campaign.startsAt),
    databaseDate(campaign.endsAt), id])
  if (existing.imageUrl && existing.imageUrl !== campaign.imageUrl) await deleteAdMedia(existing.imageUrl)
  return getCampaign(database, id)
}

export async function deleteCampaign(database, id) {
  const campaign = await getCampaign(database, id)
  if (!campaign) return false
  if (campaign.organizationId) {
    throw Object.assign(new Error('No se puede eliminar una campaña de congregación; puedes pausarla o archivarla para conservar el historial de pagos.'), { status: 409 })
  }
  const [result] = await database.execute('DELETE FROM brand_ads WHERE id = ?', [id])
  if (result.affectedRows > 0 && normalizeMediaUrl(campaign.imageUrl)) {
    await deleteAdMedia(campaign.imageUrl)
  }
  return result.affectedRows > 0
}