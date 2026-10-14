import { randomUUID } from 'node:crypto'
import { deleteAdMedia } from './ads-media.service.js'
import { validateCampaign } from './ads.service.js'
import { createAdCheckoutSession, retrieveAdCheckoutSession } from './billing.service.js'

const supportedCurrencies = new Set(['MXN', 'USD'])
const pricingSettingKey = 'advertising_pricing'
const displaySettingKey = 'advertising_display'

function invalid(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

export function validateAdDays(value) {
  const days = Number(value)
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw invalid('Los días de publicidad deben ser un número entero entre 1 y 365.')
  }
  return days
}

export function validateAdPricing(input = {}) {
  const pricePerDay = Number(input.pricePerDay)
  const currency = String(input.currency || '').trim().toUpperCase()
  if (!Number.isFinite(pricePerDay) || pricePerDay <= 0 || pricePerDay > 100000) {
    throw invalid('El precio por día debe ser mayor a cero y no superar 100,000.')
  }
  if (!supportedCurrencies.has(currency)) {
    throw invalid('La moneda debe ser MXN o USD.')
  }
  return { amountMinor: Math.round(pricePerDay * 100), currency }
}

function parseSettingValue(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return value
}

function campaignFromRow(campaign) {
  if (!campaign) return campaign
  return { ...campaign, imageUrl: String(campaign.imageUrl || '') }
}

export async function getAdPricing(database) {
  const [rows] = await database.execute('SELECT setting_value AS settingValue FROM app_settings WHERE setting_key = ? LIMIT 1', [pricingSettingKey])
  const setting = parseSettingValue(rows[0]?.settingValue)
  const amountMinor = Number(setting?.amountMinor)
  const currency = String(setting?.currency || '').toUpperCase()
  const configured = Number.isSafeInteger(amountMinor) && amountMinor > 0 && supportedCurrencies.has(currency)
  return {
    configured,
    amountMinor: configured ? amountMinor : 0,
    pricePerDay: configured ? amountMinor / 100 : 0,
    currency: configured ? currency : 'MXN',
  }
}

export async function updateAdPricing(database, actorId, input) {
  const pricing = validateAdPricing(input)
  const settingValue = JSON.stringify(pricing)
  await database.execute(`
    INSERT INTO app_settings (setting_key, setting_value, updated_by)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)
  `, [pricingSettingKey, settingValue, actorId])
  return getAdPricing(database)
}

export function validateAdRefreshInterval(value) {
  const refreshIntervalSeconds = Number(value)
  if (!Number.isInteger(refreshIntervalSeconds) || refreshIntervalSeconds < 15 || refreshIntervalSeconds > 3600) {
    throw invalid('El intervalo de actualización debe ser un entero entre 15 y 3,600 segundos.')
  }
  return refreshIntervalSeconds
}

export async function getAdDisplaySettings(database) {
  const [rows] = await database.execute('SELECT setting_value AS settingValue FROM app_settings WHERE setting_key = ? LIMIT 1', [displaySettingKey])
  const setting = parseSettingValue(rows[0]?.settingValue)
  const interval = Number(setting?.refreshIntervalSeconds)
  return {
    refreshIntervalSeconds: Number.isInteger(interval) && interval >= 15 && interval <= 3600 ? interval : 60,
  }
}

export async function updateAdDisplaySettings(database, actorId, input = {}) {
  const settings = { refreshIntervalSeconds: validateAdRefreshInterval(input.refreshIntervalSeconds) }
  await database.execute(`
    INSERT INTO app_settings (setting_key, setting_value, updated_by)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)
  `, [displaySettingKey, JSON.stringify(settings), actorId])
  return getAdDisplaySettings(database)
}

export async function listAdPurchases(database) {
  const [orders] = await database.execute(`
    SELECT orders.id, orders.campaign_id AS campaignId, orders.organization_id AS organizationId,
      organizations.name AS organizationName, ads.brand_name AS brandName, ads.headline,
      orders.days_purchased AS daysPurchased, orders.amount_minor AS amountMinor,
      orders.currency, orders.status, orders.paid_at AS paidAt, orders.created_at AS createdAt
    FROM ad_purchase_orders orders
    JOIN organizations ON organizations.id = orders.organization_id
    LEFT JOIN brand_ads ads ON ads.id = orders.campaign_id
    ORDER BY orders.created_at DESC
    LIMIT 500
  `)
  return orders
}

