<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  ArrowRightIcon,
  BookOpenIcon,
  BuildingLibraryIcon,
  CalendarDaysIcon,
  ClockIcon,
  GlobeAltIcon,
  HeartIcon,
  MapPinIcon,
  SparklesIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { getPublicCommunity } from '../services/communityService'
import { getBrowserCoordinates } from '../modules/locationFilters'
import { useAuthStore } from '../stores/auth'
import { useAppearanceStore } from '../stores/appearance'

const auth = useAuthStore()
const appearance = useAppearanceStore()
const community = ref({ congregations: [], events: [], posts: [], moduleUpdates: [] })
const loading = ref(true)
const errorMessage = ref('')
const selectedCongregation = ref('all')
const publicationType = ref('all')
const selectedPost = ref(null)
const postDialog = ref(null)
const publicMapElement = ref(null)
const selectedLocationId = ref('')
const selectedCommunityArea = ref('all')
const publicScrollZoom = ref(false)
let publicMap
let publicMarkerLayer
const publicMarkers = new Map()
const managementRoute = computed(() => auth.user ? { name: 'dashboard' } : { name: 'login' })
const managementLabel = computed(() => auth.user ? 'Panel de gestión' : 'Iniciar sesión')
const brandIcons = { church: BuildingLibraryIcon, book: BookOpenIcon, heart: HeartIcon, community: GlobeAltIcon, light: SparklesIcon }
const appearanceStyle = computed(() => ({
  '--community-forest': appearance.settings.colors.primary,
  '--community-primary': appearance.settings.colors.primary,
  '--community-accent': appearance.settings.colors.accent,
  '--community-moss': appearance.settings.colors.primary,
  '--community-terracotta': appearance.settings.colors.accent,
  '--community-gold': appearance.settings.colors.accent,
  '--community-paper': appearance.settings.colors.background,
  '--community-ink': appearance.settings.colors.text,
}))

const visibleEvents = computed(() => community.value.events.filter((event) => (
  selectedCongregation.value === 'all' || event.locationId === selectedCongregation.value
)))
const selectedCongregationDetail = computed(() => {
  if (selectedCongregation.value === 'all') return null
  return community.value.congregations.find(({ id }) => id === selectedCongregation.value) || null
})
const selectedCongregationEventList = computed(() => {
  if (!selectedCongregationDetail.value) return []
  return community.value.events
    .filter((event) => event.locationId === selectedCongregationDetail.value.id)
    .sort((first, second) => new Date(first.startsAt) - new Date(second.startsAt))
})
const selectedCongregationPostList = computed(() => {
  if (!selectedCongregationDetail.value) return []
  return community.value.posts
    .filter((post) => post.locationId === selectedCongregationDetail.value.id)
    .sort((first, second) => new Date(second.publishedAt) - new Date(first.publishedAt))
})
const congregationCards = computed(() => community.value.congregations.map((congregation) => ({
  ...congregation,
  eventCount: community.value.events.filter((event) => event.locationId === congregation.id).length,
  postCount: community.value.posts.filter((post) => post.locationId === congregation.id).length,
  updateCount: community.value.moduleUpdates.filter((update) => update.organizationId === congregation.organizationId).length,
})))
const visiblePosts = computed(() => community.value.posts.filter((post) => (
  (selectedCongregation.value === 'all' || post.locationId === selectedCongregation.value)
  && (publicationType.value === 'all' || post.type === publicationType.value)
)))
const selectedOrganizationId = computed(() => community.value.congregations
  .find(({ id }) => id === selectedCongregation.value)?.organizationId)
const visibleModuleUpdates = computed(() => community.value.moduleUpdates.filter((update) => (
  selectedCongregation.value === 'all' || update.organizationId === selectedOrganizationId.value
)))
const groupItemsByOrganization = (items = []) => {
  const grouped = new Map()
  for (const item of items) {
    const organizationName = item.congregation || item.name || 'Congregación sin nombre'
    if (!grouped.has(organizationName)) {
      grouped.set(organizationName, { name: organizationName, items: [] })
    }
    grouped.get(organizationName).items.push(item)
  }

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((first, second) => {
        const firstDate = new Date(first.date || first.publishedAt || first.startsAt || first.recordDate || 0).getTime()
        const secondDate = new Date(second.date || second.publishedAt || second.startsAt || second.recordDate || 0).getTime()
        return secondDate - firstDate
      }),
    }))
    .sort((first, second) => first.name.localeCompare(second.name, 'es-MX'))
}

