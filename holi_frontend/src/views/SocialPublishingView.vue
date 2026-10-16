<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ArrowTopRightOnSquareIcon, ArrowUpTrayIcon, CheckCircleIcon, ExclamationCircleIcon, LinkIcon, PaperAirplaneIcon, PhotoIcon, TrashIcon } from '@heroicons/vue/24/outline'
import {
  communityMediaSource,
  createMetaConnectUrl,
  deleteSocialSettings,
  getMetaAppSettings,
  getSocialSettings,
  publishCommunityPost,
  resetMetaAppSettings,
  saveMetaAppSettings,
  selectMetaPage,
  uploadCommunityMedia,
} from '../services/socialPublishingService'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const connection = ref(null)
const loading = ref(true)
const connecting = ref(false)
const savingApp = ref(false)
const appSettingsLoading = ref(false)
const appSettings = ref(null)
const appForm = reactive({ appId: '', appSecret: '', graphApiVersion: 'v23.0' })
const canReuseAppSecret = computed(() => Boolean(
  appSettings.value?.appSecretConfigured && appSettings.value?.appId === appForm.appId,
))
const metaAppConfigured = computed(() => Boolean(appSettings.value?.configured))
const hasSelectedOrganization = computed(() => auth.user?.role !== 'superadmin' || Boolean(auth.selectedOrganizationId))
const uploading = ref(false)
const publishing = ref(false)
const errorMessage = ref('')
const notice = ref('')
const publishResults = ref([])
const communityPostUrl = ref('')
const pages = computed(() => Array.isArray(connection.value?.pages) ? connection.value.pages : [])
const locations = computed(() => Array.isArray(connection.value?.locations) ? connection.value.locations : [])
const post = reactive({
  locationId: '',
  type: 'article',
  title: '',
  body: '',
  mediaUrl: '',
  mediaType: 'image',
  platforms: [],
})
const previewUrl = computed(() => communityMediaSource(post.mediaUrl))
let metaPopup = null
let popupCloseWatcher = null

function readError(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback
}

async function loadSettings() {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await getSocialSettings()
    connection.value = {
      ...data,
      metaAppConfigured: Boolean(data?.metaAppConfigured),
      selectedPageId: data?.selectedPageId || '',
      pages: Array.isArray(data?.pages) ? data.pages : [],
      locations: Array.isArray(data?.locations) ? data.locations : [],
      facebook: { configured: Boolean(data?.facebook?.configured) },
      instagram: { configured: Boolean(data?.instagram?.configured) },
    }
    if (!post.locationId) post.locationId = locations.value[0]?.id || ''
    return true
  } catch (error) {
    errorMessage.value = readError(error, 'No se pudo cargar la configuración de redes sociales.')
    return false
  } finally {
    loading.value = false
  }
}

async function loadMetaAppSettings() {
  appSettingsLoading.value = true
  try {
    appSettings.value = await getMetaAppSettings()
    appForm.appId = appSettings.value.appId || ''
    appForm.graphApiVersion = appSettings.value.graphApiVersion || 'v23.0'
    if (connection.value) connection.value.metaAppConfigured = appSettings.value.configured
  } catch (error) {
    errorMessage.value = readError(error, 'No se pudo cargar la configuración de Meta de esta congregación.')
  } finally {
    appSettingsLoading.value = false
  }
}

async function saveMetaApp() {
  savingApp.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    appSettings.value = await saveMetaAppSettings({ ...appForm })
    appForm.appSecret = ''
    if (connection.value) connection.value.metaAppConfigured = appSettings.value.configured
    await loadSettings()
    notice.value = 'La aplicación Meta quedó configurada de forma segura.'
  } catch (error) {
    errorMessage.value = readError(error, 'No se pudo guardar la aplicación Meta de esta congregación.')
  } finally {
    savingApp.value = false
  }
}

