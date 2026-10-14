<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ArrowDownTrayIcon, ArrowPathIcon, ArrowUpTrayIcon, CheckIcon, MegaphoneIcon, PencilIcon, PlayIcon, PauseIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import AdBanner from '../components/community/AdBanner.vue'
import { adMediaSource, createAd, deleteAd, getAdDisplaySettings, getAdPricing, isVideoAdMedia, listAdPurchases, listAds, updateAd, updateAdDisplaySettings, updateAdPricing, uploadAdMedia } from '../services/adsService'

const ads = ref([])
const loading = ref(true)
const saving = ref(false)
const uploadingImage = ref(false)
const uploadProgress = ref(0)
const mediaDragging = ref(false)
const error = ref('')
const notice = ref('')
const editingId = ref(null)
const pricing = reactive({ configured: false, pricePerDay: 0, currency: 'MXN' })
const displaySettings = reactive({ refreshIntervalSeconds: 60 })
const purchases = ref([])
const savingPricing = ref(false)
const savingDisplaySettings = ref(false)
const campaign = reactive({
  brandName: '', headline: '', body: '', imageUrl: '', ctaLabel: 'Conocer más',
  destinationUrl: '', placement: 'community', status: 'draft', startsAt: '', endsAt: '',
})
const activeCount = computed(() => ads.value.filter(({ status }) => status === 'active').length)
const draftCount = computed(() => ads.value.filter(({ status }) => status === 'draft').length)
const pausedCount = computed(() => ads.value.filter(({ status }) => status === 'paused').length)
const previewCampaign = computed(() => ({
  id: 'campaign-preview',
  brandName: campaign.brandName || 'Nombre de marca',
  headline: campaign.headline || 'El titular de tu anuncio',
  body: campaign.body || 'Aquí aparecerá el mensaje que verá la comunidad.',
  imageUrl: campaign.imageUrl,
  ctaLabel: campaign.ctaLabel || 'Conocer más',
  destinationUrl: campaign.destinationUrl,
  placement: campaign.placement,
}))