export async function listOrganizationAds(database, organizationId) {
  const [campaigns] = await database.execute(`
    SELECT id, organization_id AS organizationId, brand_name AS brandName, headline, body,
      image_url AS imageUrl, cta_label AS ctaLabel, destination_url AS destinationUrl,
      placement, status, purchased_days AS purchasedDays,
      DATE_FORMAT(starts_at, '%Y-%m-%dT%H:%i:%sZ') AS startsAt,
      DATE_FORMAT(ends_at, '%Y-%m-%dT%H:%i:%sZ') AS endsAt,
      created_at AS createdAt, updated_at AS updatedAt
    FROM brand_ads WHERE organization_id = ? ORDER BY created_at DESC
  `, [organizationId])
  const [orders] = await database.execute(`
    SELECT ad_purchase_orders.id, ad_purchase_orders.campaign_id AS campaignId,
      ad_purchase_orders.stripe_checkout_session_id AS stripeCheckoutSessionId,
      ads.headline AS campaignHeadline, ad_purchase_orders.days_purchased AS daysPurchased,
      ad_purchase_orders.amount_minor AS amountMinor, ad_purchase_orders.currency,
      ad_purchase_orders.status, ad_purchase_orders.paid_at AS paidAt,
      ad_purchase_orders.created_at AS createdAt
    FROM ad_purchase_orders
    JOIN brand_ads ads ON ads.id = ad_purchase_orders.campaign_id
    WHERE ad_purchase_orders.organization_id = ? ORDER BY ad_purchase_orders.created_at DESC LIMIT 100
  `, [organizationId])
  return { campaigns: campaigns.map(campaignFromRow), orders }
}

async function createOrganizationDraft(database, auth, input) {
  const campaign = validateCampaign({
    ...input,
    placement: input.placement || 'profile',
    status: 'draft',
    startsAt: '',
    endsAt: '',
  }, { creating: true })
  const id = randomUUID()
  await database.execute(`
    INSERT INTO brand_ads (id, organization_id, brand_name, headline, body, image_url, cta_label,
      destination_url, placement, status, purchased_days, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?)
  `, [id, auth.organizationId, campaign.brandName, campaign.headline, campaign.body, campaign.imageUrl,
    campaign.ctaLabel, campaign.destinationUrl, campaign.placement, auth.id])
  return id
}