async function resetMetaApp() {
  if (!globalThis.confirm('¿Eliminar la aplicación Meta y desconectar las cuentas sociales de esta congregación?')) return
  savingApp.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    appSettings.value = await resetMetaAppSettings()
    appForm.appId = appSettings.value.appId || ''
    appForm.appSecret = ''
    appForm.graphApiVersion = appSettings.value.graphApiVersion || 'v23.0'
    if (connection.value) connection.value.metaAppConfigured = appSettings.value.configured
    notice.value = appSettings.value.configured
      ? 'Se eliminó la aplicación guardada; se usará la configuración disponible en el servidor.'
      : 'Se eliminó la aplicación Meta y se desconectaron las cuentas de esta congregación.'
    await loadSettings()
  } catch (error) {
    errorMessage.value = readError(error, 'No se pudo eliminar la configuración de Meta de esta congregación.')
  } finally {
    savingApp.value = false
  }
}

async function connectMeta() {
  errorMessage.value = ''
  notice.value = ''
  const popup = window.open('about:blank', 'holi-meta-connect', 'popup,width=640,height=760')
  if (!popup) {
    errorMessage.value = 'El navegador bloqueó la ventana emergente. Permite ventanas emergentes y vuelve a intentarlo.'
    return
  }
  metaPopup = popup
  connecting.value = true
  try {
    const authorizationUrl = await createMetaConnectUrl()
    const authorization = new URL(authorizationUrl)
    if (authorization.origin !== 'https://www.facebook.com') {
      throw new Error('La dirección de autorización de Meta no es válida.')
    }
    popup.location.href = authorization.toString()
    popupCloseWatcher = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(popupCloseWatcher)
        popupCloseWatcher = null
        metaPopup = null
        connecting.value = false
      }
    }, 500)
  } catch (error) {
    popup.close()
    metaPopup = null
    connecting.value = false
    errorMessage.value = readError(error, 'No se pudo guardar la configuración de Meta.')
  }
}

async function onMetaOAuthMessage(event) {
  const apiOrigin = new URL(import.meta.env.VITE_API_URL || 'http://localhost:3002/api').origin
  if (event.origin !== apiOrigin || event.source !== metaPopup || event.data?.type !== 'holi-meta-oauth') return
  if (popupCloseWatcher) window.clearInterval(popupCloseWatcher)
  popupCloseWatcher = null
  metaPopup = null
  connecting.value = false
  if (!event.data.success) {
    errorMessage.value = event.data.message || 'No se pudo completar la conexión con Meta.'
    return
  }
  try {
    if (await loadSettings()) {
      notice.value = `Conexión completada. Se encontraron ${event.data.pages?.length || 0} página(s) de Facebook.`
    }
  } catch (error) {
    errorMessage.value = readError(error, 'Meta se conectó, pero no se pudo actualizar la configuración.')
  }
}

async function changePage(event) {
  const pageId = event.target.value
  if (!pageId) return
  errorMessage.value = ''
  notice.value = ''
  try {
    connection.value = await selectMetaPage(pageId)
    notice.value = 'La página seleccionada se usará para las próximas publicaciones.'
  } catch (error) {
    errorMessage.value = readError(error, 'No se pudo seleccionar la página de Facebook.')
  }
}

async function disconnectMeta() {
  if (!globalThis.confirm('¿Eliminar las credenciales de Facebook e Instagram de esta congregación?')) return
  connecting.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    await deleteSocialSettings()
    await loadSettings()
    notice.value = 'Se eliminaron las credenciales de Meta.'
  } catch (error) {
    errorMessage.value = readError(error, 'No se pudieron eliminar las credenciales.')
  } finally {
    connecting.value = false
  }
}

async function selectMedia(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  uploading.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    const media = await uploadCommunityMedia(file)
    post.mediaUrl = media.mediaUrl
    post.mediaType = media.mediaType
    notice.value = 'El archivo se subió correctamente.'
  } catch (error) {
    errorMessage.value = readError(error, 'No se pudo subir el archivo.')
  } finally {
    uploading.value = false
  }
}