const communityAreaSections = computed(() => {
  const updateSections = ['groups', 'attendance', 'resources', 'communications', 'reports', 'settings'].map((moduleId) => ({
    id: moduleId,
    label: moduleUpdateLabel(moduleId),
    items: visibleModuleUpdates.value.filter((update) => update.moduleId === moduleId).map((update) => ({
      ...update,
      date: update.recordDate,
    })),
  }))
  return [
    {
      id: 'events',
      label: 'Encuentros',
      items: visibleEvents.value.map((event) => ({
        ...event,
        description: event.description,
        detail: `${event.attendeeCount} ${event.attendeeCount === 1 ? 'persona inscrita' : 'personas inscritas'}`,
        date: event.startsAt,
      })),
    },
    ...updateSections,
    {
      id: 'posts',
      label: 'Publicaciones',
      items: visiblePosts.value.map((post) => ({
        ...post,
        description: post.excerpt,
        date: post.publishedAt,
      })),
    },
    {
      id: 'locations',
      label: 'Sedes',
      items: mapLocations.value.map((location) => ({
        ...location,
        title: location.name,
        description: [location.address, location.city].filter(Boolean).join(' · '),
        congregation: location.name,
        locationId: location.id,
      })),
    },
  ].map((section) => ({
    ...section,
    count: section.items.length,
    organizationGroups: groupItemsByOrganization(section.items),
  }))
})
const communityAreas = computed(() => [
  { id: 'all', label: 'Todo el tablero', count: communityAreaSections.value.reduce((total, section) => total + section.count, 0) },
  ...communityAreaSections.value.map(({ id, label, count }) => ({ id, label, count })),
])
const visibleCommunityAreaSections = computed(() => communityAreaSections.value
  .filter(({ id, count }) => count && (selectedCommunityArea.value === 'all' || id === selectedCommunityArea.value)))
const mapLocations = computed(() => community.value.congregations.filter((location) => (
  selectedCongregation.value === 'all' || location.id === selectedCongregation.value
)))
const eventGroups = computed(() => {
  const grouped = new Map()
  for (const event of visibleEvents.value) {
    if (!grouped.has(event.locationId)) {
      const congregation = community.value.congregations.find(({ id }) => id === event.locationId)
      grouped.set(event.locationId, {
        id: event.locationId,
        name: event.congregation,
        city: event.city,
        address: event.address,
        latitude: congregation?.latitude ?? event.latitude,
        longitude: congregation?.longitude ?? event.longitude,
        events: [],
      })
    }
    grouped.get(event.locationId).events.push(event)
  }
  return [...grouped.values()]
    .map((group) => ({ ...group, events: group.events.sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt)) }))
    .sort((first, second) => Date.parse(first.events[0]?.startsAt || 0) - Date.parse(second.events[0]?.startsAt || 0)
      || first.name.localeCompare(second.name, 'es-MX'))
})
const congregationGroups = computed(() => mapLocations.value
  .map((location) => ({
    id: location.id,
    name: location.name,
    city: location.city,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    events: visibleEvents.value.filter(({ locationId }) => locationId === location.id)
      .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt)),
  }))
  .sort((first, second) => first.name.localeCompare(second.name, 'es-MX')))
const visibleLocationGroups = computed(() => eventGroups.value.length ? eventGroups.value : congregationGroups.value)
const selectedLocation = computed(() => community.value.congregations.find(({ id }) => id === selectedLocationId.value))
const selectedLocationEvents = computed(() => community.value.events
  .filter(({ locationId }) => locationId === selectedLocationId.value)
  .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt)))
const eventCountLabel = computed(() => `${visibleEvents.value.length} ${visibleEvents.value.length === 1 ? 'próximo encuentro' : 'próximos encuentros'}`)

function formatDate(value, options = {}) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    ...options,
  }).format(new Date(value))
}

function formatEventDate(value) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value))
}

function formatMonth(value) {
  return new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(new Date(value)).replace('.', '')
}

function formatEventTime(value) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function moduleUpdateLabel(moduleId) {
  return ({
    groups: 'Grupos',
    attendance: 'Asistencia',
    resources: 'Recursos',
    communications: 'Comunicaciones',
    reports: 'Reportes',
    settings: 'Preferencias',
  })[moduleId] || 'Actualización'
}

async function loadCommunity() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await getPublicCommunity()
    community.value = {
      congregations: [],
      events: [],
      posts: [],
      moduleUpdates: [],
      ...response,
      moduleUpdates: response.moduleUpdates || [],
    }
    if (!selectedLocationId.value) {
      selectedLocationId.value = community.value.events[0]?.locationId || community.value.congregations[0]?.id || ''
    }
    if (selectedCongregation.value !== 'all' && !community.value.congregations.some(({ id }) => id === selectedCongregation.value)) {
      selectedCongregation.value = 'all'
    }
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || 'No pudimos cargar la agenda comunitaria.'
  } finally {
    loading.value = false
    await nextTick()
    renderPublicMap()
  }
}

