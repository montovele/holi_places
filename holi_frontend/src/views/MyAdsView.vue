<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowPathIcon, ArrowUpRightIcon, CheckIcon, ClockIcon, MegaphoneIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, SparklesIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import {
  adMediaSource,
  getOrganizationAds,
  isVideoAdMedia,
  retryOrganizationAdOrder,
  setOrganizationAdStatus,
  startOrganizationAdCheckout,
  updateOrganizationAd,
  uploadOrganizationAdMedia,
} from '../services/adsService'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const campaigns = ref([])
const orders = ref([])
const pricing = ref({ configured: false, pricePerDay: 0, currency: 'MXN' })
const renewalDays = reactive({})
const loading = ref(true)
const saving = ref(false)
const uploading = ref(false)
const retryingOrderId = ref('')
const uploadProgress = ref(0)
const error = ref('')
const notice = ref('')
const editingId = ref(null)
const days = ref(7)
const campaign = reactive({
  brandName: auth.user?.organizationName || '', headline: '', body: '', imageUrl: '',
  ctaLabel: 'Conocer más', destinationUrl: '', placement: 'profile',
})
const totalPrice = computed(() => Math.round(pricing.value.pricePerDay * days.value * 100) / 100)
const activeCampaigns = computed(() => campaigns.value.filter(({ status, endsAt }) => status === 'active' && new Date(endsAt) > new Date()).length)
const pendingOrders = computed(() => orders.value.filter(({ status }) => ['pending', 'retrying'].includes(status)).length)

function formatPrice(amount, currency = pricing.value.currency) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(Number(amount || 0))
}

function formatDate(value) {
  if (!value) return 'Pendiente de activar'
  const normalized = String(value).replace(' ', 'T')
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(normalized))
}

function statusLabel(status) {
  return ({ active: 'En circulación', paused: 'Pausado', draft: 'Borrador', archived: 'Archivado', pending: 'Pago pendiente', retrying: 'Preparando reintento', paid: 'Pagado', failed: 'Pago fallido', expired: 'Sesión vencida' })[status] || status
}

async function loadAds() {
  loading.value = true
  error.value = ''
  try {
    const result = await getOrganizationAds()
    campaigns.value = result.campaigns || []
    orders.value = result.orders || []
    pricing.value = result.pricing || { configured: false, pricePerDay: 0, currency: 'MXN' }
    for (const ad of campaigns.value) renewalDays[ad.id] ||= 7
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudieron cargar los anuncios de la congregación.'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  editingId.value = null
  Object.assign(campaign, {
    brandName: auth.user?.organizationName || '', headline: '', body: '', imageUrl: '',
    ctaLabel: 'Conocer más', destinationUrl: '', placement: 'profile',
  })
}

function editCampaign(ad) {
  editingId.value = ad.id
  Object.assign(campaign, {
    brandName: ad.brandName, headline: ad.headline, body: ad.body,
    imageUrl: ad.imageUrl || '', ctaLabel: ad.ctaLabel,
    destinationUrl: ad.destinationUrl, placement: ad.placement,
  })
  error.value = ''
  notice.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function chooseMedia(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const image = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  const video = ['video/mp4', 'video/webm'].includes(file.type)
  if (!image && !video) {
    error.value = 'Selecciona una imagen JPEG, PNG o WebP, o un video MP4/WebM.'
    return
  }
  if (file.size > (image ? 5 : 50) * 1024 * 1024) {
    error.value = image ? 'La imagen no puede superar 5 MB.' : 'El video no puede superar 50 MB.'
    return
  }
  uploading.value = true
  uploadProgress.value = 0
  error.value = ''
  try {
    const media = await uploadOrganizationAdMedia(file, (value) => { uploadProgress.value = value })
    campaign.imageUrl = media.imageUrl
    notice.value = 'Archivo cargado y listo para la campaña.'
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo cargar el archivo.'
  } finally {
    uploading.value = false
    uploadProgress.value = 0
  }
}

async function submitCampaign() {
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    if (editingId.value) {
      await updateOrganizationAd(editingId.value, { ...campaign })
      notice.value = 'Cambios guardados.'
      resetForm()
      await loadAds()
      return
    }
    const checkout = await startOrganizationAdCheckout({ days: days.value, campaign: { ...campaign } })
    window.location.assign(checkout.url)
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo guardar o iniciar el pago.'
  } finally {
    saving.value = false
  }
}

async function renewCampaign(ad) {
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const checkout = await startOrganizationAdCheckout({ campaignId: ad.id, days: renewalDays[ad.id] || 7 })
    window.location.assign(checkout.url)
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo iniciar la renovación.'
  } finally {
    saving.value = false
  }
}