async function sharePost() {
  publishing.value = true
  errorMessage.value = ''
  notice.value = ''
  publishResults.value = []
  communityPostUrl.value = ''
  try {
    const result = await publishCommunityPost({ ...post })
    publishResults.value = result.results
    communityPostUrl.value = result.communityUrl || ''
    const failed = result.results.filter((item) => !item.success)
    if (failed.length) {
      errorMessage.value = 'La publicación quedó visible en la comunidad, pero una o más redes no pudieron recibirla.'
    } else {
      notice.value = result.results.length
        ? 'El contenido se publicó en la comunidad y en las redes seleccionadas.'
        : 'El contenido se publicó en la comunidad.'
    }
    post.title = ''
    post.body = ''
    post.type = 'article'
    post.mediaUrl = ''
    post.mediaType = 'image'
    post.platforms = []
  } catch (error) {
    errorMessage.value = readError(error, 'No se pudo publicar el contenido.')
  } finally {
    publishing.value = false
  }
}

onMounted(() => {
  window.addEventListener('message', onMetaOAuthMessage)
  loadMetaAppSettings()
  loadSettings()
})

watch(() => auth.selectedOrganizationId, () => {
  if (auth.user?.role !== 'superadmin') return
  loadMetaAppSettings()
  loadSettings()
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMetaOAuthMessage)
  if (popupCloseWatcher) window.clearInterval(popupCloseWatcher)
  if (metaPopup && !metaPopup.closed) metaPopup.close()
})
</script>