function createLocationPopup(location) {
  const popup = document.createElement('div')
  popup.className = 'community-map-popup'
  const title = document.createElement('strong')
  title.textContent = location.name
  const address = document.createElement('span')
  address.className = 'community-map-popup-address'
  address.textContent = [location.address, location.city].filter(Boolean).join(' · ') || 'Dirección no disponible'
  const activityCount = document.createElement('small')
  const locationEvents = community.value.events
    .filter(({ locationId }) => locationId === location.id)
    .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt))
  const count = locationEvents.length
  activityCount.textContent = `${count} ${count === 1 ? 'próxima actividad' : 'próximas actividades'}`
  popup.append(title, address, activityCount)

  if (locationEvents[0]) {
    const nextEvent = document.createElement('span')
    nextEvent.className = 'community-map-popup-next'
    nextEvent.textContent = `Próxima: ${locationEvents[0].title} · ${formatEventDate(locationEvents[0].startsAt)}`
    popup.append(nextEvent)
  }

  const directions = document.createElement('a')
  directions.className = 'community-map-popup-directions'
  directions.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`
  directions.target = '_blank'
  directions.rel = 'noopener noreferrer'
  directions.textContent = 'Cómo llegar'
  directions.setAttribute('aria-label', `Indicaciones para llegar a ${location.name}`)
  popup.append(directions)
  return popup
}

function renderPublicMap() {
  if (!publicMapElement.value) return
  const locations = mapLocations.value.filter(({ latitude, longitude }) => (
    Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
      && Number(latitude) >= -90 && Number(latitude) <= 90
      && Number(longitude) >= -180 && Number(longitude) <= 180
  ))
  const first = locations[0] || { latitude: 19.4326, longitude: -99.1332 }
  if (!publicMap) {
    publicMap = L.map(publicMapElement.value, { scrollWheelZoom: publicScrollZoom.value }).setView([first.latitude, first.longitude], locations.length ? 11 : 5)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(publicMap)
    publicMarkerLayer = L.layerGroup().addTo(publicMap)
  }

  publicMarkerLayer.clearLayers()
  publicMarkers.clear()
  locations.forEach((location) => {
    const marker = L.circleMarker([location.latitude, location.longitude], {
      radius: location.id === selectedLocationId.value ? 10 : 8,
      color: '#ffffff',
      weight: 3,
      fillColor: location.id === selectedLocationId.value ? '#c35f46' : '#28755b',
      fillOpacity: 1,
    }).addTo(publicMarkerLayer)
    marker.bindTooltip(location.name, {
      permanent: true,
      direction: 'top',
      offset: [0, -9],
      className: 'community-marker-label',
    })
    marker.bindPopup(createLocationPopup(location))
    marker.on('click', () => {
      selectLocation(location.id)
      marker.openPopup()
    })
    marker.on('popupopen', () => selectLocation(location.id, false))
    publicMarkers.set(location.id, marker)
  })

  if (locations.length > 1) {
    publicMap.fitBounds(locations.map(({ latitude, longitude }) => [Number(latitude), Number(longitude)]), { padding: [34, 34], maxZoom: 14 })
  } else if (locations.length === 1) {
    publicMap.setView([Number(first.latitude), Number(first.longitude)], 13)
  }
  publicMap.invalidateSize()
  if (publicScrollZoom.value) publicMap.scrollWheelZoom.enable()
  else publicMap.scrollWheelZoom.disable()
}

function selectLocation(locationId, focusMap = true) {
  selectedLocationId.value = locationId
  publicMarkers.forEach((marker, id) => marker.setStyle({
    fillColor: id === locationId ? '#c35f46' : '#28755b',
    radius: id === locationId ? 10 : 8,
  }))
  const location = community.value.congregations.find(({ id }) => id === locationId)
  if (focusMap && location && publicMap && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))) {
    publicMap.flyTo([location.latitude, location.longitude], Math.max(publicMap.getZoom(), 13), { duration: 0.45 })
  }
}

async function focusPublicMapOnSelection() {
  const location = community.value.congregations.find(({ id }) => id === selectedLocationId.value)
  if (!publicMap || !location) return

  const latitude = Number(location.latitude)
  const longitude = Number(location.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

  try {
    const userLocation = await getBrowserCoordinates(globalThis.navigator?.geolocation)
    const bounds = L.latLngBounds(
      [[userLocation.lat, userLocation.lng], [latitude, longitude]],
    ).pad(0.35)
    publicMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 13 })
  } catch {
    publicMap.flyTo([latitude, longitude], Math.max(publicMap.getZoom(), 12), { duration: 0.4 })
  }
}

function onCongregationChange() {
  const visibleLocationIds = new Set(mapLocations.value.map(({ id }) => id))
  if (selectedCongregation.value !== 'all') {
    selectLocation(selectedCongregation.value, false)
  } else if (!visibleLocationIds.has(selectedLocationId.value)) {
    selectedLocationId.value = community.value.events[0]?.locationId || community.value.congregations[0]?.id || ''
  }
  nextTick(renderPublicMap)
}

function togglePublicScrollZoom() {
  publicScrollZoom.value = !publicScrollZoom.value
  if (!publicMap) return
  if (publicScrollZoom.value) publicMap.scrollWheelZoom.enable()
  else publicMap.scrollWheelZoom.disable()
}

async function openPost(post) {
  selectedPost.value = post
  await nextTick()
  postDialog.value?.showModal()
}

function closePost() {
  postDialog.value?.close()
  selectedPost.value = null
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  loadCommunity()
  auth.checkSession()
})
onBeforeUnmount(() => publicMap?.remove())
</script>

<template>
  <div id="top" class="community-page" :class="`community-mode-${appearance.settings.communityMode}`" :style="appearanceStyle">
    <header class="community-nav">
      <RouterLink class="community-brand" :to="{ name: 'home' }" aria-label="Holi Places, inicio">
        <span class="community-brand-mark"><component :is="brandIcons[appearance.settings.brandIcon] || BuildingLibraryIcon" aria-hidden="true" /></span>
        <span>{{ appearance.settings.brandName }}</span>
      </RouterLink>
      <nav class="community-nav-links" aria-label="Navegación pública">
        <a href="#agenda">Próximos encuentros</a>
        <a href="#aportes">Aportes</a>
        <a href="#historias">Blog y actividades</a>
      </nav>
      <RouterLink class="community-admin-link" :to="managementRoute" :aria-label="managementLabel">
        {{ managementLabel }} <ArrowRightIcon aria-hidden="true" />
      </RouterLink>
      <RouterLink class="community-register-link" :to="{ name: 'register' }" aria-label="Registrar una congregación" title="Registrar una congregación">Registrar congregación</RouterLink>
    </header>

    <main class="community-main">
      <section class="community-hero">
        <div class="community-hero-copy">
          <p class="community-eyebrow"><GlobeAltIcon aria-hidden="true" /> COMUNIDAD ABIERTA</p>
          <h1>La vida de nuestras congregaciones.</h1>
          <p class="community-lead">Encuentros, historias y actividades para compartir. Conoce lo que sucede cerca de ti y encuentra un espacio para participar.</p>
          <a class="community-hero-cta" href="#agenda">Explorar la agenda <ArrowRightIcon aria-hidden="true" /></a>
          <div class="community-hero-counts" aria-label="Resumen de la comunidad">
            <span><strong>{{ community.congregations.length }}</strong> congregaciones</span>
            <span><strong>{{ community.events.length }}</strong> encuentros próximos</span>
          </div>
        </div>
        <div class="community-hero-image">
          <img src="https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1500&q=88" alt="Personas reunidas en una actividad comunitaria" fetchpriority="high" />
          <span class="community-image-caption"><UsersIcon aria-hidden="true" /> Un lugar en la mesa para cada persona</span>
        </div>
      </section>

      <section class="community-section community-layer-summary-section" aria-label="Capas de la comunidad">
        <div class="community-layer-summary">
          <article class="community-layer-card">
            <span class="community-layer-index">1</span>
            <div>
              <p class="community-eyebrow">CAPA GEOGRÁFICA</p>
              <h3>Mapa + sedes + agenda</h3>
              <p>Localiza cada congregación y descubre los próximos encuentros activos.</p>
            </div>
          </article>
          <article class="community-layer-card">
            <span class="community-layer-index">2</span>
            <div>
              <p class="community-eyebrow">CAPA ORGANIZACIONAL</p>
              <h3>Áreas por contenido</h3>
              <p>Todo el tablero organiza la vida pública por grupos, recursos, reportes y más.</p>
            </div>
          </article>
          <article class="community-layer-card">
            <span class="community-layer-index">3</span>
            <div>
              <p class="community-eyebrow">CAPA EDITORIAL</p>
              <h3>Historias y actividades</h3>
              <p>La comunidad comparte narrativas, publicaciones y experiencias de forma clara.</p>
            </div>
          </article>
        </div>
      </section>

      <section class="community-section community-congregation-gallery-section" aria-label="Galería de congregaciones">
        <div class="community-section-heading">
          <div>
            <p class="community-eyebrow">CONGREGACIONES DISPONIBLES</p>
            <h2>Selecciona una congregación</h2>
            <p>Explora todas las sedes públicas y elige la que quieras conocer en detalle.</p>
          </div>
          <span class="community-updates-count">{{ congregationCards.length }} congregaciones</span>
        </div>

        <div v-if="congregationCards.length" class="community-congregation-grid">
          <button
            v-for="congregation in congregationCards"
            :key="congregation.id"
            type="button"
            class="community-congregation-card"
            :class="{ active: selectedCongregation === congregation.id }"
            @click="selectedCongregation = congregation.id; selectedLocationId = congregation.id; nextTick(renderPublicMap)"
          >
            <div class="community-congregation-card-header">
              <span class="community-congregation-pin"><MapPinIcon aria-hidden="true" /></span>
              <span class="community-congregation-tag">{{ congregation.city }}</span>
            </div>
            <h3>{{ congregation.name }}</h3>
            <p>{{ congregation.address || 'Ubicación pública disponible' }}</p>
            <div class="community-congregation-stats">
              <span>{{ congregation.eventCount }} eventos</span>
              <span>{{ congregation.postCount }} posts</span>
              <span>{{ congregation.updateCount }} aportes</span>
            </div>
          </button>
        </div>
      </section>

      <section v-if="selectedCongregationDetail" class="community-section community-selected-congregation-section">
        <div class="community-section-heading">
          <div>
            <p class="community-eyebrow">INFORMACIÓN PUBLICA</p>
            <h2>{{ selectedCongregationDetail.name }}</h2>
            <p>{{ selectedCongregationDetail.address }} · {{ selectedCongregationDetail.city }}</p>
          </div>
          <RouterLink class="community-profile-link" :to="{ name: 'congregation-profile', params: { congregationId: selectedCongregationDetail.id } }">
            Ver ficha completa
          </RouterLink>
        </div>

        <div class="community-selected-detail-grid">
          <article class="community-selected-panel">
            <h3>Próximos encuentros</h3>
            <ul v-if="selectedCongregationEventList.length">
              <li v-for="event in selectedCongregationEventList.slice(0, 3)" :key="event.id">
                <strong>{{ event.title }}</strong>
                <span>{{ formatEventDate(event.startsAt) }} · {{ formatEventTime(event.startsAt) }}</span>
              </li>
            </ul>
            <p v-else>No hay encuentros públicos registrados.</p>
          </article>

          <article class="community-selected-panel">
            <h3>Publicaciones</h3>
            <ul v-if="selectedCongregationPostList.length">
              <li v-for="post in selectedCongregationPostList.slice(0, 3)" :key="post.id">
                <strong>{{ post.title }}</strong>
                <span>{{ post.excerpt || post.body }}</span>
              </li>
            </ul>
            <p v-else>No hay publicaciones públicas disponibles.</p>
          </article>
        </div>
      </section>

      <section id="agenda" class="community-section community-agenda-section">
        <div class="community-section-heading">
          <div>
            <p class="community-eyebrow">VEN Y COMPARTE</p>
            <h2>Próximos encuentros</h2>
            <p>Actividades abiertas organizadas por nuestras congregaciones.</p>
          </div>
          <label class="community-filter">
            <span>Congregación</span>
            <select v-model="selectedCongregation" aria-label="Filtrar por congregación" @change="onCongregationChange">
              <option value="all">Todas las congregaciones</option>
              <option v-for="congregation in community.congregations" :key="congregation.id" :value="congregation.id">
                {{ congregation.name }}
              </option>
            </select>
          </label>
        </div>

        <div class="community-dashboard-summary" aria-label="Resumen público de la comunidad">
          <div><span>Sedes activas</span><strong>{{ community.congregations.length }}</strong></div>
          <div><span>Próximos encuentros</span><strong>{{ community.events.length }}</strong></div>
          <div><span>Publicaciones y aportes</span><strong>{{ community.posts.length + community.moduleUpdates.length }}</strong></div>
          <span class="community-dashboard-source">Información publicada por las congregaciones</span>
        </div>

        <div v-if="loading" class="community-state" role="status">Cargando agenda comunitaria…</div>
        <div v-else-if="errorMessage" class="community-state community-error" role="alert">
          <span>{{ errorMessage }}</span>
          <button type="button" @click="loadCommunity">Volver a intentar</button>
        </div>
        <section v-else class="community-agenda-slider" aria-label="Mapa y agenda comunitaria">
          <div class="community-agenda-slider-heading">
            <div>
              <p class="community-eyebrow">TABLERO DE ACTIVIDADES</p>
              <h3>Encuentros por congregación</h3>
            </div>
            <span>{{ eventCountLabel }}</span>
          </div>
          <div class="community-agenda-workspace">
          <section class="community-map-column" aria-label="Mapa de congregaciones y actividades">
            <div class="community-map-frame">
              <div ref="publicMapElement" class="community-map-canvas" aria-label="Mapa Leaflet de ubicaciones con actividades"></div>
              <div class="community-map-controls" aria-label="Controles del mapa">
                <button class="community-map-control" type="button" @click="focusPublicMapOnSelection">Centrar cerca de ti</button>
                <button class="community-map-control" type="button" @click="togglePublicScrollZoom">{{ publicScrollZoom ? 'Zoom rueda: on' : 'Zoom rueda: off' }}</button>
              </div>
              <div v-if="!mapLocations.some(({ latitude, longitude }) => Number.isFinite(Number(latitude)) && Number(latitude) >= -90 && Number(latitude) <= 90 && Number.isFinite(Number(longitude)) && Number(longitude) >= -180 && Number(longitude) <= 180)" class="community-map-empty">
                <MapPinIcon aria-hidden="true" /><span>{{ selectedCongregation === 'all' ? 'El mapa mostrará las ubicaciones cuando haya congregaciones activas con coordenadas.' : 'Esta congregación aún no tiene coordenadas disponibles.' }}</span>
              </div>
            </div>
            <article v-if="selectedLocation" class="community-location-summary">
              <div class="community-location-summary-heading">
                <span class="community-location-pin"><MapPinIcon aria-hidden="true" /></span>
                <div><p class="community-eyebrow">UBICACIÓN SELECCIONADA</p><h3>{{ selectedLocation.name }}</h3></div>
                <span class="community-location-count">{{ selectedLocationEvents.length }} {{ selectedLocationEvents.length === 1 ? 'actividad' : 'actividades' }}</span>
              </div>
              <p class="community-location-address">{{ [selectedLocation.address, selectedLocation.city].filter(Boolean).join(' · ') }}</p>
              <p v-if="selectedLocationEvents[0]" class="community-location-next">
                <CalendarDaysIcon aria-hidden="true" /> Próxima: {{ selectedLocationEvents[0].title }} · {{ formatEventDate(selectedLocationEvents[0].startsAt) }}
              </p>
              <div class="community-location-actions">
                <a class="community-directions-link" :href="`https://www.google.com/maps/dir/?api=1&destination=${selectedLocation.latitude},${selectedLocation.longitude}`" target="_blank" rel="noopener noreferrer">
                  Cómo llegar <ArrowRightIcon aria-hidden="true" />
                </a>
                <RouterLink class="community-profile-link" :to="{ name: 'congregation-profile', params: { congregationId: selectedLocation.id } }">
                  Ver perfil completo
                </RouterLink>
              </div>
            </article>
            <div v-else class="community-location-summary community-location-summary-empty">
              <MapPinIcon aria-hidden="true" />
              <p>Las ubicaciones disponibles aparecerán aquí cuando sus congregaciones publiquen actividades.</p>
            </div>
          </section>

          <section class="community-activity-column community-agenda-slide" aria-label="Actividades agrupadas por congregación">
            <div class="community-activity-heading">
              <div><p class="community-eyebrow">ORDENADAS POR PRÓXIMO ENCUENTRO</p><h3>{{ eventCountLabel }}</h3></div>
              <span>{{ eventGroups.length }} {{ eventGroups.length === 1 ? 'congregación' : 'congregaciones' }}</span>
            </div>
            <div v-if="visibleLocationGroups.length" class="community-location-groups">
              <section v-for="group in visibleLocationGroups" :key="group.id" class="community-location-group">
                <button class="community-location-group-heading" type="button" :aria-pressed="selectedLocationId === group.id" @click="selectLocation(group.id)">
                  <span class="community-group-marker"><MapPinIcon aria-hidden="true" /></span>
                  <span class="community-group-title"><strong>{{ group.name }}</strong><small>{{ group.city }}<template v-if="group.address"> · {{ group.address }}</template></small></span>
                  <span class="community-group-total">{{ group.events.length }}</span>
                </button>
                <template v-if="group.events.length">
                  <article v-for="event in group.events" :key="event.id" class="community-activity-row">
                    <time class="community-activity-date" :datetime="event.startsAt"><span>{{ formatMonth(event.startsAt) }}</span><strong>{{ formatDate(event.startsAt, { day: 'numeric' }) }}</strong></time>
                    <div class="community-activity-copy">
                      <span>{{ formatEventDate(event.startsAt) }} · {{ formatEventTime(event.startsAt) }}</span>
                      <h4>{{ event.title }}</h4>
                      <p>{{ event.description }}</p>
                      <small><UsersIcon aria-hidden="true" /> {{ event.attendeeCount }} {{ event.attendeeCount === 1 ? 'persona inscrita' : 'personas inscritas' }}</small>
                    </div>
                  </article>
                </template>
                <div v-else class="community-location-group-empty">
                  <span>Sin encuentros públicos aún</span>
                </div>
              </section>
            </div>
            <div v-else class="community-empty community-activity-empty">
              <CalendarDaysIcon aria-hidden="true" />
              <p>{{ selectedCongregation === 'all' ? 'Todavía no hay encuentros públicos próximos.' : 'Esta congregación no tiene encuentros próximos.' }}</p>
              <span>Vuelve pronto para ver nuevas actividades abiertas.</span>
            </div>
          </section>
          </div>
        </section>
        <div class="community-agenda-foot"><span>{{ eventCountLabel }}</span><span>Eventos públicos · Datos agrupados por congregación</span></div>
      </section>

      <section id="aportes" class="community-section community-updates-section">
        <div class="community-section-heading">
          <div>
            <p class="community-eyebrow">MAPA ORGANIZACIONAL PÚBLICO</p>
            <h2>La vida de la congregación, por áreas</h2>
            <p>Explora encuentros, sedes y aportes que cada equipo autorizó compartir.</p>
          </div>
          <span class="community-updates-count">{{ communityAreas[0].count }} {{ communityAreas[0].count === 1 ? 'elemento público' : 'elementos públicos' }}</span>
        </div>
        <div class="community-org-map">
          <div class="community-org-root">
            <span class="community-org-root-icon"><GlobeAltIcon aria-hidden="true" /></span>
            <span><strong>Comunidad abierta</strong><small>{{ selectedCongregation === 'all' ? 'Todas las congregaciones' : community.congregations.find(({ id }) => id === selectedCongregation)?.name }}</small></span>
          </div>
          <nav class="community-org-branches" aria-label="Áreas de la comunidad" role="tablist">
            <button v-for="area in communityAreas" :key="area.id" class="community-org-branch" :class="{ active: selectedCommunityArea === area.id }" type="button" role="tab" :aria-selected="selectedCommunityArea === area.id" @click="selectedCommunityArea = area.id">
              <span class="community-org-branch-label">{{ area.label }}</span><strong>{{ area.count }}</strong>
            </button>
          </nav>
        </div>
        <div v-if="visibleCommunityAreaSections.length" class="community-area-groups">
          <section v-for="section in visibleCommunityAreaSections" :key="section.id" class="community-area-group">
            <header><div><p class="community-eyebrow">ÁREA</p><h3>{{ section.label }}</h3></div><span>{{ section.count }}</span></header>
            <div class="community-area-org-groups">
              <div v-for="organizationGroup in section.organizationGroups" :key="`${section.id}-${organizationGroup.name}`" class="community-area-org-group">
                <div class="community-area-org-group-header">
                  <span class="community-area-org-group-badge"><MapPinIcon aria-hidden="true" /></span>
                  <strong>{{ organizationGroup.name }}</strong>
                  <small>{{ organizationGroup.items.length }} {{ organizationGroup.items.length === 1 ? 'dato' : 'datos' }}</small>
                </div>
                <div class="community-area-entries">
                  <article v-for="entry in organizationGroup.items" :key="entry.id" class="community-area-entry">
                    <div class="community-update-meta">
                      <span>{{ section.id === 'events' ? 'Encuentro' : section.id === 'posts' ? (entry.type === 'activity' ? 'Actividad' : 'Publicación') : section.id === 'locations' ? 'Sede' : 'Compartido públicamente' }}</span>
                      <time v-if="entry.date" :datetime="entry.date">{{ formatDate(entry.date, { year: 'numeric' }) }}</time>
                    </div>
                    <h4>{{ entry.title }}</h4>
                    <p v-if="entry.description">{{ entry.description }}</p>
                    <p v-if="entry.detail" class="community-update-detail">{{ entry.detail }}</p>
                    <span class="community-update-congregation"><MapPinIcon aria-hidden="true" />{{ entry.congregation || entry.name }}</span>
                  </article>
                </div>
              </div>
            </div>
          </section>
        </div>
        <div v-else class="community-empty community-updates-empty">
          <UsersIcon aria-hidden="true" />
          <p>{{ selectedCommunityArea === 'all' ? 'Todavía no hay información pública para estas áreas.' : `No hay contenido público en el área ${communityAreas.find(({ id }) => id === selectedCommunityArea)?.label || ''}.` }}</p>
        </div>
      </section>

      <section id="historias" class="community-section community-stories-section">
        <div class="community-section-heading community-stories-heading">
          <div>
            <p class="community-eyebrow">VOCES DE LA COMUNIDAD</p>
            <h2>Historias y actividades</h2>
            <p>Lo que compartimos también construye comunidad.</p>
          </div>
          <div class="community-tabs" role="group" aria-label="Tipo de publicación">
            <button type="button" :aria-pressed="publicationType === 'all'" @click="publicationType = 'all'">Todo</button>
            <button type="button" :aria-pressed="publicationType === 'article'" @click="publicationType = 'article'">Blog</button>
            <button type="button" :aria-pressed="publicationType === 'activity'" @click="publicationType = 'activity'">Actividades</button>
          </div>
        </div>

        <div v-if="!loading && !errorMessage && visiblePosts.length" class="community-story-grid">
          <article v-for="(post, index) in visiblePosts" :key="post.id" class="community-story" :class="{ 'community-story-featured': index === 0 }">
            <button class="community-story-image" type="button" :aria-label="`Leer ${post.title}`" @click="openPost(post)">
              <img :src="post.imageUrl" :alt="post.title" loading="lazy" />
              <span>{{ post.type === 'activity' ? 'Actividad' : 'Desde el blog' }}</span>
            </button>
            <div class="community-story-content">
              <div class="community-story-meta"><span>{{ post.congregation }}</span><time :datetime="post.publishedAt">{{ formatDate(post.publishedAt, { year: 'numeric' }) }}</time></div>
              <h3><button type="button" @click="openPost(post)">{{ post.title }}</button></h3>
              <p>{{ post.excerpt }}</p>
              <button class="community-read-link" type="button" @click="openPost(post)">Leer historia <ArrowRightIcon aria-hidden="true" /></button>
            </div>
          </article>
        </div>
        <div v-else-if="!loading && !errorMessage" class="community-empty">
          <BookOpenIcon aria-hidden="true" />
          <p>No hay publicaciones para estos filtros.</p>
        </div>
      </section>
    </main>

    <footer class="community-footer">
      <RouterLink class="community-brand" :to="{ name: 'home' }">
        <span class="community-brand-mark"><component :is="brandIcons[appearance.settings.brandIcon] || BuildingLibraryIcon" aria-hidden="true" /></span>
        <span>{{ appearance.settings.brandName }}</span>
      </RouterLink>
      <p>Una comunidad, muchas maneras de encontrarnos.</p>
      <a href="#top" @click.prevent="scrollToTop">Volver arriba <ArrowRightIcon aria-hidden="true" /></a>
    </footer>

    <dialog v-if="selectedPost" ref="postDialog" class="community-dialog" @close="selectedPost = null" @click.self="closePost">
      <button class="community-dialog-close" type="button" aria-label="Cerrar publicación" @click="closePost"><XMarkIcon aria-hidden="true" /></button>
      <img :src="selectedPost.imageUrl" :alt="selectedPost.title" />
      <div class="community-dialog-content">
        <p class="community-eyebrow">{{ selectedPost.type === 'activity' ? 'ACTIVIDAD' : 'DESDE EL BLOG' }} · {{ selectedPost.congregation }}</p>
        <h2>{{ selectedPost.title }}</h2>
        <p class="community-dialog-date"><ClockIcon aria-hidden="true" /> {{ formatDate(selectedPost.publishedAt, { day: 'numeric', month: 'long', year: 'numeric' }) }}</p>
        <p class="community-dialog-excerpt">{{ selectedPost.excerpt }}</p>
        <p class="community-dialog-body">{{ selectedPost.body }}</p>
        <span class="community-dialog-location"><MapPinIcon aria-hidden="true" /> {{ selectedPost.congregation }} · {{ selectedPost.city }}</span>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.community-congregation-gallery-section {
  margin-top: 32px;
}