export async function createOrganizationAdCheckout(database, auth, input, stripeClientOverride = null) {
  if (!auth.organizationId) throw invalid('La cuenta no tiene una congregación asociada.', 403)
  const days = validateAdDays(input.days)
  const pricing = await getAdPricing(database)
  if (!pricing.configured) throw invalid('La tarifa publicitaria todavía no está configurada. Contacta al superadmin.', 503)

  let campaignId = input.campaignId
  if (campaignId) {
    const [campaigns] = await database.execute(`
      SELECT id, status FROM brand_ads WHERE id = ? AND organization_id = ? LIMIT 1
    `, [campaignId, auth.organizationId])
    if (!campaigns[0]) throw invalid('No encontramos una campaña de esta congregación.', 404)
    if (['archived', 'rejected'].includes(campaigns[0].status)) throw invalid('Esta campaña no puede renovarse.', 409)
  } else {
    campaignId = await createOrganizationDraft(database, auth, input.campaign || {})
  }

  const orderId = randomUUID()
  const amountMinor = pricing.amountMinor * days
  if (!Number.isSafeInteger(amountMinor) || amountMinor > 99_999_999) {
    throw invalid('El importe total supera el límite que admite el pago en línea.')
  }
  await database.execute(`
    INSERT INTO ad_purchase_orders (id, campaign_id, organization_id, days_purchased, amount_minor, currency)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [orderId, campaignId, auth.organizationId, days, amountMinor, pricing.currency])

  let checkout
  try {
    checkout = await createAdCheckoutSession({
      orderId, campaignId, organizationId: auth.organizationId, email: auth.email,
      days, amountMinor, currency: pricing.currency,
    }, stripeClientOverride)
  } catch (error) {
    await database.execute("UPDATE ad_purchase_orders SET status = 'failed' WHERE id = ? AND status = 'pending'", [orderId])
    throw error
  }
  await database.execute(`
    UPDATE ad_purchase_orders SET stripe_checkout_session_id = ? WHERE id = ? AND status = 'pending'
  `, [checkout.id, orderId])
  return { ...checkout, orderId, campaignId, days, amountMinor, currency: pricing.currency }
}

export async function reconcilePaidOrganizationAdOrder(database, auth, orderId, stripeClientOverride = null) {
  if (!auth.organizationId) throw invalid('La cuenta no tiene una congregación asociada.', 403)
  const [orders] = await database.execute(`
    SELECT id, campaign_id AS campaignId, organization_id AS organizationId,
      days_purchased AS daysPurchased, amount_minor AS amountMinor, currency, status,
      stripe_checkout_session_id AS stripeCheckoutSessionId
    FROM ad_purchase_orders WHERE id = ? AND organization_id = ? LIMIT 1
  `, [orderId, auth.organizationId])
  const order = orders[0]
  if (!order) throw invalid('No encontramos ese movimiento de publicidad.', 404)
  if (order.status === 'paid') return { paid: true, alreadyPaid: true }
  if (!order.stripeCheckoutSessionId) throw invalid('El movimiento todavía no tiene una sesión de pago de Stripe.', 409)

  const session = await retrieveAdCheckoutSession(order.stripeCheckoutSessionId, stripeClientOverride)
  if (session.status !== 'complete' || session.payment_status !== 'paid') {
    throw invalid('Stripe aún no confirma el pago de este movimiento.', 409)
  }
  if (session.mode !== 'payment'
    || session.metadata?.adOrderId !== order.id
    || session.metadata?.organizationId !== order.organizationId
    || Number(session.amount_total) !== Number(order.amountMinor)
    || String(session.currency).toUpperCase() !== order.currency) {
    throw invalid('La sesión confirmada por Stripe no coincide con este movimiento.', 409)
  }

  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const [lockedOrders] = await connection.execute(`
      SELECT id, campaign_id AS campaignId, organization_id AS organizationId,
        days_purchased AS daysPurchased, amount_minor AS amountMinor, currency, status,
        stripe_checkout_session_id AS stripeCheckoutSessionId
      FROM ad_purchase_orders WHERE id = ? AND organization_id = ? LIMIT 1 FOR UPDATE
    `, [order.id, auth.organizationId])
    const lockedOrder = lockedOrders[0]
    if (!lockedOrder) throw invalid('No encontramos ese movimiento de publicidad.', 404)
    if (lockedOrder.status === 'paid') {
      await connection.commit()
      return { paid: true, alreadyPaid: true }
    }
    if (!['pending', 'retrying'].includes(lockedOrder.status)
      || (lockedOrder.stripeCheckoutSessionId && lockedOrder.stripeCheckoutSessionId !== session.id)
      || Number(session.amount_total) !== Number(lockedOrder.amountMinor)
      || String(session.currency).toUpperCase() !== lockedOrder.currency) {
      throw invalid('El estado o importe del movimiento cambió; actualiza e inténtalo de nuevo.', 409)
    }

    const [paidResult] = await connection.execute(`
      UPDATE ad_purchase_orders SET status = 'paid', stripe_checkout_session_id = ?,
        stripe_payment_intent_id = ?, paid_at = UTC_TIMESTAMP()
      WHERE id = ? AND organization_id = ? AND status IN ('pending', 'retrying')
        AND (stripe_checkout_session_id IS NULL OR stripe_checkout_session_id = ?)
    `, [session.id, typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
      lockedOrder.id, lockedOrder.organizationId, session.id])
    if (!paidResult.affectedRows) throw invalid('El movimiento ya cambió de estado; actualiza la página.', 409)

    await connection.execute(`
      UPDATE brand_ads SET starts_at = COALESCE(starts_at, UTC_TIMESTAMP()),
        ends_at = DATE_ADD(GREATEST(COALESCE(ends_at, UTC_TIMESTAMP()), UTC_TIMESTAMP()), INTERVAL ? DAY),
        purchased_days = purchased_days + ?,
        status = CASE WHEN status IN ('paused', 'archived') THEN status ELSE 'active' END
      WHERE id = ? AND organization_id = ?
    `, [lockedOrder.daysPurchased, lockedOrder.daysPurchased, lockedOrder.campaignId, lockedOrder.organizationId])
    await connection.commit()
    return { paid: true, alreadyPaid: false }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function retryOrganizationAdOrder(database, auth, orderId, stripeClientOverride = null) {
  if (!auth.organizationId) throw invalid('La cuenta no tiene una congregación asociada.', 403)
  const [orders] = await database.execute(`
    SELECT id, campaign_id AS campaignId, organization_id AS organizationId,
      days_purchased AS daysPurchased, amount_minor AS amountMinor, currency, status,
      stripe_checkout_session_id AS stripeCheckoutSessionId
    FROM ad_purchase_orders WHERE id = ? AND organization_id = ? LIMIT 1
  `, [orderId, auth.organizationId])
  const order = orders[0]
  if (!order) throw invalid('No encontramos ese movimiento de publicidad.', 404)
  if (order.status === 'paid') throw invalid('Este movimiento ya está pagado y no requiere reintento.', 409)

  if (order.status === 'pending' && order.stripeCheckoutSessionId) {
    const existingSession = await retrieveAdCheckoutSession(order.stripeCheckoutSessionId, stripeClientOverride)
    if (existingSession.status === 'open' && existingSession.url) {
      return { id: existingSession.id, url: existingSession.url, orderId: order.id, reused: true }
    }
    if (existingSession.status === 'complete') {
      if (existingSession.payment_status === 'paid') {
        await reconcilePaidOrganizationAdOrder(database, auth, order.id, stripeClientOverride)
        return { orderId: order.id, paid: true, reused: true }
      }
      throw invalid('Stripe aún está procesando este pago. Espera la notificación antes de volver a intentarlo.', 409)
    }
    if (existingSession.status !== 'expired') {
      throw invalid('No se puede reintentar esta sesión de pago todavía.', 409)
    }
  } else if (!['pending', 'failed', 'expired'].includes(order.status)) {
    throw invalid('El estado de este movimiento no permite reintentar el pago.', 409)
  }

  const [resetResult] = await database.execute(`
    UPDATE ad_purchase_orders SET status = 'retrying', stripe_checkout_session_id = NULL
    WHERE id = ? AND organization_id = ? AND status = ?
      AND (stripe_checkout_session_id <=> ?)
  `, [order.id, auth.organizationId, order.status, order.stripeCheckoutSessionId])
  if (!resetResult.affectedRows) throw invalid('El movimiento cambió de estado. Actualiza la página e inténtalo de nuevo.', 409)

  let checkout
  try {
    checkout = await createAdCheckoutSession({
      orderId: order.id,
      campaignId: order.campaignId,
      organizationId: order.organizationId,
      email: auth.email,
      days: order.daysPurchased,
      amountMinor: order.amountMinor,
      currency: order.currency,
    }, stripeClientOverride)
  } catch (error) {
    await database.execute(`
      UPDATE ad_purchase_orders SET status = 'failed'
      WHERE id = ? AND organization_id = ? AND status = 'retrying' AND stripe_checkout_session_id IS NULL
    `, [order.id, auth.organizationId])
    throw error
  }

  await database.execute(`
    UPDATE ad_purchase_orders SET status = 'pending', stripe_checkout_session_id = ?
    WHERE id = ? AND organization_id = ? AND status = 'retrying' AND stripe_checkout_session_id IS NULL
  `, [checkout.id, order.id, auth.organizationId])
  return { ...checkout, orderId: order.id, reused: false }
}

export async function updateOrganizationAd(database, organizationId, campaignId, input) {
  const [rows] = await database.execute(`
    SELECT id, organization_id AS organizationId, brand_name AS brandName, headline, body,
      image_url AS imageUrl, cta_label AS ctaLabel, destination_url AS destinationUrl,
      placement, status, purchased_days AS purchasedDays, starts_at AS startsAt, ends_at AS endsAt
    FROM brand_ads WHERE id = ? AND organization_id = ? LIMIT 1
  `, [campaignId, organizationId])
  const existing = rows[0]
  if (!existing) return null
  const campaign = validateCampaign({
    ...existing,
    ...input,
    placement: existing.purchasedDays > 0 ? existing.placement : input.placement || existing.placement,
    status: existing.status,
    startsAt: existing.startsAt || '',
    endsAt: existing.endsAt || '',
  })
  await database.execute(`
    UPDATE brand_ads SET brand_name = ?, headline = ?, body = ?, image_url = ?, cta_label = ?,
      destination_url = ?, placement = ?
    WHERE id = ? AND organization_id = ?
  `, [campaign.brandName, campaign.headline, campaign.body, campaign.imageUrl, campaign.ctaLabel,
    campaign.destinationUrl, campaign.placement, campaignId, organizationId])
  if (existing.imageUrl && existing.imageUrl !== campaign.imageUrl) await deleteAdMedia(existing.imageUrl)
  return { ...existing, ...campaign }
}

export async function updateOrganizationAdStatus(database, organizationId, campaignId, status) {
  if (!['active', 'paused'].includes(status)) throw invalid('Estado publicitario no válido.')
  const [result] = await database.execute(`
    UPDATE brand_ads SET status = ?
    WHERE id = ? AND organization_id = ? AND purchased_days > 0
      AND (status = 'active' OR status = 'paused')
      AND (? = 'paused' OR ends_at > UTC_TIMESTAMP())
  `, [status, campaignId, organizationId, status])
  return result.affectedRows > 0
}