<template>
  <div class="social-publishing-page">
    <header class="social-page-heading">
      <div>
        <p class="social-eyebrow">COMUNICACIÓN DE LA CONGREGACIÓN</p>
        <h1>Contenido y redes sociales</h1>
        <p>Sube fotos o videos, publícalos en la comunidad y compártelos en Facebook e Instagram.</p>
      </div>
      <LinkIcon aria-hidden="true" />
    </header>

    <div v-if="errorMessage" class="social-alert social-alert-error" role="alert">
      <ExclamationCircleIcon aria-hidden="true" /><span>{{ errorMessage }}</span>
    </div>
    <div v-if="notice" class="social-alert social-alert-success" role="status">
      <CheckCircleIcon aria-hidden="true" /><span>{{ notice }}</span>
    </div>
    <p v-if="communityPostUrl" class="social-publication-link">
      <a :href="communityPostUrl" target="_blank" rel="noopener noreferrer">Ver publicación en la comunidad</a>
    </p>
    <div v-if="publishResults.length" class="social-results" aria-live="polite">
      <p v-for="result in publishResults" :key="result.platform" :class="{ 'result-failed': !result.success }">
        <strong>{{ result.platform === 'facebook' ? 'Facebook' : 'Instagram' }}:</strong>
        {{ result.success ? `publicado${result.postId ? ` (ID ${result.postId})` : ''}` : result.message }}
        <a v-if="result.success && result.permalinkUrl" :href="result.permalinkUrl" target="_blank" rel="noopener noreferrer">Ver publicación</a>
        <span v-if="result.linkError"> {{ result.linkError }}</span>
      </p>
    </div>

    <section v-if="loading" class="social-card" role="status">Cargando configuración…</section>
    <template v-else>
      <section class="social-card">
        <div class="social-card-heading">
          <div><p class="social-eyebrow">CONFIGURACIÓN DE ESTA CONGREGACIÓN</p><h2>Aplicación Meta</h2></div>
          <span class="social-connection-state" :class="{ connected: appSettings?.configured }">
            {{ appSettingsLoading ? 'Cargando…' : appSettings?.configured ? 'Configurada' : 'Pendiente' }}
          </span>
        </div>
        <p class="social-help">
          Configura la aplicación de Meta for Developers que usará esta congregación. El App Secret se cifra en el servidor y nunca se vuelve a mostrar. Las demás congregaciones mantienen su propia aplicación y cuentas. El servidor debe tener definida una clave SOCIAL_CREDENTIALS_ENCRYPTION_KEY para guardar secretos.
        </p>
        <div class="social-settings-actions social-developer-links">
          <a class="social-button social-button-muted" href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer">
            Meta for Developers <ArrowTopRightOnSquareIcon aria-hidden="true" />
          </a>
          <a class="social-button social-button-muted" href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">
            Mis aplicaciones de Meta <ArrowTopRightOnSquareIcon aria-hidden="true" />
          </a>
        </div>
        <div v-if="!hasSelectedOrganization" class="social-alert social-alert-error" role="alert">
          <ExclamationCircleIcon aria-hidden="true" /><span>Selecciona una congregación antes de administrar su aplicación Meta.</span>
        </div>
        <form class="social-settings-form" @submit.prevent="saveMetaApp">
          <label><span>Meta App ID</span><input v-model.trim="appForm.appId" inputmode="numeric" autocomplete="off" required pattern="[0-9]+" placeholder="ID numérico de Meta for Developers" /></label>
          <label><span>Graph API version</span><input v-model.trim="appForm.graphApiVersion" required pattern="v[0-9]+[.][0-9]+" placeholder="v23.0" /></label>
          <label class="social-field-wide"><span>Meta App Secret</span><input v-model.trim="appForm.appSecret" type="password" autocomplete="new-password" :placeholder="canReuseAppSecret ? 'Secreto guardado; deja vacío para conservarlo' : 'Secreto de la aplicación'" :required="!canReuseAppSecret" /></label>
          <div class="social-settings-actions">
            <button class="social-button social-button-primary" type="submit" :disabled="savingApp || appSettingsLoading || !hasSelectedOrganization">
              {{ savingApp ? 'Guardando…' : 'Guardar aplicación Meta' }}
            </button>
            <button v-if="appSettings?.source === 'organization'" class="social-button social-button-muted" type="button" :disabled="savingApp" @click="resetMetaApp">
              <TrashIcon aria-hidden="true" /> Eliminar aplicación y cuentas de esta congregación
            </button>
          </div>
        </form>
      </section>

      <section class="social-card">
        <div class="social-card-heading">
          <div><p class="social-eyebrow">CONECTAR CUENTAS</p><h2>Configuración de Meta</h2></div>
          <span class="social-connection-state" :class="{ connected: connection?.facebook.configured || connection?.instagram.configured }">
            {{ connection?.facebook.configured || connection?.instagram.configured ? 'Conectada' : 'Pendiente' }}
          </span>
        </div>
        <p class="social-help">
          Autoriza la aplicación con tu cuenta de Facebook. Meta mostrará las páginas que puedes administrar; los tokens se guardan cifrados en el servidor y nunca se exponen en el navegador.
        </p>
        <div v-if="!metaAppConfigured" class="social-alert social-alert-error" role="alert">
          <ExclamationCircleIcon aria-hidden="true" />
          <span>Configura el Meta App ID y el App Secret propios de esta congregación en la sección Aplicación Meta de esta página.</span>
        </div>
        <div class="social-account-status">
          <span :class="{ ready: connection?.facebook.configured }"><CheckCircleIcon aria-hidden="true" /> Facebook Page {{ connection?.facebook.configured ? 'lista' : 'sin configurar' }}</span>
          <span :class="{ ready: connection?.instagram.configured }"><CheckCircleIcon aria-hidden="true" /> Instagram {{ connection?.instagram.configured ? 'listo' : 'sin configurar' }}</span>
        </div>
        <div v-if="pages.length > 1" class="social-settings-form">
          <label class="social-field-wide"><span>Página de Facebook</span>
            <select :value="connection.selectedPageId" @change="changePage">
              <option v-for="page in pages" :key="page.id" :value="page.id">{{ page.name }}{{ page.hasInstagram ? ` · Instagram ${page.instagramUsername ? `@${page.instagramUsername}` : 'conectado'}` : '' }}</option>
            </select>
          </label>
        </div>
        <div class="social-settings-actions">
          <button class="social-button social-button-primary" type="button" :disabled="connecting || !connection?.metaAppConfigured" @click="connectMeta">
            <LinkIcon aria-hidden="true" /> {{ connecting ? 'Conectando…' : connection?.facebook.configured ? 'Conectar otra cuenta' : 'Conectar con Facebook' }}
          </button>
          <button v-if="connection?.facebook.configured || connection?.instagram.configured" class="social-button social-button-muted" type="button" :disabled="connecting" @click="disconnectMeta">
              <TrashIcon aria-hidden="true" /> Desconectar Meta
          </button>
        </div>
      </section>

      <section class="social-card">
        <div class="social-card-heading">
          <div><p class="social-eyebrow">NUEVA PUBLICACIÓN</p><h2>Comparte una historia</h2></div>
          <PhotoIcon aria-hidden="true" />
        </div>
        <form class="social-post-form" @submit.prevent="sharePost">
          <label><span>Sede o congregación</span>
            <select v-model="post.locationId" required>
              <option value="" disabled>Selecciona una sede</option>
              <option v-for="location in locations" :key="location.id" :value="location.id">{{ location.name }}</option>
            </select>
          </label>
          <label><span>Tipo de contenido</span>
            <select v-model="post.type" required>
              <option value="article">Blog / historia</option>
              <option value="activity">Actividad</option>
            </select>
          </label>
          <label><span>Título</span><input v-model.trim="post.title" maxlength="255" required placeholder="Título de la publicación" /></label>
          <label class="social-field-wide"><span>Texto</span><textarea v-model.trim="post.body" maxlength="5000" rows="4" placeholder="Escribe un mensaje para tu comunidad y redes sociales." /></label>
          <label class="social-upload-field">
            <span>Foto o video</span>
            <span class="social-upload-control">
              <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" :disabled="uploading" @change="selectMedia" />
              <span><ArrowUpTrayIcon aria-hidden="true" /> {{ uploading ? 'Subiendo…' : post.mediaUrl ? 'Cambiar archivo' : 'Seleccionar archivo' }}</span>
            </span>
            <small>JPG, PNG, WebP, MP4 o WebM. Imágenes hasta 10 MB; videos hasta 100 MB.</small>
          </label>
          <div v-if="previewUrl" class="social-media-preview">
            <video v-if="post.mediaType === 'video'" :src="previewUrl" controls playsinline />
            <img v-else :src="previewUrl" alt="Vista previa del archivo seleccionado" />
            <button type="button" class="social-remove-media" @click="post.mediaUrl = ''; post.mediaType = 'image'">Quitar archivo</button>
          </div>
          <fieldset class="social-platforms">
            <legend>Compartir también en</legend>
            <label><input v-model="post.platforms" type="checkbox" value="facebook" /> Facebook</label>
            <label><input v-model="post.platforms" type="checkbox" value="instagram" /> Instagram</label>
            <small>Instagram requiere una foto o video y una cuenta profesional vinculada a la página de Facebook.</small>
          </fieldset>
          <div class="social-post-actions">
            <span v-if="!locations.length" class="social-help">La congregación todavía no tiene sedes para publicar.</span>
            <button class="social-button social-button-primary" type="submit" :disabled="publishing || uploading || !locations.length">
              <PaperAirplaneIcon aria-hidden="true" /> {{ publishing ? 'Publicando…' : 'Publicar y compartir' }}
            </button>
          </div>
        </form>
      </section>
    </template>
  </div>