function localDateTime(value) {
  if (!value) return ''
  const utcValue = value.includes('Z') || /[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}:00Z`
  const date = new Date(utcValue)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function utcDateTime(value) {
  return value ? new Date(value).toISOString() : ''
}

function resetForm() {
  editingId.value = null
  Object.assign(campaign, {
    brandName: '', headline: '', body: '', imageUrl: '', ctaLabel: 'Conocer más',
    destinationUrl: '', placement: 'community', status: 'draft', startsAt: '', endsAt: '',
  })
}

function editAd(ad) {
  editingId.value = ad.id
  Object.assign(campaign, {
    brandName: ad.brandName,
    headline: ad.headline,
    body: ad.body,
    imageUrl: ad.imageUrl || '',
    ctaLabel: ad.ctaLabel,
    destinationUrl: ad.destinationUrl,
    placement: ad.placement,
    status: ad.status,
    startsAt: localDateTime(ad.startsAt),
    endsAt: localDateTime(ad.endsAt),
  })
  error.value = ''
  notice.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function loadAds() {
  loading.value = true
  error.value = ''
  try {
    const [campaignList, pricingSettings, display, purchaseList] = await Promise.all([listAds(), getAdPricing(), getAdDisplaySettings(), listAdPurchases()])
    ads.value = campaignList
    Object.assign(pricing, pricingSettings)
    Object.assign(displaySettings, display)
    purchases.value = purchaseList
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudieron cargar los anuncios.'
  } finally {
    loading.value = false
  }
}

async function saveDisplaySettings() {
  savingDisplaySettings.value = true
  error.value = ''
  notice.value = ''
  try {
    Object.assign(displaySettings, await updateAdDisplaySettings(displaySettings))
    notice.value = 'Temporizador global de publicidad actualizado.'
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo guardar el temporizador.'
  } finally {
    savingDisplaySettings.value = false
  }
}

async function savePricing() {
  savingPricing.value = true
  error.value = ''
  notice.value = ''
  try {
    Object.assign(pricing, await updateAdPricing({ pricePerDay: pricing.pricePerDay, currency: pricing.currency }))
    notice.value = 'Tarifa publicitaria actualizada.'
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo guardar la tarifa.'
  } finally {
    savingPricing.value = false
  }
}

async function onImageSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  await uploadMediaFile(file)
}

async function uploadMediaFile(file) {
  if (!file) return
  const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  const isVideo = ['video/mp4', 'video/webm'].includes(file.type)
  if (!isImage && !isVideo) {
    error.value = 'Elige una imagen JPEG, PNG, WebP o un video MP4/WebM.'
    return
  }
  const maxSize = isImage ? 5 * 1024 * 1024 : 50 * 1024 * 1024
  if (file.size > maxSize) {
    error.value = isImage ? 'La imagen no puede superar 5 MB.' : 'El video no puede superar 50 MB.'
    return
  }

  uploadingImage.value = true
  uploadProgress.value = 0
  error.value = ''
  try {
    const uploadedMedia = await uploadAdMedia(file, (progress) => { uploadProgress.value = progress })
    campaign.imageUrl = uploadedMedia.imageUrl
    notice.value = isVideo ? 'Video cargado en Holi Places.' : 'Imagen cargada en Holi Places.'
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo cargar el archivo multimedia.'
  } finally {
    uploadingImage.value = false
    uploadProgress.value = 0
  }
}

function onMediaDragLeave(event) {
  if (event.currentTarget.contains(event.relatedTarget)) return
  mediaDragging.value = false
}

function onMediaDrop(event) {
  mediaDragging.value = false
  uploadMediaFile(event.dataTransfer?.files?.[0])
}

async function saveAd() {
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const payload = { ...campaign, startsAt: utcDateTime(campaign.startsAt), endsAt: utcDateTime(campaign.endsAt) }
    if (editingId.value) {
      await updateAd(editingId.value, payload)
      notice.value = 'Anuncio actualizado.'
    } else {
      await createAd(payload)
      notice.value = 'Anuncio creado.'
    }
    resetForm()
    await loadAds()
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo guardar el anuncio.'
  } finally {
    saving.value = false
  }
}

async function toggleStatus(ad) {
  try {
    await updateAd(ad.id, { ...ad, status: ad.status === 'active' ? 'paused' : 'active' })
    notice.value = ad.status === 'active' ? 'Anuncio pausado.' : 'Anuncio activado.'
    await loadAds()
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo cambiar el estado del anuncio.'
  }
}

async function removeAd(ad) {
  if (!window.confirm(`¿Eliminar el anuncio “${ad.headline}”?`)) return
  try {
    await deleteAd(ad.id)
    notice.value = 'Anuncio eliminado.'
    if (editingId.value === ad.id) resetForm()
    await loadAds()
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo eliminar el anuncio.'
  }
}

function statusLabel(status) {
  return ({ active: 'Activo', draft: 'Borrador', paused: 'Pausado', archived: 'Archivado' })[status] || status
}

function placementLabel(placement) {
  return ({ community: 'Comunidad', content: 'Áreas de contenido', profile: 'Perfil de congregación' })[placement] || placement
}

function orderStatusLabel(status) {
  return ({ pending: 'Pendiente', paid: 'Pagado', failed: 'Fallido' })[status] || status
}

function orderAmount(order) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: order.currency }).format(order.amountMinor / 100)
}

onMounted(loadAds)
</script>

<template>
  <section class="ads-admin-view module-view">
    <header class="ads-hero">
      <div class="ads-hero-copy">
        <p class="ads-kicker"><MegaphoneIcon aria-hidden="true" /> CENTRO DE CAMPAÑAS</p>
        <h2>Publicidad</h2>
        <p>Gestiona los anuncios que aparecen en la comunidad.</p>
      </div>
      <div class="ads-hero-stats" aria-label="Resumen de campañas">
        <div class="ads-stat ads-stat-live"><span>En circulación</span><strong>{{ activeCount }}</strong><i aria-hidden="true"></i></div>
        <div class="ads-stat"><span>Borradores</span><strong>{{ draftCount }}</strong></div>
        <div class="ads-stat"><span>Pausados</span><strong>{{ pausedCount }}</strong></div>
      </div>
    </header>

    <section class="ads-pricing-panel" aria-labelledby="ads-pricing-title">
      <div class="ads-pricing-copy"><p class="ads-section-kicker">VENTA DE ESPACIOS</p><h3 id="ads-pricing-title">Tarifa por día de publicidad</h3><p>Se usa para cotizar y crear pagos únicos de Stripe.</p></div>
      <form class="ads-pricing-form" @submit.prevent="savePricing">
        <label><span>Precio por día</span><input v-model.number="pricing.pricePerDay" type="number" min="0.01" max="100000" step="0.01" required /></label>
        <label><span>Moneda</span><select v-model="pricing.currency"><option value="MXN">MXN · Peso mexicano</option><option value="USD">USD · Dólar estadounidense</option></select></label>
        <button class="ads-save-action" type="submit" :disabled="savingPricing"><ArrowPathIcon v-if="savingPricing" class="ads-save-spinner" aria-hidden="true" /><CheckIcon v-else aria-hidden="true" />{{ savingPricing ? 'Guardando…' : pricing.configured ? 'Actualizar tarifa' : 'Activar tarifa' }}</button>
      </form>
    </section>

    <section class="ads-refresh-panel" aria-labelledby="ads-refresh-title">
      <div class="ads-refresh-copy"><p class="ads-section-kicker">ROTACIÓN EN VIVO</p><h3 id="ads-refresh-title">Temporizador global de publicidad</h3><p>Las páginas públicas consultan solo los anuncios; agenda y contenido no se recargan.</p></div>
      <form class="ads-refresh-form" @submit.prevent="saveDisplaySettings">
        <label><span>Actualizar cada</span><span class="ads-refresh-input"><input v-model.number="displaySettings.refreshIntervalSeconds" type="number" min="15" max="3600" step="1" required /><strong>segundos</strong></span><small>Entre 15 y 3,600 segundos</small></label>
        <button class="ads-save-action" type="submit" :disabled="savingDisplaySettings"><ArrowPathIcon v-if="savingDisplaySettings" class="ads-save-spinner" aria-hidden="true" /><CheckIcon v-else aria-hidden="true" />{{ savingDisplaySettings ? 'Guardando…' : 'Guardar temporizador' }}</button>
      </form>
    </section>

    <section class="ads-distribution-panel" aria-labelledby="ads-distribution-title">
      <header class="ads-distribution-heading"><div><p class="ads-section-kicker">MAPA DE POSICIONES</p><h3 id="ads-distribution-title">Distribución en páginas públicas</h3></div><span>{{ ads.filter(({ status }) => status === 'active').length }} campañas activas</span></header>
      <div class="ads-distribution-grid">
        <article class="ads-distribution-page"><header><span class="ads-map-index">01</span><div><strong>Comunidad</strong><small>/comunidad</small></div></header><div class="ads-map-flow"><div class="ads-map-section">Portada + sedes</div><span class="ads-map-connector"></span><div class="ads-map-slot"><span>Contenido · espacio 1</span><b>Antes de Agenda</b></div><span class="ads-map-connector"></span><div class="ads-map-slot"><span>Comunidad · espacio 1</span><b>Después de Agenda</b></div><span class="ads-map-connector"></span><div class="ads-map-slot"><span>Comunidad 2 + Contenido 2</span><b>Entre Aportes e Historias</b></div><span class="ads-map-connector"></span><div class="ads-map-slot"><span>Comunidad 3 + Contenido 3</span><b>Después de Historias</b></div></div></article>
        <article class="ads-distribution-page"><header><span class="ads-map-index">02</span><div><strong>Comunidad Social</strong><small>/comunidad/social</small></div></header><div class="ads-map-flow"><div class="ads-map-section">Portada + congregaciones</div><span class="ads-map-connector"></span><div class="ads-map-slot"><span>Comunidad · espacio 1</span><b>Antes del Tablero</b></div><span class="ads-map-connector"></span><div class="ads-map-slot"><span>Comunidad 2 + Contenido 1</span><b>Entre Tablero y Agenda</b></div><span class="ads-map-connector"></span><div class="ads-map-slot"><span>Comunidad 3 + Contenido 2</span><b>Entre Agenda e Historias</b></div><span class="ads-map-connector"></span><div class="ads-map-slot"><span>Contenido · espacio 3</span><b>Después de Historias</b></div></div></article>
        <article class="ads-distribution-page"><header><span class="ads-map-index">03</span><div><strong>Perfil de congregación</strong><small>/comunidad/congregacion/:id</small></div></header><div class="ads-map-flow"><div class="ads-map-section">Ficha + información</div><span class="ads-map-connector"></span><div class="ads-map-slot ads-map-slot-profile"><span>Perfil · espacio 1</span><b>Después de portada</b></div><span class="ads-map-connector"></span><div class="ads-map-slot ads-map-slot-profile"><span>Perfil · espacio 2</span><b>Después de información</b></div><span class="ads-map-connector"></span><div class="ads-map-slot ads-map-slot-profile"><span>Perfil · espacio 3</span><b>Después de Agenda</b></div><p class="ads-map-fallback">Si no hay campañas Perfil activas, se usan campañas activas de Contenido.</p></div></article>
      </div>
    </section>

    <Transition name="ads-message">
      <div v-if="error" class="ads-message ads-message-error" role="alert">{{ error }}</div>
    </Transition>
    <Transition name="ads-message">
      <div v-if="notice" class="ads-message ads-message-success" role="status"><CheckIcon aria-hidden="true" />{{ notice }}</div>
    </Transition>

    <section class="ads-preview-panel" aria-labelledby="ads-preview-title">
      <header class="ads-preview-heading">
        <div>
          <p class="ads-section-kicker">ASÍ LO VERÁ LA COMUNIDAD</p>
          <h3 id="ads-preview-title">Vista previa del anuncio</h3>
        </div>
        <span>{{ placementLabel(campaign.placement) }}</span>
      </header>
      <AdBanner :ads="[previewCampaign]" :placement="campaign.placement" preview />
    </section>

    <div class="ads-workspace">
      <section class="ads-editor-panel" aria-labelledby="ads-editor-title">
        <div class="ads-section-heading">
          <div>
            <p class="ads-section-kicker">{{ editingId ? 'CAMPAÑA EN EDICIÓN' : 'CONFIGURACIÓN' }}</p>
            <h3 id="ads-editor-title">{{ editingId ? 'Actualizar anuncio' : 'Nueva campaña' }}</h3>
          </div>
          <span class="ads-step-mark">01</span>
        </div>

        <form class="ads-editor" @submit.prevent="saveAd">
          <div class="ads-form-fields">
            <label class="ads-field">
              <span>Marca</span>
              <input v-model.trim="campaign.brandName" required maxlength="120" autocomplete="organization" placeholder="Nombre de la marca" />
            </label>
            <label class="ads-field">
              <span>Titular</span>
              <input v-model.trim="campaign.headline" required maxlength="160" placeholder="Una frase breve y clara" />
            </label>
            <label class="ads-field ads-field-wide">
              <span>Mensaje</span>
              <textarea v-model.trim="campaign.body" required maxlength="1000" rows="3" placeholder="¿Qué quieres compartir con la comunidad?"></textarea>
            </label>
            <label
              class="ads-field ads-field-wide ads-upload-field"
              :class="{ 'ads-upload-active': mediaDragging, 'ads-uploading': uploadingImage }"
              @dragenter.prevent="mediaDragging = true"
              @dragover.prevent="mediaDragging = true"
              @dragleave.prevent="onMediaDragLeave"
              @drop.prevent="onMediaDrop"
            >
              <span>Imagen o video</span>
              <span class="ads-upload-control">
                <ArrowPathIcon v-if="uploadingImage" class="ads-upload-spinner" aria-hidden="true" />
                <ArrowDownTrayIcon v-else-if="mediaDragging" class="ads-upload-drop-icon" aria-hidden="true" />
                <ArrowUpTrayIcon v-else aria-hidden="true" />
                <span class="ads-upload-copy">
                  <strong>{{ uploadingImage ? `Cargando multimedia… ${uploadProgress}%` : mediaDragging ? 'Suelta la imagen o el video aquí' : 'Arrastra una imagen o video, o selecciona desde tu equipo' }}</strong>
                  <small v-if="uploadingImage">Subiendo archivo a Holi Places</small>
                  <small v-else>JPEG, PNG, WebP · hasta 5 MB <span aria-hidden="true">|</span> MP4, WebM · hasta 50 MB</small>
                </span>
              </span>
              <span v-if="uploadingImage" class="ads-upload-progress" aria-hidden="true"><i :style="{ width: `${uploadProgress}%` }"></i></span>
              <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" :disabled="uploadingImage" @change="onImageSelected" />
            </label>
            <Transition name="ads-preview">
              <div v-if="campaign.imageUrl" class="ads-image-preview ads-field-wide">
                <video v-if="isVideoAdMedia(campaign.imageUrl)" :src="adMediaSource(campaign.imageUrl)" controls playsinline preload="metadata" aria-label="Vista previa del video publicitario"></video>
                <img v-else :src="adMediaSource(campaign.imageUrl)" alt="Vista previa de la imagen del anuncio" />
                <div><span>{{ isVideoAdMedia(campaign.imageUrl) ? 'VIDEO CARGADO' : 'IMAGEN CARGADA' }}</span><strong>Listo para publicar</strong></div>
                <button class="ads-icon-button" type="button" title="Quitar imagen" aria-label="Quitar imagen" @click="campaign.imageUrl = ''"><XMarkIcon /></button>
              </div>
            </Transition>
            <label class="ads-field ads-field-wide">
              <span>Enlace de destino</span>
              <input v-model.trim="campaign.destinationUrl" type="url" required maxlength="1000" placeholder="https://ejemplo.com" />
            </label>
            <label class="ads-field">
              <span>Texto del botón</span>
              <input v-model.trim="campaign.ctaLabel" required maxlength="40" placeholder="Conocer más" />
            </label>
            <label class="ads-field">
              <span>Ubicación</span>
              <select v-model="campaign.placement"><option value="community">Comunidad</option><option value="content">Áreas de contenido</option><option value="profile">Perfil de congregación</option></select>
            </label>
            <label class="ads-field">
              <span>Estado inicial</span>
              <select v-model="campaign.status"><option value="draft">Borrador</option><option value="active">Activo</option><option value="paused">Pausado</option><option value="archived">Archivado</option></select>
            </label>
            <label class="ads-field">
              <span>Comienza</span>
              <input v-model="campaign.startsAt" type="datetime-local" />
            </label>
            <label class="ads-field">
              <span>Finaliza</span>
              <input v-model="campaign.endsAt" type="datetime-local" />
            </label>
          </div>
          <div class="ads-editor-footer">
            <button v-if="editingId" class="ads-cancel-action" type="button" @click="resetForm">Cancelar</button>
            <button v-else class="ads-cancel-action" type="button" @click="resetForm">Limpiar</button>
            <button class="ads-save-action" type="submit" :disabled="saving || uploadingImage">
              <ArrowPathIcon v-if="saving || uploadingImage" class="ads-save-spinner" aria-hidden="true" />
              <CheckIcon v-else-if="editingId" aria-hidden="true" />
              <PlusIcon v-else aria-hidden="true" />
              {{ uploadingImage ? 'Subiendo…' : saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear campaña' }}
            </button>
          </div>
        </form>

      </section>

      <section class="ads-inventory" aria-labelledby="ads-inventory-title">
        <header class="ads-inventory-heading">
          <div>
            <p class="ads-section-kicker">ANUNCIOS PUBLICADOS Y EN PREPARACIÓN</p>
            <h3 id="ads-inventory-title">Campañas <span>{{ ads.length }}</span></h3>
          </div>
          <button class="ads-refresh" type="button" title="Actualizar campañas" aria-label="Actualizar campañas" @click="loadAds"><ArrowPathIcon aria-hidden="true" /></button>
        </header>

        <div class="ads-inventory-labels" aria-hidden="true"><span>CAMPAÑA</span><span>UBICACIÓN</span><span>ACCIONES</span></div>
        <Transition name="ads-state" mode="out-in">
          <div v-if="loading" key="loading" class="ads-empty-state" role="status">
            <ArrowPathIcon class="ads-state-spinner" aria-hidden="true" /><span>Cargando campañas</span>
          </div>
          <div v-else-if="!ads.length" key="empty" class="ads-empty-state">
            <span class="ads-empty-icon"><MegaphoneIcon aria-hidden="true" /></span>
            <strong>Tu espacio publicitario está listo</strong>
            <span>Crea una campaña para mostrar el primer anuncio en la comunidad.</span>
          </div>
          <TransitionGroup v-else key="campaigns" class="ads-campaign-list" tag="div" name="ads-row">
            <article v-for="(ad, index) in ads" :key="ad.id" class="ads-campaign-row" :style="{ '--row-index': index }">
              <div class="ads-campaign-main">
                <div class="ads-campaign-image">
                  <video v-if="isVideoAdMedia(ad.imageUrl)" :src="adMediaSource(ad.imageUrl)" muted playsinline preload="metadata" :aria-label="`Vista previa de video de ${ad.brandName}`"></video>
                  <img v-else-if="adMediaSource(ad.imageUrl)" :src="adMediaSource(ad.imageUrl)" :alt="ad.brandName" loading="lazy" />
                  <MegaphoneIcon v-else aria-hidden="true" />
                </div>
                <div class="ads-campaign-copy">
                  <div class="ads-campaign-meta"><span>{{ ad.brandName }}</span><span class="ads-status" :class="`ads-status-${ad.status}`"><i aria-hidden="true"></i>{{ statusLabel(ad.status) }}</span></div>
                  <h4>{{ ad.headline }}</h4>
                  <p>{{ ad.body }}</p>
                  <small v-if="ad.organizationName">Congregación: {{ ad.organizationName }} · {{ ad.purchasedDays || 0 }} días comprados</small>
                  <small v-else-if="ad.startsAt">Desde {{ ad.startsAt.replace('T', ' ') }}</small>
                </div>
              </div>
              <span class="ads-placement-tag">{{ placementLabel(ad.placement) }}</span>
              <div class="ads-row-actions">
                <button class="ads-icon-button" type="button" :aria-label="`Editar ${ad.headline}`" title="Editar anuncio" @click="editAd(ad)"><PencilIcon /></button>
                <button class="ads-icon-button" type="button" :aria-label="ad.status === 'active' ? `Pausar ${ad.headline}` : `Activar ${ad.headline}`" :title="ad.status === 'active' ? 'Pausar anuncio' : 'Activar anuncio'" @click="toggleStatus(ad)"><PauseIcon v-if="ad.status === 'active'" /><PlayIcon v-else /></button>
                <button class="ads-icon-button ads-delete-button" type="button" :aria-label="`Eliminar ${ad.headline}`" title="Eliminar anuncio" @click="removeAd(ad)"><TrashIcon /></button>
              </div>
            </article>
          </TransitionGroup>
        </Transition>
      </section>
    </div>

    <section class="ads-purchases-panel" aria-labelledby="ads-purchases-title">
      <header class="ads-inventory-heading"><div><p class="ads-section-kicker">COBROS DE PUBLICIDAD</p><h3 id="ads-purchases-title">Órdenes de compra <span>{{ purchases.length }}</span></h3></div></header>
      <div v-if="!purchases.length" class="ads-purchases-empty">Todavía no hay compras de días publicitarios.</div>
      <div v-else class="ads-purchases-list">
        <article v-for="purchase in purchases" :key="purchase.id" class="ads-purchase-row">
          <div><strong>{{ purchase.organizationName }}</strong><span>{{ purchase.brandName }} · {{ purchase.headline }}</span><small>{{ purchase.id }}</small></div>
          <span>{{ purchase.daysPurchased }} {{ purchase.daysPurchased === 1 ? 'día' : 'días' }}</span>
          <strong>{{ orderAmount(purchase) }}</strong>
          <span class="ads-order-status" :class="`ads-order-status-${purchase.status}`">{{ orderStatusLabel(purchase.status) }}</span>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.ads-admin-view { --ads-forest: #174f41; --ads-moss: #d8e5d8; --ads-coral: #d98263; display: grid; gap: 22px; animation: ads-page-in 420ms cubic-bezier(.2,.7,.2,1) both; }
.ads-pricing-panel, .ads-purchases-panel { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 17px 19px; border: 1px solid #dce6dc; background: rgba(255,255,255,.82); }
.ads-refresh-panel { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 17px 19px; border: 1px solid #dce6dc; border-left: 3px solid #b8694d; background: #f7f9f4; }
.ads-refresh-copy h3 { margin: 0; color: #234637; font: 600 21px/1.1 'Cormorant Garamond', serif; }
.ads-refresh-copy > p:last-child { margin: 5px 0 0; color: #718076; font: 10px/1.5 'DM Sans', sans-serif; }
.ads-refresh-form { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; }
.ads-refresh-form label { display: grid; gap: 5px; color: #53675a; font: 700 9px 'DM Sans', sans-serif; }
.ads-refresh-input { display: flex; align-items: center; gap: 7px; }
.ads-refresh-input input { width: 90px; min-height: 36px; padding: 7px 8px; border: 1px solid #dce5de; border-radius: 3px; color: #263f33; font: 11px 'DM Sans', sans-serif; }
.ads-refresh-input strong { color: #52695a; font-size: 9px; }
.ads-refresh-form label small { color: #89938b; font: 8px 'DM Sans', sans-serif; }
.ads-distribution-panel { padding: 17px 19px; border: 1px solid #dce6dc; background: rgba(255,255,255,.82); }
.ads-distribution-heading { display: flex; align-items: end; justify-content: space-between; gap: 14px; margin-bottom: 16px; }
.ads-distribution-heading h3 { margin: 0; color: #234637; font: 600 23px/1.05 'Cormorant Garamond', serif; }
.ads-distribution-heading > span { color: #607467; font: 700 9px 'DM Sans', sans-serif; }
.ads-distribution-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.ads-distribution-page { min-width: 0; padding: 13px; border: 1px solid #e2e9e1; background: #fbfcf8; }
.ads-distribution-page > header { display: flex; align-items: center; gap: 9px; padding-bottom: 11px; border-bottom: 1px solid #e3e9e1; }
.ads-map-index { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; color: #fff; background: #245d46; font: 700 9px 'Manrope', sans-serif; }
.ads-distribution-page > header div { display: grid; gap: 3px; min-width: 0; }
.ads-distribution-page > header strong { color: #294b39; font: 700 10px 'Manrope', sans-serif; }
.ads-distribution-page > header small { overflow-wrap: anywhere; color: #89938b; font: 8px 'DM Sans', sans-serif; }
.ads-map-flow { display: grid; justify-items: stretch; padding-top: 10px; }
.ads-map-section { padding: 8px; border: 1px solid #e2e8e0; color: #728075; background: #f1f4ed; font: 700 8px 'DM Sans', sans-serif; text-align: center; }
.ads-map-connector { justify-self: center; width: 1px; height: 10px; background: #b9c9b6; }
.ads-map-slot { display: grid; gap: 4px; padding: 8px; border-left: 3px solid #b8694d; background: #f7eee8; }
.ads-map-slot span { color: #a15640; font: 700 8px 'DM Sans', sans-serif; }
.ads-map-slot b { color: #435d4b; font: 600 8px 'DM Sans', sans-serif; }
.ads-map-slot-profile { border-left-color: #577f61; background: #edf3e9; }
.ads-map-slot-profile span { color: #43714d; }
.ads-map-fallback { margin: 10px 0 0; color: #748077; font: 8px/1.45 'DM Sans', sans-serif; }
.ads-pricing-copy { min-width: 0; }
.ads-pricing-copy h3 { margin: 0; color: #234637; font: 600 21px/1.1 'Cormorant Garamond', serif; }
.ads-pricing-copy > p:last-child { margin: 5px 0 0; color: #718076; font: 10px/1.5 'DM Sans', sans-serif; }
.ads-pricing-form { display: flex; flex-wrap: wrap; align-items: end; gap: 9px; }
.ads-pricing-form label { display: grid; gap: 4px; color: #53675a; font: 700 9px 'DM Sans', sans-serif; }
.ads-pricing-form input, .ads-pricing-form select { min-width: 135px; min-height: 36px; padding: 7px 8px; border: 1px solid #dce5de; border-radius: 3px; color: #263f33; background: #fff; font: 10px 'DM Sans', sans-serif; }
.ads-purchases-panel { align-items: stretch; flex-direction: column; }
.ads-purchases-panel .ads-inventory-heading { margin-bottom: 0; }
.ads-purchases-list { display: grid; }
.ads-purchase-row { display: grid; grid-template-columns: minmax(0,1fr) 75px 110px 90px; align-items: center; gap: 15px; padding: 11px 0; border-top: 1px solid #e5ece5; color: #52675a; font: 10px 'DM Sans', sans-serif; }
.ads-purchase-row > div { display: grid; min-width: 0; gap: 3px; }
.ads-purchase-row strong { color: #294b39; font-size: 10px; }
.ads-purchase-row span, .ads-purchase-row small { overflow-wrap: anywhere; }
.ads-purchase-row small { color: #89938b; font-size: 8px; }
.ads-order-status { font-weight: 800; }
.ads-order-status-paid { color: #388257; }
.ads-order-status-pending { color: #a17b34; }
.ads-order-status-failed { color: #a14d3b; }
.ads-purchases-empty { padding: 20px 0 5px; color: #77847a; font: 10px 'DM Sans', sans-serif; text-align: center; }
.ads-hero { display: flex; min-height: 168px; align-items: center; justify-content: space-between; gap: 28px; padding: 25px 30px; color: #f6f7ef; background: var(--ads-forest); position: relative; overflow: hidden; isolation: isolate; }
.ads-hero::after { position: absolute; z-index: -1; inset: 0 0 0 auto; width: 42%; content: ''; background: repeating-linear-gradient(135deg, transparent 0 22px, rgba(255,255,255,.035) 22px 23px); mask-image: linear-gradient(90deg, transparent, #000); }
.ads-hero-copy { min-width: 0; }
.ads-kicker, .ads-section-kicker { display: flex; align-items: center; gap: 7px; margin: 0 0 8px; color: #e0a07f; font: 700 9px 'DM Sans', sans-serif; letter-spacing: .12em; }
.ads-kicker svg { width: 15px; height: 15px; }
.ads-hero h2 { margin: 0; font: 600 36px/1 'Cormorant Garamond', serif; }
.ads-hero-copy > p:last-child { margin: 10px 0 0; color: #c0d0c6; font: 11px/1.5 'DM Sans', sans-serif; }
.ads-hero-stats { display: grid; min-width: min(48%, 360px); grid-template-columns: repeat(3, minmax(0, 1fr)); border-left: 1px solid rgba(255,255,255,.2); }
.ads-stat { position: relative; display: grid; min-height: 55px; align-content: space-between; gap: 8px; padding: 2px 16px 2px 20px; border-right: 1px solid rgba(255,255,255,.16); }
.ads-stat:last-child { border-right: 0; }
.ads-stat span { color: #c0d0c6; font: 10px 'DM Sans', sans-serif; }
.ads-stat strong { color: #fff; font: 700 23px/1 'Manrope', sans-serif; font-variant-numeric: tabular-nums; }
.ads-stat-live i { position: absolute; top: 4px; right: 17px; width: 7px; height: 7px; border-radius: 50%; background: #a7d897; box-shadow: 0 0 0 0 rgba(167,216,151,.55); animation: ads-live-pulse 2.4s ease-out infinite; }
.ads-message { display: flex; align-items: center; gap: 9px; min-height: 38px; padding: 9px 12px; border: 1px solid #dce8de; font: 11px/1.45 'DM Sans', sans-serif; }
.ads-message svg { width: 15px; height: 15px; flex: 0 0 auto; }
.ads-message-error { border-color: #efd7ce; color: #954c39; background: #fff7f3; }
.ads-message-success { color: #315b46; background: #f2f8f1; }
.ads-workspace { display: grid; grid-template-columns: minmax(320px, .88fr) minmax(0, 1.32fr); align-items: start; gap: clamp(22px, 3vw, 42px); }
.ads-editor-panel { min-width: 0; padding: 0 20px 0 0; border-right: 1px solid #e1e8e2; animation: ads-section-in 440ms 70ms cubic-bezier(.2,.7,.2,1) both; }
.ads-section-heading, .ads-inventory-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ads-section-heading { margin-bottom: 18px; }
.ads-section-kicker { margin-bottom: 5px; color: #a75d45; font-size: 8px; }
.ads-section-heading h3, .ads-inventory-heading h3 { margin: 0; color: #234637; font: 600 23px/1.05 'Cormorant Garamond', serif; }
.ads-step-mark { display: grid; width: 31px; height: 31px; place-items: center; border: 1px solid #eedbd2; color: #a75d45; background: #fbf4f0; font: 700 9px 'Manrope', sans-serif; }
.ads-editor { display: grid; gap: 17px; }
.ads-form-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px 11px; }
.ads-field { display: grid; min-width: 0; gap: 6px; color: #54675c; font: 600 10px 'DM Sans', sans-serif; }
.ads-field > span:first-child { color: #50645a; }
.ads-field input, .ads-field select, .ads-field textarea { width: 100%; min-width: 0; min-height: 38px; padding: 9px 10px; border: 1px solid #dce5de; border-radius: 3px; color: #263f33; background: #fff; font: 11px 'DM Sans', sans-serif; transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease; }
.ads-field input::placeholder, .ads-field textarea::placeholder { color: #a0aaa2; }
.ads-field textarea { min-height: 72px; resize: vertical; line-height: 1.5; }
.ads-field input:focus, .ads-field select:focus, .ads-field textarea:focus { border-color: #54906b; outline: 0; background: #fcfefb; box-shadow: 0 0 0 3px rgba(67,128,95,.12); }
.ads-field-wide { grid-column: 1 / -1; }
.ads-upload-field { position: relative; }
.ads-upload-control { display: flex; min-height: 64px; align-items: center; gap: 12px; padding: 10px 13px; border: 1px dashed #a9bdaa; color: #315c43; background: #f5f8f3; cursor: pointer; transition: border-color 160ms ease, background 160ms ease, transform 160ms ease; }
.ads-upload-control:hover { transform: translateY(-1px); border-color: #668a6e; background: #eff5ec; }
.ads-upload-control > svg { width: 20px; height: 20px; flex: 0 0 auto; color: #b4664d; }
.ads-upload-control > span { display: grid; gap: 3px; }
.ads-upload-control strong { font: 700 10px 'Manrope', sans-serif; }
.ads-upload-control small { color: #7b897d; font: 9px 'DM Sans', sans-serif; }
.ads-upload-field.ads-upload-active .ads-upload-control { transform: translateY(-2px); border: 1px solid #43805f; color: #174f41; background: #eaf4e8; box-shadow: 0 0 0 4px rgba(67,128,95,.1); animation: ads-drop-pulse 850ms ease-in-out infinite alternate; }
.ads-upload-field.ads-upload-active .ads-upload-control strong { color: #174f41; }
.ads-upload-field.ads-upload-active .ads-upload-drop-icon { color: #34754e; animation: ads-drop-bounce 550ms ease-in-out infinite alternate; }
.ads-upload-field.ads-uploading .ads-upload-control { border-style: solid; border-color: #b8cbb8; background: #f1f7ef; }
.ads-upload-copy { min-width: 0; }
.ads-upload-copy strong { overflow-wrap: anywhere; }
.ads-upload-copy small span { padding: 0 3px; color: #b8694d; }
.ads-upload-spinner { color: #34754e !important; animation: ads-spin 800ms linear infinite; }
.ads-upload-progress { position: absolute; z-index: 2; right: 1px; bottom: 1px; left: 1px; height: 3px; overflow: hidden; background: #e3ebe1; pointer-events: none; }
.ads-upload-progress i { display: block; height: 100%; background: linear-gradient(90deg, #34754e, #8db778); transition: width 140ms ease-out; }
.ads-upload-field input[type='file'] { position: absolute; inset: 22px 0 0; width: 100%; min-height: 64px; padding: 0; opacity: 0; cursor: pointer; }
.ads-upload-field:focus-within .ads-upload-control { outline: 3px solid rgba(67,128,95,.18); outline-offset: 2px; }
.ads-image-preview { position: relative; display: grid; min-height: 82px; grid-template-columns: 108px minmax(0, 1fr) 32px; align-items: center; gap: 11px; padding: 7px; border: 1px solid #e1e9e1; background: #f9fbf8; }
.ads-image-preview img, .ads-image-preview video { width: 108px; height: 68px; object-fit: cover; background: #17211c; }
.ads-image-preview > div { display: grid; gap: 4px; }
.ads-image-preview > div span { color: #568062; font: 700 8px 'DM Sans', sans-serif; letter-spacing: .1em; }
.ads-image-preview > div strong { color: #3e5c47; font: 600 10px 'DM Sans', sans-serif; }
.ads-icon-button, .ads-refresh { display: grid; width: 32px; height: 32px; flex: 0 0 auto; place-items: center; border: 1px solid #dce5dd; border-radius: 3px; color: #496652; background: #fff; cursor: pointer; transition: color 150ms ease, border-color 150ms ease, background 150ms ease, transform 150ms ease; }
.ads-icon-button:hover, .ads-refresh:hover { transform: translateY(-1px); border-color: #aac0ad; color: #205b3b; background: #f3f8f2; }
.ads-icon-button svg, .ads-refresh svg { width: 15px; height: 15px; }
.ads-delete-button { color: #985642; }
.ads-delete-button:hover { border-color: #e6c3b8; color: #9d4936; background: #fff7f3; }
.ads-editor-footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px; border-top: 1px solid #e5ece5; }
.ads-save-action, .ads-cancel-action { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; gap: 7px; padding: 0 13px; border: 1px solid transparent; border-radius: 3px; cursor: pointer; font: 700 10px 'DM Sans', sans-serif; transition: transform 150ms ease, background 150ms ease, box-shadow 150ms ease; }
.ads-save-action { color: #fff; background: #23755c; box-shadow: 0 3px 9px rgba(35,117,92,.17); }
.ads-save-action:hover:not(:disabled) { transform: translateY(-1px); background: #174f41; box-shadow: 0 5px 13px rgba(35,117,92,.23); }
.ads-save-action:disabled { opacity: .65; cursor: wait; }
.ads-save-action svg { width: 15px; height: 15px; }
.ads-cancel-action { border-color: #dce5de; color: #66776a; background: #fff; }
.ads-cancel-action:hover { background: #f5f8f4; }
.ads-save-spinner { animation: ads-spin 900ms linear infinite; }
.ads-preview-panel { min-width: 0; padding: 15px 18px 16px; border: 1px solid #e1e8df; border-left: 3px solid #b8694d; background: #fbfcf8; animation: ads-section-in 300ms ease both; }
.ads-preview-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 2px; }
.ads-preview-heading .ads-section-kicker { margin-bottom: 4px; }
.ads-preview-heading h3 { margin: 0; color: #234637; font: 600 22px/1.05 'Cormorant Garamond', serif; }
.ads-preview-heading > span { max-width: 48%; padding: 5px 7px; color: #54715b; background: #f1f5ef; font: 600 8px/1.35 'DM Sans', sans-serif; text-align: right; }
.ads-preview-panel :deep(.ad-placement) { margin: 10px 0 0; }
.ads-preview-panel :deep(.ad-placement-item) { grid-template-columns: minmax(120px, 220px) minmax(0, 1fr); }
.ads-preview-panel :deep(.ad-placement-image) { min-height: 160px; }
.ads-preview-panel :deep(.ad-placement-copy) { gap: 7px; padding: 16px 20px; }
.ads-preview-panel :deep(.ad-placement-copy h2) { font-size: 22px; }
.ads-preview-panel :deep(.ad-placement-body) { font-size: 11px; }
.ads-preview-panel :deep(.ad-placement-link) { font-size: 10px; }
.ads-inventory { min-width: 0; animation: ads-section-in 440ms 140ms cubic-bezier(.2,.7,.2,1) both; }
.ads-inventory-heading { min-height: 49px; margin-bottom: 13px; }
.ads-inventory-heading h3 { display: flex; align-items: center; gap: 8px; }
.ads-inventory-heading h3 > span { display: inline-grid; min-width: 22px; height: 22px; place-items: center; padding: 0 5px; color: #5b715f; background: #edf3eb; font: 700 9px 'Manrope', sans-serif; }
.ads-inventory-labels { display: grid; grid-template-columns: minmax(0, 1fr) minmax(90px, 120px) 100px; gap: 12px; padding: 8px 0; border-top: 1px solid #dfe7df; border-bottom: 1px solid #dfe7df; color: #89938b; font: 700 8px 'DM Sans', sans-serif; letter-spacing: .1em; }
.ads-inventory-labels span:last-child { text-align: right; }
.ads-campaign-list { position: relative; display: grid; }
.ads-campaign-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(90px, 120px) 100px; align-items: center; gap: 12px; min-width: 0; padding: 14px 0; border-bottom: 1px solid #e8eee8; transition: background 150ms ease; animation: ads-row-in 340ms cubic-bezier(.2,.7,.2,1) both; animation-delay: calc(var(--row-index, 0) * 50ms); }
.ads-campaign-row:hover { background: linear-gradient(90deg, #f8faf6, rgba(248,250,246,0)); }
.ads-campaign-main { display: flex; min-width: 0; align-items: center; gap: 12px; }
.ads-campaign-image { display: grid; width: 74px; height: 62px; flex: 0 0 auto; overflow: hidden; place-items: center; color: #76907a; background: #eff3ec; }
.ads-campaign-image img, .ads-campaign-image video { width: 100%; height: 100%; object-fit: cover; background: #17211c; }
.ads-campaign-image img { transition: transform 250ms ease; }
.ads-campaign-row:hover .ads-campaign-image img { transform: scale(1.04); }
.ads-campaign-image svg { width: 20px; height: 20px; }
.ads-campaign-copy { min-width: 0; }
.ads-campaign-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; color: #78867c; font: 700 8px 'DM Sans', sans-serif; letter-spacing: .06em; text-transform: uppercase; }
.ads-status { display: inline-flex; align-items: center; gap: 5px; padding: 3px 6px; color: #64736a; background: #f0f2ed; letter-spacing: 0; }
.ads-status i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.ads-status-active { color: #2e704b; background: #edf5eb; }
.ads-status-paused { color: #98603c; background: #fbf1e7; }
.ads-campaign-copy h4 { overflow: hidden; margin: 5px 0 3px; color: #294b39; font: 700 12px 'Manrope', sans-serif; text-overflow: ellipsis; white-space: nowrap; }
.ads-campaign-copy p { display: -webkit-box; overflow: hidden; margin: 0; color: #6b786f; font: 10px/1.45 'DM Sans', sans-serif; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.ads-campaign-copy small { display: block; margin-top: 4px; color: #929b92; font: 8px 'DM Sans', sans-serif; }
.ads-placement-tag { justify-self: start; padding: 5px 7px; color: #54715b; background: #f1f5ef; font: 600 8px/1.35 'DM Sans', sans-serif; }
.ads-row-actions { display: flex; justify-content: flex-end; gap: 4px; }
.ads-empty-state { display: grid; min-height: 220px; justify-items: center; align-content: center; gap: 9px; padding: 25px; border-bottom: 1px solid #e8eee8; color: #758279; text-align: center; animation: ads-row-in 300ms ease both; }
.ads-empty-state > span:last-child { max-width: 265px; color: #89948b; font: 10px/1.55 'DM Sans', sans-serif; }
.ads-empty-state > strong { color: #385542; font: 600 18px 'Cormorant Garamond', serif; }
.ads-empty-icon { display: grid; width: 43px; height: 43px; margin-bottom: 3px; place-items: center; border: 1px solid #dce7da; color: #598166; background: #f1f6ef; }
.ads-empty-icon svg { width: 20px; height: 20px; }
.ads-state-spinner { width: 19px; height: 19px; color: #4f805d; animation: ads-spin 900ms linear infinite; }
.ads-empty-state > span:not(.ads-empty-icon) { font: 10px 'DM Sans', sans-serif; }
.ads-message-enter-active, .ads-message-leave-active, .ads-preview-enter-active, .ads-preview-leave-active, .ads-state-enter-active, .ads-state-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.ads-message-enter-from, .ads-message-leave-to, .ads-preview-enter-from, .ads-preview-leave-to, .ads-state-enter-from, .ads-state-leave-to { opacity: 0; transform: translateY(5px); }
.ads-row-enter-active, .ads-row-leave-active, .ads-row-move { transition: opacity 190ms ease, transform 190ms ease, background 150ms ease; }
.ads-row-enter-from, .ads-row-leave-to { opacity: 0; transform: translateY(8px); }
.ads-row-leave-active { position: absolute; width: 100%; }
@keyframes ads-page-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes ads-section-in { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ads-row-in { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ads-live-pulse { 0% { box-shadow: 0 0 0 0 rgba(167,216,151,.5); } 70% { box-shadow: 0 0 0 6px rgba(167,216,151,0); } 100% { box-shadow: 0 0 0 0 rgba(167,216,151,0); } }
@keyframes ads-drop-pulse { from { box-shadow: 0 0 0 3px rgba(67,128,95,.08); } to { box-shadow: 0 0 0 7px rgba(67,128,95,.15); } }
@keyframes ads-drop-bounce { from { transform: translateY(-2px); } to { transform: translateY(3px); } }
@keyframes ads-spin { to { transform: rotate(360deg); } }
@media (max-width: 1050px) {
  .ads-workspace { grid-template-columns: minmax(280px, .85fr) minmax(0, 1.15fr); gap: 22px; }
  .ads-editor-panel { padding-right: 16px; }
  .ads-inventory-labels, .ads-campaign-row { grid-template-columns: minmax(0, 1fr) 95px 96px; gap: 8px; }
  .ads-campaign-main { gap: 9px; }
  .ads-campaign-image { width: 58px; height: 52px; }
}
@media (max-width: 920px) {
  .ads-workspace { grid-template-columns: minmax(0, 1fr); gap: 25px; }
  .ads-editor-panel { padding: 0 0 22px; border-right: 0; border-bottom: 1px solid #e1e8e2; }
}
@media (max-width: 760px) {
  .ads-pricing-panel { align-items: flex-start; flex-direction: column; }
  .ads-refresh-panel { align-items: flex-start; flex-direction: column; }
  .ads-distribution-grid { grid-template-columns: minmax(0, 1fr); }
  .ads-pricing-form { width: 100%; }
  .ads-purchase-row { grid-template-columns: minmax(0,1fr) auto; }
  .ads-purchase-row > strong { grid-column: 1; }
  .ads-purchase-row .ads-order-status { grid-column: 2; grid-row: 1; }
  .ads-hero { min-height: 0; align-items: flex-start; flex-direction: column; gap: 21px; padding: 22px; }
  .ads-hero-stats { width: 100%; min-width: 0; }
  .ads-stat { padding-left: 12px; }
  .ads-stat:first-child { padding-left: 0; }
  .ads-stat-live i { right: 10px; }
  .ads-inventory-labels { grid-template-columns: minmax(0, 1fr) 92px 100px; }
  .ads-campaign-row { grid-template-columns: minmax(0, 1fr) 92px 100px; }
}
@media (max-width: 520px) {
  .ads-admin-view { gap: 17px; }
  .ads-hero { padding: 19px; }
  .ads-hero h2 { font-size: 32px; }
  .ads-hero-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ads-stat { min-height: 48px; gap: 6px; padding: 0 7px; }
  .ads-stat span { font-size: 8px; }
  .ads-stat strong { font-size: 20px; }
  .ads-stat-live i { right: 4px; }
  .ads-form-fields { grid-template-columns: minmax(0, 1fr); }
  .ads-field-wide { grid-column: auto; }
  .ads-inventory-labels { display: none; }
  .ads-campaign-row { grid-template-columns: minmax(0, 1fr) auto; gap: 7px 10px; padding: 13px 0; }
  .ads-campaign-main { grid-column: 1 / -1; }
  .ads-campaign-copy p { -webkit-line-clamp: 3; }
  .ads-placement-tag { grid-column: 1; grid-row: 2; }
  .ads-row-actions { grid-column: 2; grid-row: 2; }
  .ads-image-preview { grid-template-columns: 86px minmax(0, 1fr) 32px; }
  .ads-image-preview img, .ads-image-preview video { width: 86px; height: 58px; }
  .ads-preview-panel { padding: 13px; }
  .ads-preview-panel :deep(.ad-placement-item) { grid-template-columns: minmax(88px, 34%) minmax(0, 1fr); }
  .ads-preview-panel :deep(.ad-placement-image) { min-height: 130px; }
  .ads-preview-panel :deep(.ad-placement-copy) { padding: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .ads-admin-view, .ads-editor-panel, .ads-inventory, .ads-campaign-row, .ads-empty-state, .ads-stat-live i, .ads-save-spinner, .ads-state-spinner { animation: none !important; }
  .ads-message-enter-active, .ads-message-leave-active, .ads-preview-enter-active, .ads-preview-leave-active, .ads-state-enter-active, .ads-state-leave-active, .ads-row-enter-active, .ads-row-leave-active, .ads-row-move { transition: none !important; }
  .ads-upload-control:hover, .ads-save-action:hover:not(:disabled), .ads-icon-button:hover, .ads-refresh:hover, .ads-upload-field.ads-upload-active .ads-upload-control { transform: none; animation: none; }
  .ads-upload-field.ads-upload-active .ads-upload-drop-icon { animation: none; }
}
</style>