.community-congregation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 18px;
}

.community-congregation-card {
  background: #fffefa;
  border: 1px solid #e1e5db;
  border-radius: 4px;
  padding: 18px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  color: inherit;
}

.community-congregation-card:hover,
.community-congregation-card.active {
  transform: translateY(-2px);
  border-color: #9eaf8c;
  box-shadow: 0 10px 22px rgba(35, 59, 44, 0.09);
}

.community-congregation-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.community-congregation-pin {
  width: 34px;
  height: 34px;
  border: 1px solid #d9ddcb;
  border-radius: 4px;
  background: #edf2e9;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #214f3d;
}

.community-congregation-tag {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0;
  color: #71845f;
  font-weight: 800;
}

.community-congregation-card h3 {
  margin: 0 0 8px;
  color: #2c4838;
  font: 700 16px/1.35 'Manrope', sans-serif;
}

.community-congregation-card p {
  margin: 0;
  color: #66756c;
  line-height: 1.6;
}

.community-congregation-stats {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.community-congregation-stats span {
  display: inline-flex;
  align-items: center;
  border: 1px solid #e0e6db;
  background: #f5f7f0;
  border-radius: 3px;
  padding: 7px 10px;
  font-size: 0.72rem;
  color: #536a58;
  font-weight: 700;
}

.community-selected-congregation-section {
  margin-top: 32px;
}

.community-selected-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.community-selected-panel {
  background: #fffefa;
  border: 1px solid #e1e5db;
  border-radius: 4px;
  padding: 20px;
}

.community-selected-panel h3 {
  margin-top: 0;
  margin-bottom: 12px;
  color: #2b4c39;
  font: 700 14px 'Manrope', sans-serif;
}

.community-selected-panel ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 12px;
}

.community-selected-panel li {
  display: grid;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid rgba(31, 42, 47, 0.08);
}

.community-selected-panel li strong {
  color: #294636;
}

.community-selected-panel li span,
.community-selected-panel p {
  color: #627168;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .community-selected-detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>