async function retryOrder(order) {
  retryingOrderId.value = order.id
  error.value = ''
  notice.value = ''
  try {
    const checkout = await retryOrganizationAdOrder(order.id)
    if (checkout.paid) {
      notice.value = 'Pago confirmado por Stripe. Los días de difusión ya están activos.'
      await loadAds()
      return
    }
    window.location.assign(checkout.url)
  } catch (problem) {
    const message = problem.response?.data?.error?.message || 'No se pudo reabrir el pago de este movimiento.'
    await loadAds()
    error.value = message
  } finally {
    retryingOrderId.value = ''
  }
}

async function toggleStatus(ad) {
  const nextStatus = ad.status === 'active' ? 'paused' : 'active'
  try {
    await setOrganizationAdStatus(ad.id, nextStatus)
    notice.value = nextStatus === 'paused' ? 'Campaña pausada.' : 'Campaña reactivada.'
    await loadAds()
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo cambiar el estado.'
  }
}

onMounted(async () => {
  if (route.query.checkout === 'success') notice.value = 'Pago recibido. Estamos confirmando la activación de tu campaña…'
  if (route.query.checkout === 'cancelled') notice.value = 'Pago cancelado. Tu campaña permanece como borrador.'
  await loadAds()
  if (route.query.checkout === 'success') {
    const checkoutSessionId = String(route.query.session_id || '')
    const currentOrderPaid = () => orders.value.some((order) => (
      order.stripeCheckoutSessionId === checkoutSessionId && order.status === 'paid'
    ))
    for (let attempt = 0; attempt < 6 && !currentOrderPaid(); attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000))
      await loadAds()
    }
    if (currentOrderPaid()) notice.value = 'Pago confirmado. Los días de difusión ya están activos.'
    else notice.value = 'El pago se recibió; la activación sigue pendiente de confirmación de Stripe.'
  }
})
</script>

