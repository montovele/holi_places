import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDonationCheckout,
  getDonationPaymentStatus,
  getDonationSettings,
  publicDonationCampaign,
  saveDonationSettings,
  validateDonationCampaign,
} from './donations.service.js'

const campaign = {
  enabled: true,
  title: 'Apoya a la comunidad',
  description: 'Tu donación ayuda a sostener este espacio.',
  currency: 'MXN',
  amounts: [100, 250, 500],
}

function createDatabase() {
  const calls = []
  return {
    calls,
    settingValue: null,
    async execute(sql, parameters = []) {
      calls.push({ sql, parameters })
      if (sql.includes('SELECT setting_value')) return [this.settingValue ? [{ settingValue: this.settingValue }] : [], []]
      if (sql.includes('INSERT INTO app_settings')) this.settingValue = parameters[1]
      return [{ affectedRows: 1 }, []]
    },
  }
}

test('donation campaign defaults disabled and exposes only Stripe configuration status', async () => {
  const database = createDatabase()
  const settings = await getDonationSettings(database)
  assert.equal(settings.campaign.enabled, false)
  assert.deepEqual(settings.campaign.amounts, [100, 250, 500, 1000])
  assert.equal(typeof settings.secretKeyConfigured, 'boolean')
  assert.equal(typeof settings.webhookSecretConfigured, 'boolean')
  assert.equal(JSON.stringify(settings).includes(process.env.STRIPE_SECRET_KEY || '\0'), false)
})

test('public donation campaign remains unavailable until Stripe secrets are configured', () => {
  const settings = {
    campaign: { ...campaign },
    secretKeyConfigured: true,
    webhookSecretConfigured: false,
  }
  assert.equal(publicDonationCampaign(settings).enabled, false)
  assert.equal(publicDonationCampaign({ ...settings, webhookSecretConfigured: true }).enabled, true)
})

test('donation campaign validates and persists safe public settings', async () => {
  const database = createDatabase()
  assert.deepEqual(validateDonationCampaign(campaign), campaign)
  const settings = await saveDonationSettings(database, 'superadmin-1', campaign)
  const saveCall = database.calls.find(({ sql }) => sql.includes('INSERT INTO app_settings'))
  assert.equal(settings.campaign.enabled, true)
  assert.equal(saveCall.parameters[0], 'community_donations')
  assert.equal(JSON.parse(saveCall.parameters[1]).currency, 'MXN')
  assert.equal(saveCall.parameters[2], 'superadmin-1')
})

test('donation campaign rejects invalid amounts, currency, and incomplete copy', () => {
  assert.throws(() => validateDonationCampaign({ ...campaign, amounts: [10] }), /entre 2 y 6 montos/)
  assert.throws(() => validateDonationCampaign({ ...campaign, amounts: [10, 100001] }), /entre 2 y 6 montos/)
  assert.throws(() => validateDonationCampaign({ ...campaign, currency: 'EUR' }), /moneda debe ser MXN o USD/)
  assert.throws(() => validateDonationCampaign({ ...campaign, title: '' }), /título debe tener/)
})

test('donation checkout uses the saved central Stripe campaign and persists its session', async () => {
  const database = createDatabase()
  database.execute = async (sql, parameters = []) => {
    database.calls.push({ sql, parameters })
    if (sql.includes('SELECT setting_value')) return [[{ settingValue: JSON.stringify(campaign) }], []]
    return [{ affectedRows: 1 }, []]
  }
  const stripeCalls = []
  const stripeClient = {
    checkout: {
      sessions: {
        async create(input) {
          stripeCalls.push(input)
          return { id: 'cs_donation_1', url: 'https://checkout.stripe.test/session' }
        },
      },
    },
  }
  const result = await createDonationCheckout(database, 250, stripeClient)
  assert.equal(result.url, 'https://checkout.stripe.test/session')
  assert.equal(stripeCalls[0].mode, 'payment')
  assert.equal('payment_method_types' in stripeCalls[0], false)
  assert.equal(stripeCalls[0].line_items[0].price_data.unit_amount, 25000)
  assert.equal(stripeCalls[0].line_items[0].price_data.currency, 'mxn')
  assert.equal(stripeCalls[0].client_reference_id, stripeCalls[0].metadata.donationId)
  assert.match(stripeCalls[0].success_url, /\/comunidad\?donation=success&session_id=\{CHECKOUT_SESSION_ID\}$/)
  assert.equal(database.calls.some(({ sql, parameters }) => sql.includes('UPDATE donations SET stripe_checkout_session_id') && parameters[0] === 'cs_donation_1'), true)
})

test('public donation status validates the session reference and returns only its payment state', async () => {
  const database = createDatabase()
  database.execute = async (sql, parameters = []) => {
    database.calls.push({ sql, parameters })
    assert.match(sql, /SELECT status FROM donations/)
    return [[{ status: 'paid' }], []]
  }

  assert.deepEqual(await getDonationPaymentStatus(database, 'cs_test_session123'), { status: 'paid' })
  assert.deepEqual(database.calls[0].parameters, ['cs_test_session123'])
  await assert.rejects(getDonationPaymentStatus(database, 'not-a-session'), /referencia de pago no es válida/)
})

test('donation checkout rejects disabled campaigns and amounts not configured by superadmin', async () => {
  const database = createDatabase()
  await assert.rejects(createDonationCheckout(database, 100, {}), { status: 503 })
  database.execute = async (sql, parameters = []) => {
    database.calls.push({ sql, parameters })
    if (sql.includes('SELECT setting_value')) return [[{ settingValue: JSON.stringify(campaign) }], []]
    return [{ affectedRows: 1 }, []]
  }
  await assert.rejects(createDonationCheckout(database, 120, {}), /Selecciona uno de los montos/)
  assert.equal(database.calls.some(({ sql }) => sql.includes('INSERT INTO donations')), false)
})

test('donation checkout reports Stripe request failures as a payment-provider error', async () => {
  const database = createDatabase()
  database.settingValue = JSON.stringify(campaign)
  const stripeClient = {
    checkout: {
      sessions: {
        async create() {
          const error = new Error('Invalid Checkout parameter')
          error.type = 'StripeInvalidRequestError'
          error.code = 'parameter_unknown'
          error.statusCode = 400
          error.requestId = 'req_test'
          throw error
        },
      },
    },
  }

  await assert.rejects(createDonationCheckout(database, 100, stripeClient), {
    status: 502,
    message: /Stripe no pudo iniciar el pago/,
  })
  assert.equal(database.calls.some(({ sql, parameters }) => (
    sql.includes('UPDATE donations SET status = ?') && parameters[0] === 'failed'
  )), true)
})
