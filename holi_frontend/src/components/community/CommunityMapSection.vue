<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ArrowRightIcon, CalendarDaysIcon, MapPinIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  locations: {
    type: Array,
    default: () => [],
  },
  selectedLocationId: {
    type: String,
    default: '',
  },
  selectedLocation: {
    type: Object,
    default: null,
  },
  selectedLocationEvents: {
    type: Array,
    default: () => [],
  },
  scrollZoom: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select-location', 'focus-near-me', 'toggle-scroll-zoom', 'open-profile'])
const publicMapElement = ref(null)
const publicMarkerLayer = ref(null)
const publicMap = ref(null)
const publicMarkers = new Map()
const markerPixelOffsets = new Map()
const markerConnectors = new Map()
const publicScrollZoom = ref(props.scrollZoom)

const selectorLocations = computed(() => props.locations.map((location) => ({
  ...location,
  eventCount: props.selectedLocationEvents.filter(({ locationId }) => locationId === location.id).length,
})))

function formatEventDate(value) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value))
}

function syncMapMarkerStyles(locationId) {
  publicMarkers.forEach((marker, id) => {
    const isActive = id === locationId
    marker.setStyle({
      fillColor: isActive ? '#c35f46' : '#28755b',
      radius: isActive ? 10 : 8,
      weight: 3,
    })
  })
}