<template>
  <section class="my-ads-view module-view">
    <header class="my-ads-hero">
      <div><p class="eyebrow"><MegaphoneIcon aria-hidden="true" /> DIFUSIÓN DE LA CONGREGACIÓN</p><h2>Publicidad</h2><p>Promociona encuentros, iniciativas y servicios de tu comunidad por días contratados.</p></div>
      <div class="my-ads-summary" aria-label="Resumen de campañas"><div><span>En circulación</span><strong>{{ activeCampaigns }}</strong></div><div><span>Pagos por confirmar</span><strong>{{ pendingOrders }}</strong></div></div>
    </header>

    <div v-if="auth.user?.role === 'superadmin' && !auth.selectedOrganizationId" class="my-ads-message my-ads-warning" role="status">Selecciona una congregación en el selector superior para administrar sus anuncios.</div>
    <div v-if="error" class="my-ads-message my-ads-error" role="alert">{{ error }}</div>
    <div v-if="notice" class="my-ads-message my-ads-notice" role="status"><CheckIcon aria-hidden="true" />{{ notice }}</div>

    <div class="my-ads-layout">
      <section class="my-ads-editor" aria-labelledby="my-ads-editor-title">
        <header class="my-ads-section-heading"><div><p class="eyebrow">{{ editingId ? 'EDITAR CAMPAÑA' : 'NUEVA DIFUSIÓN' }}</p><h3 id="my-ads-editor-title">{{ editingId ? 'Actualiza tu anuncio' : 'Crea tu campaña' }}</h3></div><span class="my-ads-step">01</span></header>
        <div v-if="!pricing.configured" class="my-ads-pricing-required"><SparklesIcon aria-hidden="true" /><span>La tarifa por día aún no está configurada. El superadmin debe establecerla antes de recibir compras.</span></div>
        <form class="my-ads-form" @submit.prevent="submitCampaign">
          <label><span>Nombre de la marca</span><input v-model.trim="campaign.brandName" maxlength="120" required /></label>
          <label><span>Titular</span><input v-model.trim="campaign.headline" maxlength="160" required placeholder="Una frase breve y clara" /></label>
          <label class="my-ads-wide"><span>Mensaje</span><textarea v-model.trim="campaign.body" maxlength="1000" rows="4" required placeholder="¿Qué quieres compartir con la comunidad?"></textarea></label>
          <label class="my-ads-wide"><span>Imagen o video</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" :disabled="uploading" @change="chooseMedia" /><small>{{ uploading ? `Cargando archivo… ${uploadProgress}%` : 'JPEG, PNG o WebP hasta 5 MB · MP4 o WebM hasta 50 MB' }}</small></label>
          <div v-if="campaign.imageUrl" class="my-ads-media-preview my-ads-wide">
            <video v-if="isVideoAdMedia(campaign.imageUrl)" :src="adMediaSource(campaign.imageUrl)" muted controls playsinline></video>
            <img v-else :src="adMediaSource(campaign.imageUrl)" alt="Vista previa del anuncio" />
            <button type="button" aria-label="Quitar archivo multimedia" title="Quitar archivo" @click="campaign.imageUrl = ''"><XMarkIcon aria-hidden="true" /></button>
          </div>
          <label><span>Destino del botón</span><input v-model.trim="campaign.destinationUrl" type="url" maxlength="1000" required placeholder="https://..." /></label>
          <label><span>Texto del botón</span><input v-model.trim="campaign.ctaLabel" maxlength="40" required /></label>
          <label><span>Ubicación</span><select v-model="campaign.placement" :disabled="Boolean(editingId && campaigns.find(({ id }) => id === editingId)?.purchasedDays)"><option value="profile">Perfil de congregación</option><option value="content">Áreas de contenido</option><option value="community">Comunidad</option></select></label>
          <template v-if="!editingId">
            <label><span>Días de difusión</span><input v-model.number="days" type="number" min="1" max="365" step="1" required /></label>
            <div class="my-ads-quote my-ads-wide"><div><span>Tarifa</span><strong>{{ pricing.configured ? `${formatPrice(pricing.pricePerDay)} / día` : 'Por configurar' }}</strong></div><div><span>Duración</span><strong>{{ days }} {{ days === 1 ? 'día' : 'días' }}</strong></div><div><span>Total antes de pagar</span><strong>{{ pricing.configured ? formatPrice(totalPrice) : '—' }}</strong></div></div>
          </template>
          <div class="my-ads-form-actions my-ads-wide"><button v-if="editingId" type="button" class="my-ads-button my-ads-button-quiet" @click="resetForm">Cancelar</button><button class="my-ads-button my-ads-button-primary" type="submit" :disabled="saving || uploading || (!editingId && !pricing.configured)"><ArrowPathIcon v-if="saving || uploading" class="spin" aria-hidden="true" /><CheckIcon v-else-if="editingId" aria-hidden="true" /><PlusIcon v-else aria-hidden="true" />{{ saving ? 'Procesando…' : editingId ? 'Guardar cambios' : `Continuar al pago · ${formatPrice(totalPrice)}` }}</button></div>
        </form>
      </section>

      <aside class="my-ads-side-note"><span class="my-ads-note-icon"><ClockIcon aria-hidden="true" /></span><p class="eyebrow">DÍAS CONTRATADOS</p><h3>La difusión empieza al confirmarse el pago.</h3><p>Stripe procesa el cobro de forma segura. Los días comprados se suman al vencimiento vigente de la campaña.</p><small>Tarifa vigente: {{ pricing.configured ? `${formatPrice(pricing.pricePerDay)} por día` : 'pendiente de configuración' }}</small></aside>
    </div>

    <section class="my-ads-inventory" aria-labelledby="my-ads-campaigns-title">
      <header class="my-ads-section-heading"><div><p class="eyebrow">GESTIÓN DE DIFUSIONES</p><h3 id="my-ads-campaigns-title">Mis campañas <span>{{ campaigns.length }}</span></h3></div><button type="button" class="my-ads-refresh" title="Actualizar campañas" aria-label="Actualizar campañas" @click="loadAds"><ArrowPathIcon aria-hidden="true" /></button></header>
      <div v-if="loading" class="my-ads-empty" role="status">Cargando campañas…</div>
      <div v-else-if="!campaigns.length" class="my-ads-empty"><MegaphoneIcon aria-hidden="true" /><strong>Aún no hay campañas</strong><span>Al completar el pago, tus anuncios aparecerán aquí.</span></div>
      <div v-else class="my-ads-campaign-list">
        <article v-for="ad in campaigns" :key="ad.id" class="my-ads-campaign">
          <div class="my-ads-campaign-media"><video v-if="isVideoAdMedia(ad.imageUrl)" :src="adMediaSource(ad.imageUrl)" muted playsinline preload="metadata"></video><img v-else-if="adMediaSource(ad.imageUrl)" :src="adMediaSource(ad.imageUrl)" :alt="ad.brandName" loading="lazy" /><MegaphoneIcon v-else aria-hidden="true" /></div>
          <div class="my-ads-campaign-copy"><div class="my-ads-campaign-meta"><span>{{ ad.brandName }}</span><span class="my-ads-status" :class="`my-ads-status-${ad.status}`"><i></i>{{ statusLabel(ad.status) }}</span></div><h4>{{ ad.headline }}</h4><p>{{ ad.body }}</p><small>{{ ad.purchasedDays }} días comprados · {{ formatDate(ad.startsAt) }} – {{ formatDate(ad.endsAt) }}</small></div>
          <div class="my-ads-actions"><div class="my-ads-renew"><input v-model.number="renewalDays[ad.id]" type="number" min="1" max="365" aria-label="Días a comprar" /><button type="button" class="my-ads-button my-ads-button-primary" :disabled="saving || !pricing.configured" @click="renewCampaign(ad)"><PlusIcon aria-hidden="true" />Comprar días</button></div><button type="button" class="my-ads-icon-button" :aria-label="`Editar ${ad.headline}`" title="Editar campaña" @click="editCampaign(ad)"><PencilIcon aria-hidden="true" /></button><button v-if="['active', 'paused'].includes(ad.status)" type="button" class="my-ads-icon-button" :aria-label="ad.status === 'active' ? 'Pausar campaña' : 'Reactivar campaña'" :title="ad.status === 'active' ? 'Pausar campaña' : 'Reactivar campaña'" @click="toggleStatus(ad)"><PauseIcon v-if="ad.status === 'active'" aria-hidden="true" /><PlayIcon v-else aria-hidden="true" /></button></div>
        </article>
      </div>
    </section>

    <section class="my-ads-inventory my-ads-orders" aria-labelledby="my-ads-orders-title">
      <header class="my-ads-section-heading"><div><p class="eyebrow">MOVIMIENTOS</p><h3 id="my-ads-orders-title">Historial de pagos</h3></div></header>
      <div v-if="!orders.length" class="my-ads-empty my-ads-orders-empty">Los pagos de campañas aparecerán aquí.</div>
      <div v-else class="my-ads-order-list"><article v-for="order in orders" :key="order.id"><div><strong>{{ order.campaignHeadline || 'Campaña publicitaria' }} · {{ order.daysPurchased }} {{ order.daysPurchased === 1 ? 'día' : 'días' }}</strong><small>{{ formatDate(order.createdAt) }} · Orden {{ order.id.slice(0, 8) }}</small></div><span class="my-ads-status" :class="`my-ads-status-${order.status}`"><i></i>{{ statusLabel(order.status) }}</span><strong>{{ formatPrice(order.amountMinor / 100, order.currency) }}</strong><button v-if="['pending', 'failed', 'expired'].includes(order.status)" class="my-ads-retry" type="button" :disabled="Boolean(retryingOrderId)" @click="retryOrder(order)"><ArrowPathIcon :class="{ spin: retryingOrderId === order.id }" aria-hidden="true" />{{ retryingOrderId === order.id ? 'Abriendo…' : order.status === 'pending' ? 'Continuar pago' : 'Reintentar pago' }}</button></article></div>
    </section>
  </section>
