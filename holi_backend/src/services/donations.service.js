import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'

const donationSettingKey = 'community_donations'
const supportedCurrencies = new Set(['MXN', 'USD'])
const defaultCampaign = {
  enabled: false,
  title: 'Apoya a Holi Places',
  description: 'Tu donación ayuda a mantener este espacio abierto y a conectar comunidades.',
  currency: 'MXN',
  amounts: [100, 250, 500, 1000],
}

function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status })
}

function parseSettingValue(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return value
}

function isConfiguredSecret(value, prefix) {
  return typeof value === 'string'
    && value.startsWith(prefix)
    && !/replace[-_ ]?(this|with)|your_(stripe|webhook|secret)|placeholder|example/i.test(value)
}

function stripeStatus() {
  return {
    secretKeyConfigured: isConfiguredSecret(process.env.STRIPE_SECRET_KEY, 'sk_'),
    webhookSecretConfigured: isConfiguredSecret(process.env.STRIPE_WEBHOOK_SECRET, 'whsec_'),
  }
}

function stripeClient() {
  if (!stripeStatus().secretKeyConfigured) {
    invalid('Stripe no está configurado. Añade STRIPE_SECRET_KEY al .env del servidor.', 503)
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

export function validateDonationCampaign(input = {}) {
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const description = typeof input.description === 'string' ? input.description.trim() : ''
  const currency = String(input.currency || '').trim().toUpperCase()
  const amounts = Array.isArray(input.amounts) ? [...new Set(input.amounts.map(Number))] : []
  if (typeof input.enabled !== 'boolean') invalid('Indica si la sección de donaciones estará activa.')
  if (!title || title.length > 120) invalid('El título debe tener entre 1 y 120 caracteres.')
  if (!description || description.length > 1000) invalid('La descripción debe tener entre 1 y 1,000 caracteres.')
  if (!supportedCurrencies.has(currency)) invalid('La moneda debe ser MXN o USD.')
  if (amounts.length < 2 || amounts.length > 6
    || amounts.some((amount) => !Number.isSafeInteger(amount) || amount < 10 || amount > 100000)) {
    invalid('Configura entre 2 y 6 montos enteros, desde 10 y hasta 100,000.')
  }
  return { enabled: input.enabled, title, description, currency, amounts: amounts.sort((a, b) => a - b) }
}

export async function getDonationSettings(database) {
  const [rows] = await database.execute(
    'SELECT setting_value AS settingValue FROM app_settings WHERE setting_key = ? LIMIT 1',
    [donationSettingKey],
  )
  const setting = parseSettingValue(rows[0]?.settingValue)
  const campaign = {
    ...defaultCampaign,
    ...(setting && typeof setting === 'object' ? setting : {}),
  }
  return { campaign, ...stripeStatus() }
}

export async function saveDonationSettings(database, actorId, input) {
  const campaign = validateDonationCampaign(input)
  await database.execute(`
    INSERT INTO app_settings (setting_key, setting_value, updated_by)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)
  `, [donationSettingKey, JSON.stringify(campaign), actorId || null])
  return getDonationSettings(database)
}

export async function listDonations(database) {
  const [rows] = await database.execute(`
    SELECT id, amount_minor AS amountMinor, currency, status,
      paid_at AS paidAt, created_at AS createdAt
    FROM donations
    ORDER BY created_at DESC
    LIMIT 500
  `)
  return rows
}

export async function getDonationPaymentStatus(database, sessionId) {
  if (typeof sessionId !== 'string' || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    invalid('La referencia de pago no es válida.')
  }
  const [rows] = await database.execute(
    'SELECT status FROM donations WHERE stripe_checkout_session_id = ? LIMIT 1',
    [sessionId],
  )
  if (!rows.length) invalid('No se encontró la donación asociada a este pago.', 404)
  return { status: rows[0].status }
}

export async function createDonationCheckout(database, amount, stripeClientOverride = null) {
  const { campaign } = await getDonationSettings(database)
  if (!campaign.enabled) invalid('Las donaciones no están disponibles en este momento.', 503)
  if (!stripeClientOverride && !stripeStatus().webhookSecretConfigured) {
    invalid('Stripe no está configurado. Añade STRIPE_WEBHOOK_SECRET al .env del servidor.', 503)
  }
  const selectedAmount = Number(amount)
  if (!campaign.amounts.includes(selectedAmount)) invalid('Selecciona uno de los montos de donación disponibles.')
  const amountMinor = selectedAmount * 100
  if (!Number.isSafeInteger(amountMinor) || amountMinor > 99_999_999) invalid('El monto seleccionado no es válido.')
  const stripe = stripeClientOverride || stripeClient()

  const donationId = randomUUID()
  await database.execute(`
    INSERT INTO donations (id, amount_minor, currency, status)
    VALUES (?, ?, ?, 'pending')
  `, [donationId, amountMinor, campaign.currency])

  try {
    const baseUrl = process.env.FRONTEND_ORIGIN || 'http://localhost:5188'
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: campaign.currency.toLowerCase(),
          unit_amount: amountMinor,
          product_data: { name: campaign.title },
        },
        quantity: 1,
      }],
      customer_creation: 'always',
      client_reference_id: donationId,
      metadata: { donationId },
      success_url: `${baseUrl}/comunidad?donation=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/comunidad?donation=cancelled`,
    })
    if (!checkout.url) throw new Error('Stripe no devolvió una URL para completar el pago.')
    await database.execute(
      'UPDATE donations SET stripe_checkout_session_id = ? WHERE id = ? AND status = ?',
      [checkout.id, donationId, 'pending'],
    )
    return { url: checkout.url }
  } catch (error) {
    await database.execute(
      'UPDATE donations SET status = ? WHERE id = ? AND status = ?',
      ['failed', donationId, 'pending'],
    )
    if (error.type?.startsWith('Stripe')) {
      console.error('Stripe donation checkout failed', {
        type: error.type,
        code: error.code || null,
        statusCode: error.statusCode || null,
        requestId: error.requestId || null,
      })
      throw Object.assign(
        new Error('Stripe no pudo iniciar el pago. Revisa la configuración de métodos de pago.'),
        { status: 502 },
      )
    }
    throw error
  }
}

export function publicDonationCampaign(settings) {
  const { campaign } = settings
  return {
    enabled: campaign.enabled && settings.secretKeyConfigured && settings.webhookSecretConfigured,
    title: campaign.title,
    description: campaign.description,
    currency: campaign.currency,
    amounts: campaign.amounts,
  }
}