function focusMapOnLocation(locationId) {
  const location = props.locations.find(({ id }) => id === locationId)
  if (!publicMap.value || !location) return

  const latitude = Number(location.latitude)
  const longitude = Number(location.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

  publicMap.value.flyTo([latitude, longitude], Math.max(publicMap.value.getZoom(), 13), { duration: 0.7 })
  requestAnimationFrame(() => {
    publicMap.value.invalidateSize()
    publicMapElement.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function syncCloseMarkerPositions() {
  if (!publicMap.value) return

  markerPixelOffsets.forEach(({ latitude, longitude, offsetX, offsetY }, locationId) => {
    const marker = publicMarkers.get(locationId)
    if (!marker) return

    const origin = L.latLng(latitude, longitude)
    const displayPoint = publicMap.value.latLngToLayerPoint(origin).add(L.point(offsetX, offsetY))
    const displayLocation = publicMap.value.layerPointToLatLng(displayPoint)
    marker.setLatLng(displayLocation)
    markerConnectors.get(locationId)?.setLatLngs([origin, displayLocation])
  })
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
  const locationEvents = props.selectedLocationEvents.length
    ? props.selectedLocationEvents.filter(({ locationId }) => locationId === location.id)
    : []
  const count = locationEvents.length
  activityCount.textContent = `${count} ${count === 1 ? 'próxima actividad' : 'próximas actividades'}`
  popup.append(title, address, activityCount)

  const nextEvent = props.selectedLocationEvents.find(({ locationId }) => locationId === location.id)
  if (nextEvent) {
    const next = document.createElement('span')
    next.className = 'community-map-popup-next'
    next.textContent = `Próxima: ${nextEvent.title} · ${formatEventDate(nextEvent.startsAt)}`
    popup.append(next)
  }

  const actions = document.createElement('div')
  actions.className = 'community-map-popup-actions'

  const profileLink = document.createElement('a')
  profileLink.className = 'community-map-popup-profile'
  profileLink.href = '#'
  profileLink.textContent = 'Ver perfil'
  profileLink.setAttribute('aria-label', `Ver perfil de ${location.name}`)
  profileLink.addEventListener('click', (event) => {
    event.preventDefault()
    emit('open-profile', location.id)
  })

  const directions = document.createElement('a')
  directions.className = 'community-map-popup-directions'
  directions.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`
  directions.target = '_blank'
  directions.rel = 'noopener noreferrer'
  directions.textContent = 'Cómo llegar'

  actions.append(profileLink, directions)
  popup.append(actions)
  return popup
}

function renderPublicMap() {
  if (!publicMapElement.value) return

  const validLocations = props.locations.filter(({ latitude, longitude }) => (
    Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
      && Number(latitude) >= -90 && Number(latitude) <= 90
      && Number(longitude) >= -180 && Number(longitude) <= 180
  ))

  const first = validLocations[0] || { latitude: 19.4326, longitude: -99.1332 }

  if (!publicMap.value) {
    publicMap.value = L.map(publicMapElement.value, {
      scrollWheelZoom: publicScrollZoom.value,
    }).setView([first.latitude, first.longitude], validLocations.length ? 11 : 5)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(publicMap.value)

    publicMarkerLayer.value = L.layerGroup().addTo(publicMap.value)
    publicMap.value.on('zoomend moveend', syncCloseMarkerPositions)
  }

  publicMarkerLayer.value.clearLayers()
  publicMarkers.clear()
  markerPixelOffsets.clear()
  markerConnectors.clear()

  const closeLocationGroups = []
  validLocations.forEach((location) => {
    const group = closeLocationGroups.find(({ locations: groupLocations }) => groupLocations.some((candidate) => {
      const latitudeDistance = Math.abs(Number(candidate.latitude) - Number(location.latitude)) * 111320
      const longitudeDistance = Math.abs(Number(candidate.longitude) - Number(location.longitude))
        * 111320 * Math.cos((Number(location.latitude) * Math.PI) / 180)
      return Math.hypot(latitudeDistance, longitudeDistance) < 30
    }))

    if (group) {
      group.locations.push(location)
    } else {
      closeLocationGroups.push({ locations: [location] })
    }
  })

  closeLocationGroups.filter(({ locations }) => locations.length > 1).forEach(({ locations }) => {
    locations.forEach((location, locationIndex) => {
      const angle = (-Math.PI / 2) + ((2 * Math.PI * locationIndex) / locations.length)
      markerPixelOffsets.set(location.id, {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        offsetX: Math.cos(angle) * 20,
        offsetY: Math.sin(angle) * 20,
      })
    })
  })

  markerPixelOffsets.forEach(({ latitude, longitude }, locationId) => {
    const connector = L.polyline([[latitude, longitude], [latitude, longitude]], {
      color: '#355f4d',
      weight: 1.5,
      opacity: 0.8,
      interactive: false,
    }).addTo(publicMarkerLayer.value)
    markerConnectors.set(locationId, connector)
  })

  validLocations.forEach((location) => {
    const marker = L.circleMarker([location.latitude, location.longitude], {
      radius: location.id === props.selectedLocationId ? 10 : 8,
      color: '#ffffff',
      weight: 3,
      fillColor: location.id === props.selectedLocationId ? '#c35f46' : '#28755b',
      fillOpacity: 1,
    }).addTo(publicMarkerLayer.value)

    marker.bindTooltip(location.name, {
      permanent: true,
      direction: 'top',
      offset: [0, -9],
      className: 'community-marker-label',
    })

    marker.bindPopup(createLocationPopup(location))
    marker.on('click', () => {
      emit('open-profile', location.id)
    })
    marker.on('popupopen', () => {
      emit('select-location', { locationId: location.id, focusMap: false })
    })
    publicMarkers.set(location.id, marker)
  })

  if (validLocations.length > 1) {
    publicMap.value.fitBounds(validLocations.map(({ latitude, longitude }) => [Number(latitude), Number(longitude)]), {
      padding: [34, 34],
      maxZoom: 14,
    })
  } else if (validLocations.length === 1) {
    publicMap.value.setView([Number(first.latitude), Number(first.longitude)], 13)
  }

  syncCloseMarkerPositions()

  if (props.selectedLocationId) {
    syncMapMarkerStyles(props.selectedLocationId)
  }

  publicMap.value.invalidateSize()
  publicMap.value.scrollWheelZoom[publicScrollZoom.value ? 'enable' : 'disable']()
}

async function focusNearSelection() {
  const location = props.locations.find(({ id }) => id === props.selectedLocationId)
  if (!location || !publicMap.value) return

  const latitude = Number(location.latitude)
  const longitude = Number(location.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 5000,
      })
    })

    const userLocation = { lat: position.coords.latitude, lng: position.coords.longitude }
    const bounds = L.latLngBounds(
      [[userLocation.lat, userLocation.lng], [latitude, longitude]],
    ).pad(0.35)
    publicMap.value.fitBounds(bounds, { padding: [36, 36], maxZoom: 13 })
  } catch {
    publicMap.value.flyTo([latitude, longitude], Math.max(publicMap.value.getZoom(), 12), { duration: 0.4 })
  }
}

function togglePublicScrollZoom() {
  publicScrollZoom.value = !publicScrollZoom.value
  emit('toggle-scroll-zoom', publicScrollZoom.value)
  if (publicMap.value) {
    publicMap.value.scrollWheelZoom[publicScrollZoom.value ? 'enable' : 'disable']()
  }
}

watch(() => props.locations, () => {
  nextTick(() => renderPublicMap())
}, { deep: true, immediate: true })

watch(() => props.selectedLocationId, (locationId) => {
  if (!locationId) return
  syncMapMarkerStyles(locationId)
  focusMapOnLocation(locationId)
}, { immediate: true })

watch(() => props.scrollZoom, (value) => {
  publicScrollZoom.value = value
  if (publicMap.value) {
    publicMap.value.scrollWheelZoom[value ? 'enable' : 'disable']()
  }
})

onBeforeUnmount(() => {
  publicMap.value?.remove()
})
</script>

<template>
  <section class="community-map-column" aria-label="Mapa de congregaciones y actividades">
    <div class="community-map-shell">
      <div class="community-map-toolbar">
        <div class="community-map-toolbar-copy">
          <p class="community-eyebrow">SEDES ACTIVAS</p>
          <h3>Explora congregaciones</h3>
        </div>
        <div class="community-map-toolbar-controls" aria-label="Controles del mapa">
          <button class="community-map-control" type="button" @click="focusNearSelection">Centrar cerca de ti</button>
          <button class="community-map-control" type="button" @click="togglePublicScrollZoom">{{ publicScrollZoom ? 'Zoom rueda: on' : 'Zoom rueda: off' }}</button>
        </div>
      </div>

      <div v-if="selectorLocations.length" class="community-map-selector" aria-label="Selector de congregaciones del mapa">
        <button
          v-for="location in selectorLocations"
          :key="location.id"
          type="button"
          class="community-map-selector-item"
          :class="{ active: selectedLocationId === location.id }"
          @click="emit('select-location', { locationId: location.id, focusMap: true })"
        >
          <span class="community-map-selector-badge"><MapPinIcon aria-hidden="true" /></span>
          <span class="community-map-selector-copy">
            <strong>{{ location.name }}</strong>
            <small>{{ location.city }}</small>
          </span>
          <span class="community-map-selector-pill">{{ location.eventCount || 0 }}</span>
        </button>
      </div>

      <div class="community-map-frame">
        <div ref="publicMapElement" class="community-map-canvas" aria-label="Mapa Leaflet de ubicaciones con actividades"></div>
        <div v-if="!locations.some(({ latitude, longitude }) => Number.isFinite(Number(latitude)) && Number(latitude) >= -90 && Number(latitude) <= 90 && Number.isFinite(Number(longitude)) && Number(longitude) >= -180 && Number(longitude) <= 180)" class="community-map-empty">
          <MapPinIcon aria-hidden="true" /><span>{{ selectedLocationId ? 'Esta congregación aún no tiene coordenadas disponibles.' : 'El mapa mostrará las ubicaciones cuando haya congregaciones activas con coordenadas.' }}</span>
        </div>
      </div>
    </div>

    <article v-if="selectedLocation" class="community-location-summary">
      <div class="community-location-summary-heading">
        <span class="community-location-pin"><MapPinIcon aria-hidden="true" /></span>
        <div>
          <p class="community-eyebrow">UBICACIÓN SELECCIONADA</p>
          <h3>{{ selectedLocation.name }}</h3>
        </div>
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
        <button class="community-profile-link" type="button" @click="emit('open-profile', selectedLocation.id)">
          Ver perfil completo
        </button>
      </div>
    </article>

    <div v-else class="community-location-summary community-location-summary-empty">
      <MapPinIcon aria-hidden="true" />
      <p>Las ubicaciones disponibles aparecerán aquí cuando sus congregaciones publiquen actividades.</p>
    </div>
  </section>
</template>

<style scoped>
.community-map-column {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.community-map-shell {
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(244,248,239,0.96));
  border: 1px solid rgba(177, 194, 170, 0.7);
  border-radius: 22px;
  padding: 16px;
  box-shadow: 0 22px 40px rgba(33, 57, 46, 0.08);
}

.community-map-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.community-map-toolbar-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.community-map-toolbar-copy h3 {
  margin: 0;
  color: #1d382d;
  font-size: 1.15rem;
}

.community-map-toolbar-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.community-map-control {
  border: 1px solid rgba(52, 93, 74, 0.18);
  background: rgba(255, 255, 255, 0.94);
  color: #234b3a;
  border-radius: 999px;
  padding: 8px 12px;
  font: 700 12px/1.2 'Manrope', sans-serif;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.community-map-control:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(29, 84, 67, 0.12);
  border-color: rgba(37, 89, 68, 0.26);
}

.community-map-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.community-map-selector-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 180px;
  min-width: 0;
  border: 1px solid rgba(152,170,151,0.9);
  border-radius: 14px;
  background: rgba(255,255,255,0.7);
  color: #1f3a2d;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.community-map-selector-item:hover,
.community-map-selector-item.active {
  transform: translateY(-2px);
  background: linear-gradient(135deg, rgba(233,241,224,0.9), rgba(252,255,249,0.96));
  border-color: rgba(45, 105, 82, 0.38);
  box-shadow: 0 12px 22px rgba(30, 75, 63, 0.12);
}

.community-map-selector-badge {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 91, 69, 0.08);
  color: #1e5a45;
  flex-shrink: 0;
}

.community-map-selector-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}

.community-map-selector-copy strong {
  font-size: 0.87rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.community-map-selector-copy small {
  color: #5c6d5d;
  font-size: 0.7rem;
}

.community-map-selector-pill {
  min-width: 26px;
  height: 26px;
  border-radius: 999px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(31, 90, 67, 0.12);
  color: #173c34;
  font-weight: 800;
  font-size: 0.7rem;
}

.community-map-frame {
  position: relative;
  display: block;
  min-height: 420px;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(176, 196, 168, 0.9);
  background: linear-gradient(180deg, #edf5ef 0%, #f4f7f0 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7), 0 16px 32px rgba(18, 53, 39, 0.08);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.community-map-frame:hover {
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7), 0 20px 36px rgba(18, 53, 39, 0.12);
}

.community-map-canvas {
  width: 100%;
  min-height: 420px;
  height: 420px;
  background: #eef5ef;
}

.community-map-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.75);
  color: #4c5e4d;
  padding: 24px;
  font-size: 0.96rem;
}

.community-location-summary {
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(242,247,239,0.96));
  border: 1px solid rgba(208, 220, 200, 0.9);
  border-radius: 18px;
  padding: 18px 18px 16px;
  box-shadow: 0 14px 28px rgba(29, 60, 51, 0.05);
}

.community-location-summary-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.community-location-pin {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(34,94,72,0.14), rgba(34,94,72,0.04));
  color: #214f3d;
  border: 1px solid rgba(31, 90, 67, 0.16);
  border-radius: 10px;
}

.community-location-summary h3 {
  margin: 0;
  font-size: 1.15rem;
  color: #233b2d;
}

.community-location-count {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #3f664d;
  background: rgba(182, 214, 189, 0.28);
  border-radius: 999px;
  padding: 6px 10px;
}

.community-location-address {
  margin: 10px 0 0;
  color: #4b5a4d;
  font-size: 0.95rem;
}

.community-location-next {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 0;
  color: #2b6a4d;
  font-weight: 700;
}

.community-location-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.community-directions-link,
.community-profile-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  padding: 9px 14px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.community-directions-link:hover,
.community-profile-link:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(19, 54, 41, 0.12);
}

.community-directions-link {
  background: linear-gradient(135deg, #1d5d4f, #163d36);
  color: white;
}

.community-profile-link {
  background: linear-gradient(135deg, rgba(236,240,229,0.95), rgba(210,220,204,0.9));
  border: 1px solid rgba(166,182,160,0.9);
  color: #214d3d;
}

.community-location-summary-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #455649;
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(242,247,239,0.96));
  border: 1px solid rgba(208,220,200,0.9);
  border-radius: 18px;
  padding: 18px;
}

.community-map-popup {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 220px;
  color: #24392b;
}

.community-map-popup-address,
.community-map-popup-next {
  color: #4d5f4d;
  font-size: 0.82rem;
}

.community-map-popup-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.community-map-popup-profile,
.community-map-popup-directions {
  text-decoration: none;
  font-weight: 700;
  color: #1f574a;
}

.community-marker-label {
  background: rgba(255,255,255,0.96);
  border: 1px solid rgba(16,49,35,0.08);
  color: #1d2e26;
  border-radius: 10px;
  padding: 6px 8px;
  font-size: 0.72rem;
  font-weight: 700;
  box-shadow: 0 8px 16px rgba(22,35,30,0.12);
}
</style>