</template>

<style scoped>
.my-ads-view { display: grid; gap: 18px; }
.my-ads-hero { display: flex; align-items: end; justify-content: space-between; gap: 24px; padding: 20px 0 18px; border-bottom: 1px solid #dfe7df; }
.my-ads-hero .eyebrow { display: flex; align-items: center; gap: 7px; }
.my-ads-hero .eyebrow svg { width: 15px; height: 15px; }
.my-ads-hero h2 { margin: 0; color: #203e32; font: 600 34px/1.1 'Cormorant Garamond', serif; }
.my-ads-hero p:last-child { max-width: 540px; margin: 8px 0 0; color: #64766b; font-size: 11px; line-height: 1.6; }
.my-ads-summary { display: flex; gap: 22px; flex: 0 0 auto; }
.my-ads-summary div { display: grid; gap: 4px; min-width: 98px; padding-left: 15px; border-left: 1px solid #dfe7df; }
.my-ads-summary span { color: #738077; font-size: 9px; }
.my-ads-summary strong { color: #245d46; font: 700 22px 'Manrope', sans-serif; }
.my-ads-message { display: flex; align-items: center; gap: 9px; padding: 11px 13px; border: 1px solid #d9e4da; background: #f7faf5; color: #355841; font-size: 11px; }
.my-ads-message svg { width: 15px; height: 15px; }
.my-ads-error { border-color: #e7c8c1; color: #933d34; background: #fff8f5; }
.my-ads-warning { border-color: #e8d8ae; color: #765d2a; background: #fffaf0; }
.my-ads-layout { display: grid; grid-template-columns: minmax(0, 1fr) 245px; align-items: start; gap: 16px; }
.my-ads-editor, .my-ads-inventory { min-width: 0; padding: 18px; border: 1px solid #dfe6dc; background: rgba(255,255,255,.86); }
.my-ads-section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 16px; }
.my-ads-section-heading .eyebrow { margin: 0 0 5px; color: #78877a; font-size: 8px; font-weight: 800; letter-spacing: .12em; }
.my-ads-section-heading h3 { margin: 0; color: #203e32; font: 700 15px 'Manrope', sans-serif; }
.my-ads-section-heading h3 span { margin-left: 5px; color: #78877a; font-size: 11px; }
.my-ads-step { color: #b85843; font: 700 18px 'Manrope', sans-serif; }
.my-ads-pricing-required { display: flex; gap: 9px; margin-bottom: 14px; padding: 10px; color: #725c2e; background: #fff8e9; font-size: 10px; line-height: 1.5; }
.my-ads-pricing-required svg { width: 16px; height: 16px; flex: 0 0 auto; }
.my-ads-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.my-ads-form label { display: grid; align-content: start; gap: 5px; min-width: 0; color: #455d4d; font-size: 10px; font-weight: 700; }
.my-ads-form label span { min-height: 12px; }
.my-ads-form input, .my-ads-form textarea, .my-ads-form select { width: 100%; min-width: 0; min-height: 37px; padding: 8px 9px; border: 1px solid #d5dfd4; border-radius: 3px; outline: 0; color: #263d31; background: #fff; font: 11px 'DM Sans', sans-serif; }
.my-ads-form textarea { min-height: 86px; resize: vertical; line-height: 1.55; }
.my-ads-form input:focus, .my-ads-form textarea:focus, .my-ads-form select:focus { border-color: #59856a; box-shadow: 0 0 0 2px rgba(64,111,77,.11); }
.my-ads-form input[type=file] { padding: 6px; }
.my-ads-form input[type=file]::file-selector-button { margin-right: 9px; padding: 6px 9px; border: 0; border-radius: 2px; color: #315942; background: #eaf1e8; font-size: 9px; font-weight: 700; }
.my-ads-form small { color: #79867d; font-size: 9px; font-weight: 400; }
.my-ads-wide { grid-column: 1 / -1; }
.my-ads-media-preview { position: relative; display: grid; min-height: 75px; grid-template-columns: 110px 1fr; overflow: hidden; border: 1px solid #dfe6dc; background: #f4f6f1; }
.my-ads-media-preview img, .my-ads-media-preview video { width: 110px; height: 78px; object-fit: cover; }
.my-ads-media-preview button { position: absolute; top: 5px; right: 5px; display: grid; width: 26px; height: 26px; place-items: center; border: 1px solid #dfe6dc; background: #fff; color: #713e36; cursor: pointer; }
.my-ads-media-preview button svg { width: 14px; height: 14px; }
.my-ads-quote { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 11px 12px; border-left: 3px solid #b85843; background: #f5f7f1; }
.my-ads-quote div { display: grid; gap: 4px; }
.my-ads-quote span { color: #778378; font-size: 9px; }
.my-ads-quote strong { color: #254938; font: 700 12px 'Manrope', sans-serif; }
.my-ads-form-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 3px; }
.my-ads-button { display: inline-flex; min-height: 36px; align-items: center; justify-content: center; gap: 7px; padding: 0 11px; border: 1px solid transparent; border-radius: 3px; font: 700 9px 'DM Sans', sans-serif; cursor: pointer; }
.my-ads-button svg { width: 14px; height: 14px; }
.my-ads-button:disabled { opacity: .52; cursor: not-allowed; }
.my-ads-button-primary { color: #fff; background: #245d46; }
.my-ads-button-primary:hover:not(:disabled) { background: #174630; }
.my-ads-button-quiet { border-color: #d5dfd4; color: #4c6253; background: #fff; }
.my-ads-side-note { padding: 16px; border-top: 3px solid #b85843; background: #edf2e9; }
.my-ads-note-icon { display: grid; width: 34px; height: 34px; place-items: center; margin-bottom: 12px; color: #245d46; background: #fff; }
.my-ads-note-icon svg { width: 17px; height: 17px; }
.my-ads-side-note .eyebrow { margin: 0 0 6px; color: #708271; font-size: 8px; font-weight: 800; letter-spacing: .1em; }
.my-ads-side-note h3 { margin: 0; color: #234533; font: 600 22px/1.06 'Cormorant Garamond', serif; }
.my-ads-side-note p:not(.eyebrow) { color: #64756a; font-size: 10px; line-height: 1.6; }
.my-ads-side-note small { display: block; margin-top: 14px; padding-top: 10px; border-top: 1px solid #d4dfd1; color: #315c43; font-size: 9px; font-weight: 700; }
.my-ads-inventory { padding: 17px 18px; }
.my-ads-refresh, .my-ads-icon-button { display: grid; width: 31px; height: 31px; place-items: center; border: 1px solid #dbe4da; border-radius: 3px; color: #52675a; background: #fff; cursor: pointer; }
.my-ads-refresh svg, .my-ads-icon-button svg { width: 15px; height: 15px; }
.my-ads-refresh:hover, .my-ads-icon-button:hover { border-color: #92ad91; color: #245d46; }
.my-ads-empty { display: flex; min-height: 95px; flex-direction: column; align-items: center; justify-content: center; gap: 7px; color: #748077; font-size: 10px; text-align: center; }
.my-ads-empty svg { width: 22px; height: 22px; color: #66816a; }
.my-ads-empty strong { color: #31533f; font: 700 12px 'Manrope', sans-serif; }
.my-ads-campaign-list, .my-ads-order-list { display: grid; }
.my-ads-campaign { display: grid; grid-template-columns: 82px minmax(0, 1fr) auto; align-items: center; gap: 15px; padding: 14px 0; border-top: 1px solid #e6ebe4; }
.my-ads-campaign-media { display: grid; width: 82px; height: 64px; place-items: center; overflow: hidden; color: #728476; background: #edf2eb; }
.my-ads-campaign-media img, .my-ads-campaign-media video { width: 100%; height: 100%; object-fit: cover; }
.my-ads-campaign-media svg { width: 20px; height: 20px; }
.my-ads-campaign-copy { min-width: 0; }
.my-ads-campaign-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: #718076; font-size: 9px; }
.my-ads-status { display: inline-flex; align-items: center; gap: 5px; color: #50695a; font-size: 9px; font-weight: 700; }
.my-ads-status i { width: 6px; height: 6px; border-radius: 50%; background: #93a398; }
.my-ads-status-active i, .my-ads-status-paid i { background: #4f956a; }
.my-ads-status-pending i { background: #c9953c; }
.my-ads-status-failed i, .my-ads-status-paused i, .my-ads-status-archived i { background: #ba6a54; }
.my-ads-campaign-copy h4 { margin: 5px 0 3px; color: #244434; font: 700 12px 'Manrope', sans-serif; overflow-wrap: anywhere; }
.my-ads-campaign-copy p { margin: 0; color: #65756b; font-size: 10px; line-height: 1.5; }
.my-ads-campaign-copy small { display: block; margin-top: 6px; color: #829087; font-size: 8px; }
.my-ads-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.my-ads-renew { display: flex; gap: 5px; }
.my-ads-renew input { width: 48px; min-width: 0; padding: 0 4px; border: 1px solid #d7e0d6; border-radius: 3px; color: #274635; text-align: center; font-size: 10px; }
.my-ads-renew .my-ads-button { min-height: 31px; padding: 0 8px; }
.my-ads-orders { margin-top: 1px; }
.my-ads-order-list article { display: grid; grid-template-columns: minmax(0, 1fr) auto 100px auto; align-items: center; gap: 14px; padding: 11px 0; border-top: 1px solid #e6ebe4; }
.my-ads-order-list article > div { display: grid; gap: 4px; }
.my-ads-order-list article strong { color: #345340; font-size: 10px; }
.my-ads-order-list article small { color: #879189; font-size: 8px; }
.my-ads-order-list article > strong { text-align: right; }
.my-ads-retry { display: inline-flex; min-height: 31px; align-items: center; justify-content: center; gap: 6px; padding: 0 9px; border: 1px solid #bfd1bd; border-radius: 3px; color: #245d46; background: #f3f7f0; font: 700 9px 'DM Sans', sans-serif; cursor: pointer; white-space: nowrap; }
.my-ads-retry:hover:not(:disabled) { border-color: #789778; background: #eaf1e7; }
.my-ads-retry:disabled { opacity: .55; cursor: wait; }
.my-ads-retry svg { width: 13px; height: 13px; }
.my-ads-orders-empty { min-height: 55px; }
.spin { animation: my-ads-spin 800ms linear infinite; }
@keyframes my-ads-spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) {
  .my-ads-layout { grid-template-columns: minmax(0, 1fr); }
  .my-ads-side-note { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 12px; align-items: start; }
  .my-ads-side-note .my-ads-note-icon { grid-row: span 3; margin: 0; }
  .my-ads-side-note .eyebrow, .my-ads-side-note h3, .my-ads-side-note p, .my-ads-side-note small { grid-column: 2; }
}
@media (max-width: 620px) {
  .my-ads-hero { align-items: flex-start; flex-direction: column; }
  .my-ads-summary { width: 100%; }
  .my-ads-summary div:first-child { padding-left: 0; border: 0; }
  .my-ads-editor, .my-ads-inventory { padding: 14px; }
  .my-ads-form { grid-template-columns: minmax(0, 1fr); }
  .my-ads-wide { grid-column: auto; }
  .my-ads-quote { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .my-ads-quote div:last-child { grid-column: 1 / -1; padding-top: 8px; border-top: 1px solid #dce4d9; }
  .my-ads-campaign { grid-template-columns: 58px minmax(0, 1fr); gap: 10px; align-items: start; }
  .my-ads-campaign-media { width: 58px; height: 52px; }
  .my-ads-actions { grid-column: 2; justify-content: flex-start; }
  .my-ads-order-list article { grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
  .my-ads-order-list article > strong { grid-column: 2; grid-row: 1; }
  .my-ads-order-list article .my-ads-status { grid-column: 1 / -1; }
  .my-ads-retry { grid-column: 1 / -1; justify-self: start; }
}
</style>