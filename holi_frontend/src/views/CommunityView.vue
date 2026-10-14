<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
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
  StarIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { getPublicCommunity } from '../services/communityService'
import { getBrowserCoordinates } from '../modules/locationFilters'
import { usePublicAdRotation } from '../composables/usePublicAdRotation'
import { useAuthStore } from '../stores/auth'
import { useAppearanceStore } from '../stores/appearance'
import ScrollAdSlot from '../components/community/ScrollAdSlot.vue'
import CommunityMapSection from '../components/community/CommunityMapSection.vue'

const router = useRouter()
const auth = useAuthStore()
const appearance = useAppearanceStore()
const community = ref({ congregations: [], events: [], posts: [], moduleUpdates: [], ads: [], syntheticFixturesEnabled: false })
const { ads: liveAds } = usePublicAdRotation()
const loading = ref(true)
const errorMessage = ref('')
const selectedCongregation = ref('all')
const publicationType = ref('all')
const selectedPost = ref(null)
const postDialog = ref(null)
const selectedLocationId = ref('')
const selectedCommunityArea = ref('all')
const areaSearchQuery = ref('')
const publicScrollZoom = ref(false)
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

const visibleEvents = computed(() => {
  const realEvents = community.value.events.filter((event) => (
    selectedCongregation.value === 'all' || event.locationId === selectedCongregation.value
  ))
  const syntheticEvents = community.value.moduleUpdates.filter((event) => (
    event.moduleId === 'events'
    && event.synthetic
    && (selectedCongregation.value === 'all' || event.congregationId === selectedCongregation.value)
  ))
  return [...realEvents, ...syntheticEvents].sort((first, second) => new Date(first.startsAt) - new Date(second.startsAt))
})
const selectedCongregationDetail = computed(() => {
  if (selectedCongregation.value === 'all') return null
  return community.value.congregations.find(({ id }) => id === selectedCongregation.value) || null
})
const selectedCongregationEventList = computed(() => {
  if (!selectedCongregationDetail.value) return []
  const realEvents = community.value.events.filter((event) => event.locationId === selectedCongregationDetail.value.id)
  const syntheticEvents = community.value.moduleUpdates.filter((event) => (
    event.moduleId === 'events'
    && event.synthetic
    && event.congregationId === selectedCongregationDetail.value.id
  ))
  return [...realEvents, ...syntheticEvents].sort((first, second) => new Date(first.startsAt) - new Date(second.startsAt))
})
const selectedCongregationPostList = computed(() => {
  if (!selectedCongregationDetail.value) return []
  return community.value.posts
    .filter((post) => post.locationId === selectedCongregationDetail.value.id)
    .sort((first, second) => new Date(second.publishedAt) - new Date(first.publishedAt))
})
const congregationCards = computed(() => community.value.congregations.map((congregation) => ({
  ...congregation,
  upcomingEvents: [
    ...community.value.events.filter((event) => event.locationId === congregation.id),
    ...community.value.moduleUpdates.filter((event) => event.moduleId === 'events'
      && event.congregationId === congregation.id),
  ]
    .filter((event) => Date.parse(event.startsAt) >= Date.now())
    .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt)),
  eventCount: community.value.events.filter((event) => event.locationId === congregation.id).length
    + community.value.moduleUpdates.filter((event) => event.moduleId === 'events'
      && event.congregationId === congregation.id).length,
  postCount: community.value.posts.filter((post) => post.locationId === congregation.id).length,
  updateCount: community.value.moduleUpdates.filter((update) => update.synthetic
    ? update.congregationId === congregation.id
    : update.organizationId === congregation.organizationId).length,
})))
const visiblePosts = computed(() => community.value.posts.filter((post) => (
  (selectedCongregation.value === 'all' || post.locationId === selectedCongregation.value)
  && (publicationType.value === 'all' || post.type === publicationType.value)
)))
const selectedOrganizationId = computed(() => community.value.congregations
  .find(({ id }) => id === selectedCongregation.value)?.organizationId)