</template>

<style scoped>
.social-publishing-page { display: grid; gap: 22px; max-width: 980px; margin: 0 auto; color: #20392f; }
.social-page-heading, .social-card-heading { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.social-page-heading > svg, .social-card-heading > svg { width: 30px; height: 30px; color: #587968; flex: 0 0 auto; }
.social-page-heading h1, .social-card-heading h2 { margin: 4px 0 8px; color: #20392f; }
.social-page-heading > div > p:last-child, .social-help { color: #64756b; line-height: 1.6; }
.social-eyebrow { margin: 0; color: #668371; font-size: 11px; font-weight: 800; letter-spacing: .12em; }
.social-card { padding: 24px; border: 1px solid #e4e9e3; border-radius: 18px; background: #fff; box-shadow: 0 8px 24px #20392f0a; }
.social-card-heading { margin-bottom: 12px; }
.social-card-heading h2 { font-size: 20px; }
.social-connection-state { padding: 7px 11px; border-radius: 30px; background: #f2f1eb; color: #795e37; font-size: 12px; font-weight: 700; }
.social-connection-state.connected { background: #e9f4ec; color: #28603e; }
.social-account-status { display: flex; flex-wrap: wrap; gap: 10px 18px; margin: 16px 0; color: #7b7060; font-size: 13px; }
.social-account-status span { display: inline-flex; align-items: center; gap: 5px; }
.social-account-status svg { width: 16px; height: 16px; }
.social-account-status .ready { color: #28603e; }
.social-settings-form, .social-post-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.social-settings-form label, .social-post-form > label { display: grid; align-content: start; gap: 7px; color: #405449; font-size: 13px; font-weight: 700; }
.social-settings-form input, .social-post-form input:not([type=file]), .social-post-form select, .social-post-form textarea { width: 100%; min-height: 42px; padding: 10px 12px; border: 1px solid #d8e0d9; border-radius: 9px; background: #fff; color: #20392f; font: inherit; font-weight: 400; }
.social-settings-form input:focus, .social-post-form input:focus, .social-post-form select:focus, .social-post-form textarea:focus { outline: 2px solid #8caf98; outline-offset: 1px; }
.social-field-wide { grid-column: 1 / -1; }
.social-settings-actions, .social-post-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 3px; }
.social-button { display: inline-flex; min-height: 42px; align-items: center; justify-content: center; gap: 8px; padding: 10px 15px; border: 0; border-radius: 9px; cursor: pointer; font: inherit; font-size: 13px; font-weight: 700; }
.social-button svg { width: 17px; height: 17px; }
.social-button:disabled { cursor: wait; opacity: .65; }
.social-button-primary { background: #214f3d; color: #fff; }
.social-button-muted { background: #f3f4f0; color: #465b4d; }
.social-upload-control { position: relative; overflow: hidden; min-height: 42px; border: 1px dashed #aebeb2; border-radius: 9px; background: #fafbf8; }
.social-upload-control input { position: absolute; inset: 0; width: 100%; height: 100%; cursor: pointer; opacity: 0; }
.social-upload-control > span { display: flex; min-height: 42px; align-items: center; gap: 8px; padding: 9px 12px; color: #345d43; }
.social-upload-control svg { width: 18px; height: 18px; }
.social-upload-field small, .social-platforms small { color: #748177; font-size: 12px; font-weight: 400; line-height: 1.5; }
.social-media-preview { grid-column: 1 / -1; position: relative; overflow: hidden; max-width: 480px; border-radius: 12px; background: #f4f5f1; }
.social-media-preview img, .social-media-preview video { display: block; width: 100%; max-height: 360px; object-fit: contain; }
.social-remove-media { position: absolute; right: 9px; bottom: 9px; padding: 7px 10px; border: 0; border-radius: 7px; background: #fff; color: #7a372b; cursor: pointer; font: inherit; font-size: 12px; }
.social-platforms { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 12px 20px; padding: 13px 15px; border: 1px solid #e2e8e1; border-radius: 10px; }
.social-platforms legend { padding: 0 6px; color: #405449; font-size: 13px; font-weight: 700; }
.social-platforms label { display: inline-flex; align-items: center; gap: 7px; color: #304b3b; font-size: 13px; }
.social-platforms input { accent-color: #214f3d; }
.social-platforms small { flex-basis: 100%; }
.social-alert { display: flex; align-items: flex-start; gap: 9px; padding: 12px 14px; border-radius: 10px; font-size: 13px; line-height: 1.5; }
.social-alert svg { width: 18px; height: 18px; flex: 0 0 auto; }
.social-alert-error { background: #fff0ed; color: #8f3e31; }
.social-alert-success { background: #edf7ef; color: #28603e; }
.social-results { padding: 10px 14px; border: 1px solid #e4e9e3; border-radius: 10px; background: #fff; font-size: 13px; }
.social-results p { margin: 4px 0; color: #28603e; }
.social-results .result-failed { color: #8f3e31; }
.social-results a, .social-publication-link a { margin-left: 8px; color: #28603e; font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
.social-publication-link { margin: -12px 0 0; font-size: 13px; }
@media (max-width: 640px) {
  .social-card { padding: 18px; }
  .social-settings-form, .social-post-form { grid-template-columns: minmax(0, 1fr); }
  .social-field-wide, .social-settings-actions, .social-post-actions, .social-media-preview, .social-platforms { grid-column: 1; }
  .social-page-heading { align-items: flex-start; }
}
</style>
