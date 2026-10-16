<script setup>
import { onMounted, reactive, ref } from 'vue'
import { CheckIcon, HeartIcon, ShieldCheckIcon } from '@heroicons/vue/24/outline'
import { getDonationAdministration, updateDonationAdministration } from '../services/donationsService'

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const donations = ref([])
const stripeStatus = reactive({ secretKeyConfigured: false, webhookSecretConfigured: false })
const form = reactive({
  enabled: false,
  title: '',
  description: '',
  currency: 'MXN',
  amountsText: '',
})

function applySettings(settings) {
  Object.assign(form, {
    enabled: settings.campaign.enabled,
    title: settings.campaign.title,
    description: settings.campaign.description,
    currency: settings.campaign.currency,
    amountsText: settings.campaign.amounts.join(', '),
  })
  Object.assign(stripeStatus, {
    secretKeyConfigured: settings.secretKeyConfigured,
    webhookSecretConfigured: settings.webhookSecretConfigured,
  })
  donations.value = settings.donations || []
}

async function loadSettings() {
  loading.value = true
  error.value = ''
  try {
    applySettings(await getDonationAdministration())
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo cargar la administración de donaciones.'
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  error.value = ''
  notice.value = ''
  saving.value = true
  try {
    const amounts = form.amountsText.split(',').map((value) => Number(value.trim())).filter((value) => value > 0)
    const updated = await updateDonationAdministration({
      enabled: form.enabled,
      title: form.title,
      description: form.description,
      currency: form.currency,
      amounts,
    })
    applySettings({ ...updated, donations: donations.value })
    notice.value = 'La configuración de donaciones se guardó.'
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo guardar la configuración de donaciones.'
  } finally {
    saving.value = false
  }
}

function formatAmount(amountMinor, currency) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(Number(amountMinor) / 100)
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

function donationStatus(status) {
  return ({ paid: 'Pagada', pending: 'Pendiente', failed: 'Fallida', expired: 'Expirada' })[status] || status
}

onMounted(loadSettings)
</script>

<template>
  <section class="module-view donations-admin-view">
    <div class="module-intro">
      <p class="eyebrow">PLATAFORMA · SUPERADMINISTRACIÓN</p>
      <h2>Donaciones de la comunidad</h2>
      <p>Configura la campaña pública y consulta los pagos recibidos por Holi Places a través de Stripe.</p>
    </div>

    <div v-if="error" class="module-alert" role="alert">{{ error }}</div>
    <div v-if="notice" class="module-notice" role="status"><CheckIcon />{{ notice }}</div>
    <div v-if="loading" class="appearance-loading" role="status">Cargando configuración…</div>

    <template v-else>
      <section class="donations-admin-card">
        <header class="donations-admin-card-heading">
          <span><HeartIcon aria-hidden="true" /></span>
          <div><h3>Campaña pública</h3><p>Los donativos se procesan en la cuenta central de Stripe de Holi Places.</p></div>
        </header>

        <div class="donations-stripe-status" role="status">
          <span :class="{ configured: stripeStatus.secretKeyConfigured }">
            <ShieldCheckIcon aria-hidden="true" /> Clave secreta {{ stripeStatus.secretKeyConfigured ? 'configurada' : 'pendiente' }}
          </span>
          <span :class="{ configured: stripeStatus.webhookSecretConfigured }">
            <ShieldCheckIcon aria-hidden="true" /> Webhook {{ stripeStatus.webhookSecretConfigured ? 'configurado' : 'pendiente' }}
          </span>
          <p v-if="!stripeStatus.secretKeyConfigured || !stripeStatus.webhookSecretConfigured">
            Configura <code>STRIPE_SECRET_KEY</code> y <code>STRIPE_WEBHOOK_SECRET</code> en el .env del servidor. No se almacenan ni se exponen desde este panel.
          </p>
          <p>En Stripe, registra <code>/api/billing/webhook</code> para los eventos de Checkout: <code>checkout.session.completed</code>, <code>checkout.session.async_payment_succeeded</code>, <code>checkout.session.async_payment_failed</code> y <code>checkout.session.expired</code>.</p>
        </div>

        <form class="donations-admin-form" @submit.prevent="saveSettings">
          <label class="donations-admin-toggle">
            <input v-model="form.enabled" type="checkbox" />
            <span><strong>Mostrar donaciones en Comunidad</strong><small>El área pública aparece cuando la campaña está activa.</small></span>
          </label>
          <label><span>Título</span><input v-model.trim="form.title" maxlength="120" required /></label>
          <label><span>Moneda</span>
            <select v-model="form.currency"><option value="MXN">MXN · Peso mexicano</option><option value="USD">USD · Dólar estadounidense</option></select>
          </label>
          <label class="donations-admin-wide"><span>Mensaje de la campaña</span><textarea v-model.trim="form.description" maxlength="1000" rows="3" required /></label>
          <label class="donations-admin-wide"><span>Montos sugeridos (separados por coma)</span><input v-model="form.amountsText" required placeholder="100, 250, 500, 1000" /></label>
          <small class="donations-admin-help">Configura entre 2 y 6 montos enteros de 10 a 100,000. El usuario elige uno antes de ir a Checkout.</small>
          <div class="donations-admin-actions"><button class="social-button social-button-primary" type="submit" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar configuración' }}</button></div>
        </form>
      </section>

      <section class="donations-admin-card">
        <header class="donations-admin-card-heading">
          <span><CheckIcon aria-hidden="true" /></span>
          <div><h3>Registro de donaciones</h3><p>Pagos confirmados por webhook de Stripe y sus estados.</p></div>
        </header>
        <div v-if="donations.length" class="donations-admin-table-wrap">
          <table class="donations-admin-table">
            <thead><tr><th>Fecha</th><th>Monto</th><th>Estado</th><th>Referencia</th></tr></thead>
            <tbody>
              <tr v-for="donation in donations" :key="donation.id">
                <td>{{ formatDate(donation.paidAt || donation.createdAt) }}</td>
                <td>{{ formatAmount(donation.amountMinor, donation.currency) }}</td>
                <td><span class="donations-admin-status" :class="`status-${donation.status}`">{{ donationStatus(donation.status) }}</span></td>
                <td><code>{{ donation.id.slice(0, 8) }}</code></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="donations-admin-empty">Todavía no hay donaciones registradas.</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.donations-admin-view { display: grid; gap: 18px; }
.donations-admin-card { display: grid; gap: 18px; padding: 22px; border: 1px solid #e1e8e1; border-radius: 8px; background: #fff; box-shadow: 0 8px 24px rgba(32,57,47,.04); }
.donations-admin-card-heading { display: flex; align-items: center; gap: 13px; }
.donations-admin-card-heading > span { display: grid; width: 42px; height: 42px; flex: 0 0 auto; place-items: center; border-radius: 50%; color: #315a46; background: #edf4ec; }
.donations-admin-card-heading svg { width: 20px; height: 20px; }
.donations-admin-card-heading h3 { margin: 0 0 4px; color: #284a39; font-size: 16px; }
.donations-admin-card-heading p { margin: 0; color: #728076; font-size: 12px; line-height: 1.5; }
.donations-stripe-status { display: grid; gap: 9px; padding: 13px; border: 1px solid #e5e9e1; border-radius: 6px; background: #fafbf8; }
.donations-stripe-status > span { display: inline-flex; align-items: center; gap: 7px; color: #9a593d; font-size: 12px; font-weight: 700; }
.donations-stripe-status > span.configured { color: #34714b; }
.donations-stripe-status svg { width: 16px; height: 16px; }
.donations-stripe-status p { margin: 0; color: #6b786e; font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.donations-stripe-status code, .donations-admin-table code { color: #345b46; font-size: 10px; }
.donations-admin-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px; }
.donations-admin-form > label:not(.donations-admin-toggle) { display: grid; gap: 6px; color: #45594c; font-size: 12px; font-weight: 700; }
.donations-admin-form input:not([type=checkbox]), .donations-admin-form select, .donations-admin-form textarea { width: 100%; min-height: 40px; padding: 9px 11px; border: 1px solid #dce4dc; border-radius: 5px; color: #263f32; background: #fff; font: inherit; font-size: 12px; }
.donations-admin-form textarea { resize: vertical; }
.donations-admin-form :where(input, select, textarea):focus-visible { outline: 2px solid #8caf98; outline-offset: 1px; }
.donations-admin-wide { grid-column: 1 / -1; }
.donations-admin-toggle { display: flex; grid-column: 1 / -1; align-items: center; gap: 11px; padding: 12px; border: 1px solid #e2e8e0; border-radius: 5px; background: #f8faf6; }
.donations-admin-toggle input { width: 18px; height: 18px; accent-color: #315a46; }
.donations-admin-toggle span { display: grid; gap: 3px; color: #365540; font-size: 12px; }
.donations-admin-toggle small, .donations-admin-help { color: #78857a; font-size: 10px; font-weight: 400; line-height: 1.5; }
.donations-admin-help { grid-column: 1 / -1; margin-top: -9px; }
.donations-admin-actions { grid-column: 1 / -1; }
.donations-admin-actions button { min-height: 40px; padding: 0 15px; border: 0; border-radius: 5px; color: #fff; background: #245941; cursor: pointer; font-size: 12px; font-weight: 700; }
.donations-admin-actions button:hover:not(:disabled) { background: #b75d46; }
.donations-admin-actions button:disabled { opacity: .65; cursor: wait; }
.donations-admin-table-wrap { overflow-x: auto; }
.donations-admin-table { width: 100%; border-collapse: collapse; text-align: left; }
.donations-admin-table th, .donations-admin-table td { padding: 11px 9px; border-bottom: 1px solid #edf0eb; color: #536459; font-size: 11px; white-space: nowrap; }
.donations-admin-table th { color: #6e7e72; font-size: 10px; }
.donations-admin-status { padding: 4px 7px; border-radius: 20px; color: #78633e; background: #f6f1e6; font-size: 9px; font-weight: 700; }
.donations-admin-status.status-paid { color: #2d7046; background: #edf6ed; }
.donations-admin-status.status-failed, .donations-admin-status.status-expired { color: #a24d3e; background: #fbefec; }
.donations-admin-empty { margin: 0; padding: 20px; border: 1px dashed #dce5dc; color: #738075; font-size: 12px; text-align: center; }
@media (max-width: 620px) {
  .donations-admin-card { padding: 16px; }
  .donations-admin-form { grid-template-columns: minmax(0, 1fr); }
  .donations-admin-wide, .donations-admin-toggle, .donations-admin-help, .donations-admin-actions { grid-column: 1; }
}
</style>