const visibleModuleUpdates = computed(() => community.value.moduleUpdates.filter((update) => (
  selectedCongregation.value === 'all'
  || (update.synthetic
    ? update.congregationId === selectedCongregation.value
    : update.organizationId === selectedOrganizationId.value)
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
  const updateSections = ['members', 'reservations', 'groups', 'attendance', 'resources', 'communications', 'reports', 'settings'].map((moduleId) => ({
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
      items: [
        ...visibleEvents.value.map((event) => ({
          ...event,
          description: event.description,
          detail: `${event.attendeeCount} ${event.attendeeCount === 1 ? 'persona inscrita' : 'personas inscritas'}`,
          date: event.startsAt,
        })),
        ...visibleModuleUpdates.value.filter((update) => update.synthetic && update.moduleId === 'events')
          .map((event) => ({ ...event, date: event.recordDate || event.startsAt })),
      ],
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
  {
    id: 'all',
    label: 'Todo el tablero',
    description: 'Agenda, sedes y contenido publicado',
    count: communityAreaSections.value.reduce((total, section) => total + section.count, 0),
  },
  ...communityAreaSections.value.map(({ id, label, count }) => ({
    id,
    label,
    count,
    description: communityAreaDescriptions[id] || 'Contenido compartido por la congregación',
  })),
])
const visibleCommunityAreaSections = computed(() => communityAreaSections.value
  .filter(({ id, count }) => selectedCommunityArea.value === 'all' ? count > 0 : id === selectedCommunityArea.value)
  .map((section) => {
    const query = areaSearchQuery.value.trim().toLowerCase()
    const organizationGroups = section.organizationGroups
      .map((group) => ({
        ...group,
        items: query
          ? group.items.filter((entry) => {
              const haystack = [
                entry.title,
                entry.description,
                entry.congregation,
                entry.name,
                entry.status,
                entry.detail,
                areaRecordType(section.id, entry),
              ].filter(Boolean).join(' ').toLowerCase()
              return haystack.includes(query)
            })
          : group.items,
      }))
      .filter((group) => group.items.length > 0)

    return {
      ...section,
      count: organizationGroups.reduce((total, group) => total + group.items.length, 0),
      organizationGroups,
    }
  })
  .filter((section) => section.count > 0))
const mapLocations = computed(() => community.value.congregations.filter((location) => (
  selectedCongregation.value === 'all' || location.id === selectedCongregation.value
)))
const agendaGroups = computed(() => mapLocations.value
  .map((congregation) => {
    const realEvents = community.value.events
      .filter((event) => event.locationId === congregation.id)
      .map((event) => ({ ...event, synthetic: false }))
    const syntheticEvents = community.value.moduleUpdates
      .filter((event) => event.moduleId === 'events' && event.congregationId === congregation.id)
      .map((event) => ({ ...event, synthetic: true }))
    return {
      id: congregation.id,
      name: congregation.name,
      city: congregation.city,
      address: congregation.address,
      latitude: congregation.latitude,
      longitude: congregation.longitude,
      events: [...realEvents, ...syntheticEvents]
        .filter((event) => Date.parse(event.startsAt) >= Date.now())
        .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt)),
    }
  })
  .sort((first, second) => Date.parse(first.events[0]?.startsAt || '9999-12-31') - Date.parse(second.events[0]?.startsAt || '9999-12-31')
    || first.name.localeCompare(second.name, 'es-MX')))
const totalUpcomingEvents = computed(() => agendaGroups.value.reduce((total, group) => total + group.events.length, 0))
const agendaCongregationCount = computed(() => agendaGroups.value.filter(({ events }) => events.length).length)
const selectedLocation = computed(() => community.value.congregations.find(({ id }) => id === selectedLocationId.value))
const selectedLocationEvents = computed(() => community.value.events
  .filter(({ locationId }) => locationId === selectedLocationId.value)
  .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt)))
const eventCountLabel = computed(() => `${totalUpcomingEvents.value} ${totalUpcomingEvents.value === 1 ? 'próximo encuentro' : 'próximos encuentros'}`)

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
    members: 'Miembros',
    reservations: 'Reservas',
    groups: 'Grupos',
    attendance: 'Asistencia',
    resources: 'Recursos',
    communications: 'Comunicaciones',
    reports: 'Reportes',
    settings: 'Preferencias',
  })[moduleId] || 'Actualización'
}

const communityAreaDescriptions = {
  events: 'Próximos encuentros con fecha y sede',
  members: 'Registros sintéticos de participantes para pruebas',
  reservations: 'Reservas de espacios para pruebas, no operativas',
  groups: 'Grupos y espacios de participación',
  attendance: 'Sesiones y asistencia registrada',
  resources: 'Recursos compartidos por la congregación',
  communications: 'Avisos y comunicaciones publicadas',
  reports: 'Informes autorizados para consulta pública',
  settings: 'Preferencias que la congregación decidió compartir',
  posts: 'Historias, noticias y actividades publicadas',
  locations: 'Sedes y ubicaciones registradas',
}

function areaRecordType(sectionId, entry) {
  if (sectionId === 'events') return 'Encuentro'
  if (sectionId === 'posts') return entry.type === 'activity' ? 'Actividad' : 'Publicación'
  if (sectionId === 'locations') return 'Sede'
  return ({
    members: 'Miembro sintético',
    reservations: 'Reserva sintética',
    groups: 'Grupo',
    attendance: 'Asistencia',
    resources: 'Recurso',
    communications: 'Comunicación',
    reports: 'Informe',
    settings: 'Preferencia',
  })[sectionId] || 'Registro'
}

function areaIcon(moduleId) {
  return ({
    all: GlobeAltIcon,
    events: CalendarDaysIcon,
    members: UsersIcon,
    reservations: ClockIcon,
    groups: HeartIcon,
    attendance: UsersIcon,
    resources: BookOpenIcon,
    communications: GlobeAltIcon,
    reports: CalendarDaysIcon,
    settings: SparklesIcon,
    posts: BookOpenIcon,
    locations: MapPinIcon,
  })[moduleId] || BuildingLibraryIcon
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
  }
}

function openCongregationProfile(locationId) {
  if (!locationId) return
  selectLocation(locationId, false)
  router.push({ name: 'congregation-profile', params: { congregationId: locationId } })
}

function selectLocation(locationId, focusMap = true) {
  selectedLocationId.value = locationId
  if (selectedCongregation.value !== 'all' && selectedCongregation.value !== locationId) {
    selectedCongregation.value = locationId
  }
  if (!focusMap) return
  nextTick(() => {
    const mapSection = document.querySelector('.community-map-frame')
    mapSection?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

async function focusPublicMapOnSelection() {
  const location = community.value.congregations.find(({ id }) => id === selectedLocationId.value)
  if (!location) return

  const latitude = Number(location.latitude)
  const longitude = Number(location.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

  try {
    const userLocation = await getBrowserCoordinates(globalThis.navigator?.geolocation)
    const bounds = L.latLngBounds(
      [[userLocation.lat, userLocation.lng], [latitude, longitude]],
    ).pad(0.35)
    document.querySelector('.community-map-canvas')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return bounds
  } catch {
    return null
  }
}

function onCongregationChange() {
  const visibleLocationIds = new Set(mapLocations.value.map(({ id }) => id))
  if (selectedCongregation.value !== 'all') {
    selectedLocationId.value = selectedCongregation.value
    selectLocation(selectedCongregation.value, true)
  } else if (!visibleLocationIds.has(selectedLocationId.value)) {
    selectedLocationId.value = community.value.events[0]?.locationId || community.value.congregations[0]?.id || ''
  }
}

function showAllCongregations() {
  selectedCongregation.value = 'all'
  selectedLocationId.value = community.value.congregations[0]?.id || ''
}

function togglePublicScrollZoom(value = !publicScrollZoom.value) {
  publicScrollZoom.value = value
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
</script>

<template>
  <div id="top" class="community-page" :class="`community-mode-${appearance.settings.communityMode}`" :style="appearanceStyle">
    <header class="community-nav">
      <RouterLink class="community-brand" :to="{ name: 'home' }" aria-label="Holi Places, inicio">
        <span class="community-brand-mark"><component :is="brandIcons[appearance.settings.brandIcon] || BuildingLibraryIcon" aria-hidden="true" /></span>
        <span>{{ appearance.settings.brandName }}</span>
      </RouterLink>
      <nav class="community-nav-links" aria-label="Navegación pública">
        <a href="#congregaciones">Congregaciones</a>
        <a href="#agenda">Agenda</a>
        <a href="#areas">Áreas</a>
        <a href="#historias">Historias</a>
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

      <section class="community-quick-nav" aria-label="Navegación rápida de la comunidad">
        <p class="community-eyebrow">NAVEGACIÓN RÁPIDA</p>
        <div class="community-quick-nav-list">
          <a href="#congregaciones">Congregaciones</a>
          <a href="#agenda">Agenda</a>
          <a href="#areas">Áreas</a>
          <a href="#historias">Historias</a>
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

      <section id="congregaciones" class="community-section community-congregation-gallery-section" aria-label="Galería de congregaciones">
        <div class="community-section-heading">
          <div>
            <p class="community-eyebrow">CONGREGACIONES DISPONIBLES</p>
            <h2>Selecciona una congregación</h2>
            <p>Explora todas las sedes públicas y elige la que quieras conocer en detalle.</p>
          </div>
          <div class="community-gallery-tools">
            <span class="community-updates-count">{{ congregationCards.length }} congregaciones</span>
            <button class="community-show-all-button" type="button" :disabled="selectedCongregation === 'all'" @click="showAllCongregations">
              <XMarkIcon aria-hidden="true" /> Mostrar todas
            </button>
          </div>
        </div>

        <div v-if="congregationCards.length" class="community-congregation-grid">
          <button
            v-for="congregation in congregationCards"
            :key="congregation.id"
            type="button"
            class="community-congregation-card"
            :class="{ active: selectedCongregation === congregation.id }"
            @click="selectedCongregation = congregation.id; selectedLocationId = congregation.id; selectLocation(congregation.id, true)"
          >
            <div class="community-congregation-card-header">
              <span class="community-congregation-pin"><MapPinIcon aria-hidden="true" /></span>
              <span class="community-congregation-tag">{{ congregation.city }} · {{ congregation.type }}</span>
            </div>
            <h3>{{ congregation.name }}</h3>
            <p>{{ congregation.address || 'Dirección no incluida en la ficha' }}</p>
            <div class="community-congregation-next-event">
              <CalendarDaysIcon aria-hidden="true" />
              <div v-if="congregation.upcomingEvents[0]" class="community-congregation-next-event-copy">
                <span>Próximo encuentro<span v-if="congregation.upcomingEvents[0].synthetic" class="community-congregation-event-synthetic"> · sintético</span></span>
                <strong>{{ congregation.upcomingEvents[0].title }}</strong>
                <small>{{ formatEventDate(congregation.upcomingEvents[0].startsAt) }} · {{ formatEventTime(congregation.upcomingEvents[0].startsAt) }}</small>
              </div>
              <div v-else class="community-congregation-next-event-copy">
                <span>Próximo encuentro</span>
                <small>Sin encuentros programados</small>
              </div>
            </div>
            <div class="community-congregation-stats">
              <span v-if="congregation.rating !== null && congregation.rating !== undefined" class="community-congregation-rating"><StarIcon aria-hidden="true" />{{ Number(congregation.rating).toFixed(1) }}</span>
              <span v-if="congregation.reviewCount !== null && congregation.reviewCount !== undefined">{{ congregation.reviewCount }} reseñas en Maps</span>
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

      <ScrollAdSlot :ads="liveAds" placement="content" :slot-index="0" :slot-count="3" :slot-seed="4" />

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
          <div><span>Próximos encuentros</span><strong>{{ totalUpcomingEvents }}</strong></div>
          <div><span>{{ community.syntheticFixturesEnabled ? 'Registros de prueba' : 'Publicaciones y aportes' }}</span><strong>{{ community.syntheticFixturesEnabled ? community.moduleUpdates.length : community.posts.length + community.moduleUpdates.length }}</strong></div>
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
              <p class="community-eyebrow">{{ community.syntheticFixturesEnabled ? 'PIZARRA · DATOS DE PRUEBA' : 'AGENDA COMUNITARIA' }}</p>
              <h3>Próximos encuentros por sede</h3>
            </div>
            <span>{{ eventCountLabel }}</span>
          </div>
          <div class="community-agenda-workspace">
          <CommunityMapSection
            :locations="mapLocations"
            :selected-location-id="selectedLocationId"
            :selected-location="selectedLocation"
            :selected-location-events="selectedLocationEvents"
            :scroll-zoom="publicScrollZoom"
            @select-location="({ locationId, focusMap }) => selectLocation(locationId, focusMap)"
            @toggle-scroll-zoom="togglePublicScrollZoom"
            @open-profile="openCongregationProfile"
          />

          <section class="community-activity-column community-agenda-slide" aria-label="Pizarra de próximos encuentros por congregación">
            <div class="community-activity-heading">
              <div><p class="community-eyebrow">FECHA · HORA · SEDE</p><h3>{{ eventCountLabel }}</h3></div>
              <span>{{ agendaCongregationCount }} {{ agendaCongregationCount === 1 ? 'sede activa' : 'sedes activas' }}</span>
            </div>
            <div v-if="agendaGroups.length" class="community-agenda-board">
              <article v-for="group in agendaGroups" :key="group.id" class="community-agenda-board-column" :class="{ 'community-agenda-board-column-empty': !group.events.length }">
                <button class="community-agenda-board-location" type="button" :aria-pressed="selectedLocationId === group.id" @click="selectedLocationId = group.id; selectedCongregation = group.id; selectLocation(group.id, true)">
                  <MapPinIcon aria-hidden="true" />
                  <span><strong>{{ group.name }}</strong><small>{{ group.city }}<template v-if="group.address"> · {{ group.address }}</template></small></span>
                  <b>{{ group.events.length }}</b>
                </button>
                <div v-if="group.events.length" class="community-agenda-board-cards">
                  <article v-for="event in group.events" :key="event.id" class="community-agenda-board-card" :class="{ 'community-agenda-board-card-synthetic': event.synthetic }">
                    <div class="community-agenda-board-date">
                      <span>{{ formatMonth(event.startsAt) }}</span>
                      <strong>{{ formatDate(event.startsAt, { day: 'numeric' }) }}</strong>
                    </div>
                    <div class="community-agenda-board-copy">
                      <div class="community-agenda-board-meta">
                        <time :datetime="event.startsAt">{{ formatEventDate(event.startsAt) }} · {{ formatEventTime(event.startsAt) }}</time>
                        <span v-if="event.synthetic">SINTÉTICO</span>
                      </div>
                      <h4>{{ event.title }}</h4>
                      <p>{{ event.description }}</p>
                      <small v-if="!event.synthetic"><UsersIcon aria-hidden="true" /> {{ event.attendeeCount || 0 }} {{ event.attendeeCount === 1 ? 'inscripción' : 'inscripciones' }}</small>
                    </div>
                  </article>
                </div>
                <p v-else class="community-agenda-board-empty">No hay encuentros programados.</p>
              </article>
            </div>
            <div v-else class="community-empty community-activity-empty">
              <CalendarDaysIcon aria-hidden="true" />
              <p>{{ selectedCongregation === 'all' ? 'Todavía no hay encuentros próximos.' : 'Esta congregación no tiene encuentros próximos.' }}</p>
            </div>
          </section>
          </div>
        </section>
        <div class="community-agenda-foot"><span>{{ eventCountLabel }}</span><span>{{ community.syntheticFixturesEnabled ? 'La etiqueta SINTÉTICO identifica eventos de prueba.' : 'Agenda organizada por congregación y sede.' }}</span></div>
      </section>

      <ScrollAdSlot :ads="liveAds" placement="community" :slot-index="0" :slot-count="3" :slot-seed="0" />

      <section id="areas" class="community-section community-updates-section">
        <div class="community-section-heading">
          <div>
            <p class="community-eyebrow">{{ community.syntheticFixturesEnabled ? 'MÓDULOS · ENTORNO DE PRUEBA' : 'MAPA ORGANIZACIONAL PÚBLICO' }}</p>
            <h2>La vida de la congregación, por áreas</h2>
            <p>{{ community.syntheticFixturesEnabled ? 'Explora los registros sintéticos privados por congregación y módulo.' : 'Explora encuentros, sedes y aportes que cada equipo autorizó compartir.' }}</p>
          </div>
          <span class="community-updates-count">{{ communityAreas[0].count }} {{ community.syntheticFixturesEnabled ? 'registros de prueba' : communityAreas[0].count === 1 ? 'elemento público' : 'elementos públicos' }}</span>
        </div>
        <div v-if="community.syntheticFixturesEnabled" class="community-synthetic-notice" role="status">
          <strong>Entorno de prueba: datos sintéticos</strong>
          <span>Los registros etiquetados como sintéticos son ilustrativos, privados y no han sido confirmados por las congregaciones.</span>
        </div>
        <div class="community-org-map">
          <div class="community-org-root">
            <span class="community-org-root-icon"><GlobeAltIcon aria-hidden="true" /></span>
            <span><strong>{{ selectedCommunityArea === 'all' ? 'Comunidad abierta' : communityAreas.find(({ id }) => id === selectedCommunityArea)?.label }}</strong><small>{{ selectedCongregation === 'all' ? 'Todas las congregaciones' : community.congregations.find(({ id }) => id === selectedCongregation)?.name }}</small></span>
          </div>
          <nav class="community-org-branches" aria-label="Áreas de la comunidad" role="tablist">
            <button v-for="area in communityAreas" :id="`community-area-tab-${area.id}`" :key="area.id" class="community-org-branch" :class="{ active: selectedCommunityArea === area.id }" type="button" role="tab" aria-controls="community-area-panel" :aria-selected="selectedCommunityArea === area.id" @click="selectedCommunityArea = area.id">
              <span class="community-org-branch-copy"><span class="community-org-branch-label">{{ area.label }}</span><small>{{ area.description }}</small></span><strong>{{ area.count }}</strong>
            </button>
          </nav>
        </div>

        <div class="community-area-dashboard-toolbar">
          <div class="community-area-summary-strip" aria-label="Resumen del tablero">
            <span><strong>{{ community.congregations.length }}</strong> sedes</span>
            <span><strong>{{ visibleCommunityAreaSections.reduce((total, section) => total + section.count, 0) }}</strong> registros</span>
            <span><strong>{{ communityAreas.filter(({ id }) => id !== 'all').reduce((total, area) => total + area.count, 0) }}</strong> módulos activos</span>
          </div>
          <div class="community-area-filters">
            <label class="community-area-search" aria-label="Buscar registros">
              <span>Buscar</span>
              <input v-model="areaSearchQuery" type="search" placeholder="Título, módulo, congregación..." />
            </label>
            <label class="community-area-order" aria-label="Orden de resultados">
              <span>Orden</span>
              <select value="recent">
                <option value="recent">Más recientes</option>
                <option value="congregation">Por congregación</option>
              </select>
            </label>
          </div>
        </div>

        <div id="community-area-panel" class="community-area-panel" role="tabpanel" tabindex="0" :aria-labelledby="`community-area-tab-${selectedCommunityArea}`">
          <div v-if="visibleCommunityAreaSections.length" class="community-area-groups">
            <section v-for="section in visibleCommunityAreaSections" :key="section.id" class="community-area-group" :class="`community-area-group-${section.id}`">
              <header class="community-area-group-heading">
                <span class="community-area-heading-icon"><component :is="areaIcon(section.id)" aria-hidden="true" /></span>
                <div><p class="community-eyebrow">{{ communityAreas.find(({ id }) => id === section.id)?.description }}</p><h3>{{ section.label }}</h3></div>
                <span class="community-area-count">{{ section.count }} <small>{{ section.count === 1 ? 'registro' : 'registros' }}</small></span>
              </header>
              <div v-if="section.count" class="community-area-org-groups">
                <div v-for="organizationGroup in section.organizationGroups" :key="`${section.id}-${organizationGroup.name}`" class="community-area-org-group">
                  <div class="community-area-org-group-header">
                    <span class="community-area-org-group-badge"><BuildingLibraryIcon aria-hidden="true" /></span>
                    <div class="community-area-org-group-copy"><strong>{{ organizationGroup.name }}</strong><small>{{ organizationGroup.items.length }} {{ organizationGroup.items.length === 1 ? 'registro en esta área' : 'registros en esta área' }}</small></div>
                  </div>
                  <div class="community-area-entries community-area-slider" aria-label="Slider de registros del módulo">
                    <details v-for="entry in organizationGroup.items" :key="entry.id" class="community-area-entry community-area-slide-card">
                      <summary>
                        <span class="community-area-entry-icon"><component :is="areaIcon(section.id)" aria-hidden="true" /></span>
                        <div class="community-area-entry-content">
                          <div class="community-update-meta">
                            <span>{{ areaRecordType(section.id, entry) }}</span>
                            <span v-if="entry.synthetic" class="community-synthetic-badge">SINTÉTICO · PRIVADO</span>
                            <span v-if="entry.status" class="community-area-status">{{ entry.status }}</span>
                            <time v-if="entry.date" :datetime="entry.date">{{ formatDate(entry.date, { year: 'numeric' }) }}</time>
                          </div>
                          <h4>{{ entry.title }}</h4>
                          <p v-if="entry.description" class="community-area-entry-preview">{{ entry.description }}</p>
                          <span class="community-update-congregation"><MapPinIcon aria-hidden="true" />{{ entry.congregation || entry.name }}</span>
                        </div>
                      </summary>
                      <div class="community-area-entry-detail">
                        <p v-if="entry.description">{{ entry.description }}</p>
                        <p v-if="entry.detail" class="community-update-detail">{{ entry.detail }}</p>
                        <p v-if="entry.startsAt && entry.endsAt" class="community-area-entry-time">Termina {{ formatEventTime(entry.endsAt) }}</p>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
              <div v-else class="community-empty community-area-no-records">
                <UsersIcon aria-hidden="true" />
                <p>No hay registros públicos en esta área.</p>
                <RouterLink class="community-area-empty-action" :to="managementRoute">{{ managementLabel }} <ArrowRightIcon aria-hidden="true" /></RouterLink>
              </div>
            </section>
          </div>
          <div v-else class="community-empty community-updates-empty">
            <UsersIcon aria-hidden="true" />
            <p>{{ selectedCommunityArea === 'all' ? 'Todavía no hay información pública para estas áreas.' : `No hay contenido público en el área ${communityAreas.find(({ id }) => id === selectedCommunityArea)?.label || ''}.` }}</p>
            <RouterLink class="community-area-empty-action" :to="managementRoute">{{ managementLabel }} <ArrowRightIcon aria-hidden="true" /></RouterLink>
          </div>
        </div>
      </section>

      <ScrollAdSlot :ads="liveAds" placement="community" :slot-index="1" :slot-count="3" :slot-seed="1" />

      <ScrollAdSlot :ads="liveAds" placement="content" :slot-index="1" :slot-count="3" :slot-seed="3" />

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

      <ScrollAdSlot :ads="liveAds" placement="community" :slot-index="2" :slot-count="3" :slot-seed="2" />

      <ScrollAdSlot :ads="liveAds" placement="content" :slot-index="2" :slot-count="3" :slot-seed="5" />
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