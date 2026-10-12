<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ArrowPathIcon, CalendarDaysIcon, ChartBarIcon, CheckIcon, ChevronDownIcon, Cog6ToothIcon, CubeIcon, EllipsisHorizontalIcon, GlobeAltIcon, MapPinIcon, PencilSquareIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import SubscriptionModuleView from '../components/SubscriptionModuleView.vue'
import { filterLocations, getBrowserCoordinates } from '../modules/locationFilters.js'
import { assignEventToLocation, createModuleRecord, deleteModuleRecord, getModuleData, reserveLocation, updateModuleRecord } from '../services/moduleService'
import { useAuthStore } from '../stores/auth'

const props = defineProps({
  module: {
    type: Object,
    required: true,
  },
})

const auth = useAuthStore()
const records = ref([])
const locationChoices = ref([])
const events = ref([])
const reservations = ref([])
const selectedLocationId = ref(null)
const searchCenter = ref(null)
const userLocation = ref(null)
const searchRadiusKm = ref('')
const selectedServiceType = ref('')
const geolocationError = ref('')
const locating = ref(false)
const loading = ref(true)
const saving = ref(false)
const editorScrollZoom = ref(false)
const selectingEditorPoint = ref(false)
const error = ref('')
const notice = ref('')
const attendanceSearch = ref('')
const attendanceStatusFilter = ref('all')
const resourcesSearch = ref('')
const resourcesStatusFilter = ref('all')
const reportsSearch = ref('')
const reportsStatusFilter = ref('all')
const settingsSearch = ref('')
const settingsStatusFilter = ref('all')
const action = ref('')
const editorOpen = ref(false)
const editorId = ref(null)
const locatingEditor = ref(false)
const editorLocationError = ref('')
const recordForm = reactive({})
const mapElement = ref(null)
const editorMapElement = ref(null)
let map
let markerLayer
let searchLayer
let editorMap
let editorMarker
let editorInitialView
const locationMarkers = new Map()
const editorCoordinatesValid = computed(() => {
  const latitude = Number(recordForm.latitude)
  const longitude = Number(recordForm.longitude)
  return recordForm.latitude !== '' && recordForm.longitude !== ''
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
})

const selectedLocation = computed(() => records.value.find(({ id }) => id === selectedLocationId.value))
const isCustomerSubscription = computed(() => props.module.id === 'subscription' && auth.user?.role !== 'superadmin')
const isAttendanceModule = computed(() => props.module.id === 'attendance')
const isResourcesModule = computed(() => props.module.id === 'resources')
const isReportsModule = computed(() => props.module.id === 'reports')
const isSettingsModule = computed(() => props.module.id === 'settings')
const isCommunityPublishableModule = computed(() => ['groups', 'attendance', 'resources', 'communications', 'reports', 'settings'].includes(props.module.id))
const publicModuleRecordCount = computed(() => records.value.filter(({ isPublic }) => Boolean(isPublic)).length)
const canDelete = computed(() => ['superadmin', 'admin'].includes(auth.user?.role))
const canWrite = computed(() => canDelete.value || (auth.user?.role === 'operator' && ['reservations', 'attendance'].includes(props.module.id)))
const moduleFields = computed(() => {
  if (props.module.id === 'events') return [
    { key: 'title', label: 'Nombre', required: true }, { key: 'description', label: 'Descripción', type: 'textarea' },
    { key: 'status', label: 'Estado', required: true, default: 'scheduled' },
    { key: 'startsAt', label: 'Inicio', type: 'datetime-local', required: true }, { key: 'endsAt', label: 'Fin', type: 'datetime-local', required: true },
    { key: 'locationId', label: 'Sede', type: 'location', required: true },
  ]
  if (props.module.id === 'members') return [
    { key: 'firstName', label: 'Nombre', required: true }, { key: 'lastName', label: 'Apellido', required: true },
    { key: 'email', label: 'Correo', type: 'email', required: true }, { key: 'status', label: 'Estado', required: true, default: 'active' },
  ]
  if (props.module.id === 'locations') return [
    { key: 'title', label: 'Nombre de la sede', required: true }, { key: 'city', label: 'Ciudad', required: true },
    { key: 'address', label: 'Dirección', required: true }, { key: 'latitude', label: 'Latitud', type: 'number', step: 'any', required: true },
    { key: 'longitude', label: 'Longitud', type: 'number', step: 'any', required: true },
  ]
  if (props.module.id === 'reservations') return [
    { key: 'title', label: 'Actividad', required: true }, { key: 'contactName', label: 'Responsable', required: true },
    { key: 'startsAt', label: 'Inicio', type: 'datetime-local', required: true }, { key: 'endsAt', label: 'Fin', type: 'datetime-local', required: true },
    { key: 'locationId', label: 'Sede', type: 'location', required: true }, { key: 'notes', label: 'Notas', type: 'textarea' },
  ]
  if (props.module.id === 'attendance') return [
    { key: 'title', label: 'Reunión o actividad', required: true, placeholder: 'Ej. Servicio dominical' },
    { key: 'status', label: 'Estado de la sesión', type: 'options', options: ['Realizada', 'Pendiente', 'Cancelada'], required: true },
    { key: 'recordDate', label: 'Fecha de la sesión', type: 'date', required: true },
    { key: 'detail', label: 'Asistentes (cantidad o nota)', placeholder: 'Ej. 24 personas' },
    { key: 'description', label: 'Observaciones', type: 'textarea', placeholder: 'Anota contexto útil sobre esta sesión.' },
  ]
  if (props.module.id === 'resources') return [
    { key: 'title', label: 'Nombre del recurso', required: true, placeholder: 'Ej. Proyector portátil' },
    { key: 'status', label: 'Disponibilidad', type: 'options', options: ['Disponible', 'En uso', 'Reservado', 'Mantenimiento'], required: true },
    { key: 'detail', label: 'Cantidad y ubicación', placeholder: 'Ej. 2 unidades · Almacén principal' },
    { key: 'description', label: 'Descripción o condición', type: 'textarea', placeholder: 'Anota características, condición o instrucciones relevantes.' },
    { key: 'recordDate', label: 'Fecha de revisión', type: 'date' },
  ]
  if (props.module.id === 'reports') return [
    { key: 'title', label: 'Título del informe', required: true, placeholder: 'Ej. Resumen de actividades del mes' },
    { key: 'status', label: 'Etapa', type: 'options', options: ['Borrador', 'En revisión', 'Finalizado'], required: true },
    { key: 'recordDate', label: 'Periodo o fecha del informe', type: 'date', required: true },
    { key: 'description', label: 'Objetivo y hallazgos', type: 'textarea', placeholder: '¿Qué revisa este informe y cuáles son sus principales conclusiones?' },
    { key: 'detail', label: 'Resumen o indicadores', type: 'textarea', placeholder: 'Agrega cifras o datos relevantes como texto.' },
  ]
  if (props.module.id === 'settings') return [
    { key: 'title', label: 'Nombre de la preferencia', required: true, placeholder: 'Ej. Horario de atención' },
    { key: 'status', label: 'Estado', type: 'options', options: ['Activa', 'Pendiente de revisión', 'Inactiva'], required: true },
    { key: 'detail', label: 'Valor o selección', placeholder: 'Ej. Lunes a viernes, 9:00 a 17:00' },
    { key: 'description', label: 'Descripción', type: 'textarea', placeholder: 'Indica qué controla esta preferencia y a quién aplica.' },
    { key: 'recordDate', label: 'Fecha de revisión', type: 'date' },
  ]
  return [
    { key: 'title', label: 'Nombre', required: true }, { key: 'status', label: 'Estado', required: true },
    { key: 'description', label: 'Descripción', type: 'textarea' }, { key: 'detail', label: 'Detalle', type: 'textarea' },
    { key: 'recordDate', label: 'Fecha', type: 'date' },
  ]
})
const attendanceSummary = computed(() => {
  const pending = records.value.filter(({ status }) => /pendiente|programad|por registrar/i.test(status || '')).length
  const attendeeCount = records.value.reduce((total, { detail }) => {
    const match = typeof detail === 'string' ? detail.trim().match(/^(\d+)\s*(?:personas?|asistentes?)?$/i) : null
    return total + (match ? Number(match[1]) : 0)
  }, 0)
  return { sessions: records.value.length, pending, attendeeCount }
})
const attendanceStatusOptions = computed(() => [...new Set(records.value.map(({ status }) => status).filter(Boolean))]
  .sort((first, second) => first.localeCompare(second, 'es-MX')))
const resourcesSummary = computed(() => ({
  total: records.value.length,
  available: records.value.filter(({ status }) => /disponible/i.test(status || '')).length,
  attention: records.value.filter(({ status }) => /mantenimiento|reparaci|dañad|fuera de servicio/i.test(status || '')).length,
}))
const resourceStatusOptions = computed(() => [...new Set(records.value.map(({ status }) => status).filter(Boolean))]
  .sort((first, second) => first.localeCompare(second, 'es-MX')))
const reportsSummary = computed(() => ({
  total: records.value.length,
  inProgress: records.value.filter(({ status }) => /borrador|revisi|pendiente|preparaci/i.test(status || '')).length,
  finalized: records.value.filter(({ status }) => /finaliz|aprob|complet|publicad/i.test(status || '')).length,
}))
const reportStatusOptions = computed(() => [...new Set(records.value.map(({ status }) => status).filter(Boolean))]
  .sort((first, second) => first.localeCompare(second, 'es-MX')))
const settingsSummary = computed(() => ({
  total: records.value.length,
  active: records.value.filter(({ status }) => /activa|habilitad|vigente/i.test(status || '') && !/inactiva|deshabilitada/i.test(status || '')).length,
  review: records.value.filter(({ status }) => /pendiente|revisi|por validar/i.test(status || '')).length,
}))
const settingsStatusOptions = computed(() => [...new Set(records.value.map(({ status }) => status).filter(Boolean))]
  .sort((first, second) => first.localeCompare(second, 'es-MX')))
const visibleModuleRecords = computed(() => {
  if (!isAttendanceModule.value && !isResourcesModule.value && !isReportsModule.value && !isSettingsModule.value) return records.value
  const query = (isAttendanceModule.value ? attendanceSearch.value : isResourcesModule.value ? resourcesSearch.value : isReportsModule.value ? reportsSearch.value : settingsSearch.value).trim().toLocaleLowerCase('es-MX')
  const statusFilter = isAttendanceModule.value ? attendanceStatusFilter.value : isResourcesModule.value ? resourcesStatusFilter.value : isReportsModule.value ? reportsStatusFilter.value : settingsStatusFilter.value
  return [...records.value]
    .filter((record) => {
      const matchesQuery = !query || [record.title, record.description, record.detail, record.status]
        .some((value) => String(value || '').toLocaleLowerCase('es-MX').includes(query))
      const matchesStatus = statusFilter === 'all' || record.status === statusFilter
      return matchesQuery && matchesStatus
    })
    .sort((first, second) => {
      return (Date.parse(second.recordDate) || 0) - (Date.parse(first.recordDate) || 0)
    })
})
const serviceTypes = computed(() => [...new Set(records.value.map(({ serviceType }) => serviceType).filter(Boolean))].sort())
const visibleLocations = computed(() => filterLocations(records.value, {
  center: searchCenter.value,
  radiusKm: searchRadiusKm.value,
  serviceType: selectedServiceType.value,
}))
const mappableLocations = computed(() => visibleLocations.value.filter((location) => {
  const latitude = Number(location.latitude)
  const longitude = Number(location.longitude)
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}))
const bookingForm = reactive({ title: '', contactName: '', startsAt: '', endsAt: '', notes: '' })
const eventForm = reactive({ eventId: '' })

function errorMessage(problem) {
  return problem.response?.data?.error?.message || problem.message || 'No se pudo completar la solicitud.'
}

async function loadModule() {
  if (isCustomerSubscription.value) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const data = await getModuleData(props.module.id)
    records.value = data.records
    events.value = data.events || []
    reservations.value = data.reservations || []
    if (['events', 'reservations'].includes(props.module.id)) {
      const locations = await getModuleData('locations')
      locationChoices.value = locations.records
    } else {
      locationChoices.value = []
    }
    if (!records.value.some(({ id }) => id === selectedLocationId.value)) {
      selectedLocationId.value = records.value[0]?.id || null
    }
    if (!eventForm.eventId && events.value.length) eventForm.eventId = events.value[0].id
    await nextTick()
    renderMap()
  } catch (problem) {
    error.value = errorMessage(problem)
  } finally {
    loading.value = false
  }
}

function localDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function openRecordEditor(record = null) {
  editorId.value = record?.id || null
  for (const field of moduleFields.value) {
    let value = record?.[field.key] ?? field.default ?? ''
    if (isAttendanceModule.value && !record && field.key === 'status') value = 'Realizada'
    if (isAttendanceModule.value && !record && field.key === 'recordDate') {
      const today = new Date()
      value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    }
    if (isResourcesModule.value && !record && field.key === 'status') value = 'Disponible'
    if (isReportsModule.value && !record && field.key === 'status') value = 'Borrador'
    if (isReportsModule.value && !record && field.key === 'recordDate') {
      const today = new Date()
      value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    }
    if (isSettingsModule.value && !record && field.key === 'status') value = 'Activa'
    if (isSettingsModule.value && !record && field.key === 'recordDate') {
      const today = new Date()
      value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    }
    if (field.type === 'datetime-local') value = localDateTime(value)
    if (field.key === 'latitude' || field.key === 'longitude') value = value === '' ? '' : String(value)
    recordForm[field.key] = value
  }
  recordForm.isPublic = Boolean(record?.isPublic)
  if (moduleFields.value.some(({ key }) => key === 'locationId') && !recordForm.locationId) {
    recordForm.locationId = locationChoices.value[0]?.id || ''
  }
  editorOpen.value = true
  error.value = ''
  editorLocationError.value = ''
}

async function setModuleRecordVisibility(record, isPublic) {
  if (!canWrite.value || !isCommunityPublishableModule.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await updateModuleRecord(props.module.id, record.id, {
      title: record.title,
      status: record.status,
      description: record.description,
      detail: record.detail,
      recordDate: record.recordDate,
      isPublic,
    })
    notice.value = isPublic ? 'El registro se comparte en Comunidad.' : 'El registro dejó de mostrarse en Comunidad.'
    await loadModule()
  } catch (problem) {
    error.value = errorMessage(problem)
  } finally {
    saving.value = false
  }
}

function prepareLocationSlideLeave() {
  if (!editorOpen.value || !map) return
  map.remove()
  map = undefined
  markerLayer = undefined
  searchLayer = undefined
  locationMarkers.clear()
}

function finishLocationSlideEnter() {
  if (editorOpen.value) initializeEditorMap()
  else renderMap()
}

function updateEditorCoordinates(latitude, longitude) {
  recordForm.latitude = Number(latitude).toFixed(6)
  recordForm.longitude = Number(longitude).toFixed(6)
  const coordinates = [Number(recordForm.latitude), Number(recordForm.longitude)]
  if (editorMap) {
    editorMap.setView(coordinates, Math.max(editorMap.getZoom(), 14))
    if (editorMarker) editorMarker.setLatLng(coordinates)
    else editorMarker = L.marker(coordinates, { draggable: true }).addTo(editorMap)
    editorMarker.off('dragend')
    editorMarker.on('dragend', ({ target }) => {
      const point = target.getLatLng()
      recordForm.latitude = point.lat.toFixed(6)
      recordForm.longitude = point.lng.toFixed(6)
    })
  }
}

function toggleEditorScrollZoom() {
  editorScrollZoom.value = !editorScrollZoom.value
  if (editorScrollZoom.value) editorMap?.scrollWheelZoom.enable()
  else editorMap?.scrollWheelZoom.disable()
}

function centerEditorMapOnMarker() {
  if (!editorMap || !editorCoordinatesValid.value) return
  editorMap.setView([Number(recordForm.latitude), Number(recordForm.longitude)], Math.max(editorMap.getZoom(), 15))
}

function resetEditorMapView() {
  if (!editorMap || !editorInitialView) return
  editorMap.setView(editorInitialView.center, editorInitialView.zoom)
}

function initializeEditorMap() {
  if (!editorOpen.value || props.module.id !== 'locations' || !editorMapElement.value) return
  const latitude = Number(recordForm.latitude)
  const longitude = Number(recordForm.longitude)
  const hasCoordinates = recordForm.latitude !== '' && recordForm.longitude !== ''
    && Number.isFinite(latitude) && Number.isFinite(longitude)
  const fallback = records.value[0]
  const center = hasCoordinates
    ? [latitude, longitude]
    : fallback ? [fallback.latitude, fallback.longitude] : [19.4326, -99.1332]
  const initialZoom = hasCoordinates ? 14 : fallback ? 12 : 10

  if (!editorMap) {
    editorInitialView = { center, zoom: initialZoom }
    editorMap = L.map(editorMapElement.value, { scrollWheelZoom: editorScrollZoom.value }).setView(center, initialZoom)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(editorMap)
    editorMap.on('click', ({ latlng }) => {
      if (!selectingEditorPoint.value) return
      updateEditorCoordinates(latlng.lat, latlng.lng)
      selectingEditorPoint.value = false
    })
  } else {
    editorInitialView = { center, zoom: initialZoom }
    editorMap.setView(center, initialZoom)
  }

  if (hasCoordinates) updateEditorCoordinates(latitude, longitude)
  editorMap.invalidateSize()
}

async function locateEditorLocation() {
  locatingEditor.value = true
  editorLocationError.value = ''
  try {
    const coordinates = await getBrowserCoordinates(globalThis.navigator?.geolocation)
    updateEditorCoordinates(coordinates.lat, coordinates.lng)
  } catch (problem) {
    editorLocationError.value = problem.code === 1
      ? 'Permiso de ubicación denegado. Selecciona el punto haciendo clic en el mapa o introduce las coordenadas.'
      : 'No se pudo obtener la ubicación. Selecciona el punto haciendo clic en el mapa o introduce las coordenadas.'
  } finally {
    locatingEditor.value = false
  }
}

function closeRecordEditor() {
  editorOpen.value = false
  editorLocationError.value = ''
  editorMap?.remove()
  editorMap = undefined
  editorMarker = undefined
  editorInitialView = undefined
  editorScrollZoom.value = false
  selectingEditorPoint.value = false
}

async function saveRecord() {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    const payload = { ...recordForm }
    for (const key of ['startsAt', 'endsAt']) if (payload[key]) payload[key] = new Date(payload[key]).toISOString()
    if (editorId.value) await updateModuleRecord(props.module.id, editorId.value, payload)
    else await createModuleRecord(props.module.id, payload)
    closeRecordEditor()
    notice.value = editorId.value ? 'Cambios guardados.' : 'Registro creado.'
    await loadModule()
  } catch (problem) {
    error.value = errorMessage(problem)
  } finally {
    saving.value = false
  }
}

async function removeRecord(record) {
  if (!canDelete.value || !globalThis.confirm?.(`¿Eliminar "${record.title}"?`)) return
  error.value = ''
  try {
    await deleteModuleRecord(props.module.id, record.id)
    notice.value = 'Registro eliminado.'
    await loadModule()
  } catch (problem) {
    error.value = errorMessage(problem)
  }
}

function renderMap() {
  if (props.module.id !== 'locations' || !mapElement.value) return
  const hasCoordinates = mappableLocations.value.length > 0
  const center = hasCoordinates
    ? [Number(mappableLocations.value[0].latitude), Number(mappableLocations.value[0].longitude)]
    : [19.4326, -99.1332]
  if (!map) {
    map = L.map(mapElement.value, { scrollWheelZoom: false }).setView(center, hasCoordinates ? 12 : 5)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    markerLayer = L.layerGroup().addTo(map)
    searchLayer = L.layerGroup().addTo(map)
    map.on('click', ({ latlng }) => {
      searchCenter.value = { lat: latlng.lat, lng: latlng.lng }
      userLocation.value = null
    })
    if (hasCoordinates) {
      const bounds = L.latLngBounds(mappableLocations.value.map(({ latitude, longitude }) => [Number(latitude), Number(longitude)]))
      if (bounds.isValid() && mappableLocations.value.length > 1) {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 })
      } else {
        map.setView(center, 14)
      }
    }
  }
  markerLayer.clearLayers()
  locationMarkers.clear()
  mappableLocations.value.forEach((location) => {
    const marker = L.circleMarker([location.latitude, location.longitude], {
      radius: selectedLocationId.value === location.id ? 10 : 8,
      color: '#ffffff',
      weight: 3,
      fillColor: selectedLocationId.value === location.id ? '#d86e51' : '#23755c',
      fillOpacity: 1,
    }).addTo(markerLayer)
    marker.bindTooltip(location.title, {
      permanent: true,
      direction: 'top',
      offset: [0, -9],
      className: 'location-marker-label',
    })
    marker.bindPopup(createLocationPopup(location))
    marker.on('click', () => { selectedLocationId.value = location.id })
    locationMarkers.set(location.id, marker)
  })
  renderSearchArea()
  map.invalidateSize()
}

function createLocationPopup(location) {
  const popup = document.createElement('div')
  popup.className = 'location-popup-content'
  const title = document.createElement('strong')
  title.textContent = location.title
  popup.append(title)

  const addressText = [location.address, location.city].filter(Boolean).join(', ') || location.description
  if (addressText) {
    const address = document.createElement('span')
    address.className = 'location-popup-address'
    address.textContent = addressText
    popup.append(address)
  }

  if (location.status) {
    const status = document.createElement('small')
    status.className = 'location-popup-status'
    status.textContent = location.status
    popup.append(status)
  }

  const coordinates = `${Number(location.latitude)},${Number(location.longitude)}`
  const directions = document.createElement('a')
  directions.className = 'location-popup-directions'
  directions.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordinates)}`
  directions.target = '_blank'
  directions.rel = 'noopener noreferrer'
  directions.textContent = 'Cómo llegar'
  directions.setAttribute('aria-label', `Cómo llegar a ${location.title} en Google Maps`)
  popup.append(directions)

  const reserveButton = document.createElement('button')
  reserveButton.type = 'button'
  reserveButton.className = 'location-popup-reserve'
  reserveButton.textContent = 'Reservar espacio'
  reserveButton.setAttribute('aria-label', `Reservar espacio en ${location.title}`)
  reserveButton.addEventListener('click', (event) => {
    event.stopPropagation()
    selectedLocationId.value = location.id
    setAction('reservation')
    map.closePopup()
  })
  popup.append(reserveButton)
  return popup
}

function renderSearchArea() {
  if (!map || !searchLayer) return
  searchLayer.clearLayers()

  if (!searchCenter.value) return
  const center = [searchCenter.value.lat, searchCenter.value.lng]
  const radius = Number(searchRadiusKm.value)
  if (Number.isFinite(radius) && radius > 0) {
    L.circle(center, { radius: radius * 1000, color: '#23755c', weight: 1, fillOpacity: 0.06 }).addTo(searchLayer)
  }
  L.circleMarker(center, {
    radius: 7,
    color: '#fff',
    weight: 2,
    fillColor: userLocation.value ? '#3979a8' : '#d86e51',
    fillOpacity: 1,
  }).bindTooltip(userLocation.value ? 'Mi ubicación' : 'Centro de búsqueda').addTo(searchLayer)
}

async function locateUser() {
  geolocationError.value = ''
  locating.value = true
  try {
    const location = await getBrowserCoordinates(globalThis.navigator?.geolocation)
    userLocation.value = location
    searchCenter.value = location
    map?.setView([location.lat, location.lng], 13)
  } catch (problem) {
    geolocationError.value = problem.code === 1
      ? 'Permiso de ubicación denegado. Puedes elegir el centro haciendo clic en el mapa.'
      : 'No se pudo obtener tu ubicación. Puedes elegir el centro haciendo clic en el mapa.'
  } finally {
    locating.value = false
  }
}

function resetMapFilters() {
  searchCenter.value = null
  userLocation.value = null
  searchRadiusKm.value = ''
  selectedServiceType.value = ''
  geolocationError.value = ''
}

function setAction(nextAction) {
  notice.value = ''
  error.value = ''
  action.value = nextAction
  if (nextAction === 'reservation') {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    startsAt.setMinutes(0, 0, 0)
    startsAt.setHours(10)
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000)
    const toLocalInput = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    bookingForm.title = ''
    bookingForm.contactName = ''
    bookingForm.startsAt = toLocalInput(startsAt)
    bookingForm.endsAt = toLocalInput(endsAt)
    bookingForm.notes = ''
  }
}

async function saveReservation() {
  if (saving.value || !selectedLocationId.value) return
  saving.value = true
  error.value = ''
  try {
    await reserveLocation(selectedLocationId.value, {
      ...bookingForm,
      startsAt: new Date(bookingForm.startsAt).toISOString(),
      endsAt: new Date(bookingForm.endsAt).toISOString(),
    })
    action.value = ''
    notice.value = 'Reserva guardada en la base de datos.'
    await loadModule()
  } catch (problem) {
    error.value = errorMessage(problem)
  } finally {
    saving.value = false
  }
}

async function saveAssignment() {
  saving.value = true
  error.value = ''
  try {
    await assignEventToLocation(eventForm.eventId, selectedLocationId.value)
    action.value = ''
    notice.value = 'Evento asignado a la sede.'
    await loadModule()
  } catch (problem) {
    error.value = errorMessage(problem)
  } finally {
    saving.value = false
  }
}

function displayDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

watch(() => props.module.id, () => {
  action.value = ''
  notice.value = ''
  resetMapFilters()
  if (map) {
    map.remove()
    map = undefined
    markerLayer = undefined
    searchLayer = undefined
  }
  loadModule()
})
watch(selectedLocationId, (locationId, previousLocationId) => {
  for (const [id, marker] of locationMarkers) {
    const selected = id === locationId
    marker.setStyle({
      radius: selected ? 10 : 8,
      fillColor: selected ? '#d86e51' : '#23755c',
    })
  }
  if (locationId && locationId !== previousLocationId) nextTick(() => map?.invalidateSize())
})
watch(visibleLocations, (locations) => {
  if (!locations.some(({ id }) => id === selectedLocationId.value)) {
    const nextLocationId = locations[0]?.id || null
    if (selectedLocationId.value !== nextLocationId) {
      selectedLocationId.value = nextLocationId
      action.value = ''
      error.value = ''
    }
  }
  nextTick(renderMap)
})
watch([searchCenter, searchRadiusKm], renderSearchArea)
onMounted(loadModule)
onBeforeUnmount(() => {
  map?.remove()
  editorMap?.remove()
})
</script>

<template>
  <section class="module-view">
    <div class="module-intro">
      <p class="eyebrow">{{ isAttendanceModule ? 'CONTROL DE SESIONES' : isResourcesModule ? 'INVENTARIO DE LA CONGREGACIÓN' : isReportsModule ? 'SEGUIMIENTO Y CONSULTA' : 'MÓDULO' }}</p>
      <h2>{{ module.label }}</h2>
      <p>{{ isAttendanceModule ? 'Registra cada reunión o actividad realizada, anota cuántas personas asistieron y consulta el historial por fecha.' : isResourcesModule ? 'Organiza el equipo y los materiales de tu congregación. Indica dónde están y si se pueden utilizar.' : isReportsModule ? 'Documenta resultados e indicadores de la congregación, sigue cada informe desde borrador hasta su cierre y consulta el historial por periodo.' : module.description }}</p>
    </div>

    <SubscriptionModuleView v-if="isCustomerSubscription" />

    <template v-else>
    <div v-if="error" class="module-alert" role="alert">
      <span>{{ error }}</span>
      <button class="icon-button" aria-label="Reintentar carga" @click="loadModule"><ArrowPathIcon /></button>
    </div>
    <div v-if="notice" class="module-notice" role="status"><CheckIcon />{{ notice }}</div>

    <form v-if="editorOpen && module.id !== 'locations'" class="record-editor" @submit.prevent="saveRecord">
      <div class="record-editor-heading">
        <div><p class="eyebrow">{{ editorId ? 'EDITAR REGISTRO' : 'NUEVO REGISTRO' }}</p><h3>{{ isAttendanceModule ? (editorId ? 'Actualizar asistencia' : 'Registrar asistencia') : isResourcesModule ? (editorId ? 'Actualizar recurso' : 'Agregar recurso al inventario') : isReportsModule ? (editorId ? 'Actualizar informe' : 'Crear informe') : `${editorId ? 'Actualizar' : 'Crear'} · ${module.label}` }}</h3></div>
        <button class="icon-button" type="button" aria-label="Cerrar formulario" @click="closeRecordEditor"><XMarkIcon /></button>
      </div>
      <p v-if="isAttendanceModule" class="attendance-form-guidance">Un registro representa una sesión. Anota el total como número para que el resumen pueda contabilizarlo.</p>
      <p v-if="isResourcesModule" class="attendance-form-guidance">Registra un tipo de recurso por elemento. Usa “Cantidad y ubicación” para indicar existencias y dónde encontrarlas.</p>
      <p v-if="isReportsModule" class="attendance-form-guidance">Un informe documenta un periodo o tema. Describe sus hallazgos, agrega indicadores en texto y actualiza su etapa conforme avance.</p>
      <label v-if="isCommunityPublishableModule" class="community-publish-field">
        <input v-model="recordForm.isPublic" type="checkbox" />
        <span><strong>Mostrar en Comunidad</strong><small>El título, la descripción, el detalle y la fecha serán visibles públicamente.</small></span>
      </label>
      <section v-if="module.id === 'locations'" class="location-picker" aria-label="Elegir ubicación de la sede">
        <div class="location-picker-toolbar">
          <div><strong>Ubicación de la sede</strong><span>Usa tu ubicación o selecciona un punto del mapa.</span></div>
        </div>
        <p v-if="editorLocationError" class="map-geolocation-error" role="alert">{{ editorLocationError }}</p>
        <div class="location-picker-map-frame">
          <div ref="editorMapElement" class="location-picker-map" :class="{ 'location-picker-map-selecting': selectingEditorPoint }" :aria-label="selectingEditorPoint ? 'Haz clic en el mapa para fijar la sede' : 'Mapa para ubicar la sede'"></div>
          <div class="location-picker-actions" aria-label="Controles del mapa" @click.stop>
            <button class="map-tool-button" type="button" :disabled="locatingEditor" title="Centrar el mapa en tu ubicación actual" @click="locateEditorLocation">
              <MapPinIcon />{{ locatingEditor ? 'Localizando…' : 'Mi ubicación' }}
            </button>
            <button class="map-tool-button" type="button" :aria-pressed="selectingEditorPoint" :title="selectingEditorPoint ? 'Cancelar selección de punto' : 'Seleccionar sede haciendo clic en el mapa'" @click="selectingEditorPoint = !selectingEditorPoint">
              <MapPinIcon />{{ selectingEditorPoint ? 'Cancelar punto' : 'Colocar pin' }}
            </button>
            <button class="map-tool-button" type="button" :disabled="!editorCoordinatesValid" title="Centrar el mapa en el pin de la sede" @click="centerEditorMapOnMarker">Centrar pin</button>
            <button class="map-tool-button" type="button" title="Restablecer la vista inicial del mapa" @click="resetEditorMapView"><ArrowPathIcon />Vista inicial</button>
            <button class="map-tool-button location-scroll-toggle" type="button" :aria-pressed="editorScrollZoom" :title="editorScrollZoom ? 'Desactivar zoom con la rueda del mouse' : 'Activar zoom con la rueda del mouse'" @click="toggleEditorScrollZoom">
              {{ editorScrollZoom ? 'Zoom rueda: activado' : 'Zoom rueda: desactivado' }}
            </button>
          </div>
        </div>
        <p v-if="selectingEditorPoint" class="location-picker-hint" role="status">Haz clic en el mapa para colocar el pin de la sede.</p>
        <p class="location-picker-coordinates" role="status">
          {{ recordForm.latitude && recordForm.longitude ? `Coordenadas: ${recordForm.latitude}, ${recordForm.longitude}` : 'Aún no se han definido coordenadas.' }}
        </p>
      </section>
      <div class="record-editor-fields">
        <label v-for="field in moduleFields" :key="field.key">
          {{ field.label }}
          <textarea v-if="field.type === 'textarea'" v-model="recordForm[field.key]" rows="3" :required="field.required" :placeholder="field.placeholder" />
          <select v-else-if="field.type === 'options'" v-model="recordForm[field.key]" :required="field.required">
            <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
            <option v-if="editorId && recordForm[field.key] && !field.options.includes(recordForm[field.key])" :value="recordForm[field.key]">{{ recordForm[field.key] }} (histórico)</option>
          </select>
          <select v-else-if="field.type === 'location'" v-model="recordForm[field.key]" :required="field.required">
            <option value="" disabled>Selecciona una sede</option>
            <option v-for="location in locationChoices" :key="location.id" :value="location.id">{{ location.title }}</option>
          </select>
          <input v-else v-model="recordForm[field.key]" :type="field.type || 'text'" :step="field.step" :required="field.required" :maxlength="field.type === 'email' ? 320 : 255" :placeholder="field.placeholder" />
        </label>
      </div>
      <div class="record-editor-actions">
        <button class="map-tool-button" type="button" @click="closeRecordEditor">Cancelar</button>
        <button class="primary-action" type="submit" :disabled="saving">{{ saving ? 'Guardando…' : isAttendanceModule ? 'Guardar asistencia' : isResourcesModule ? (editorId ? 'Guardar recurso' : 'Agregar recurso') : isReportsModule ? 'Guardar informe' : 'Guardar' }}</button>
      </div>
    </form>

    <template v-if="module.id === 'locations'">
      <section class="location-slider" aria-label="Gestión de sedes">
        <div class="location-slider-heading">
          <div>
            <p class="eyebrow">GESTIÓN DE UBICACIONES</p>
            <h3>{{ editorOpen ? (editorId ? 'Editar sede' : 'Crear nueva sede') : 'Mapa de sedes' }}</h3>
          </div>
          <span class="location-slider-count">{{ records.length }} {{ records.length === 1 ? 'sede' : 'sedes' }}</span>
        </div>
        <div class="location-slider-tabs" role="tablist" aria-label="Secciones de sedes">
          <button class="location-slider-tab" :class="{ active: !editorOpen }" type="button" role="tab" :aria-selected="!editorOpen" @click="closeRecordEditor">
            <MapPinIcon /><span>Mapa de sedes</span><small>Explorar ubicaciones</small>
          </button>
          <button v-if="canWrite" class="location-slider-tab" :class="{ active: editorOpen }" type="button" role="tab" :aria-selected="editorOpen" @click="openRecordEditor(editorOpen ? selectedLocation : null)">
            <PlusIcon /><span>{{ editorOpen && editorId ? 'Editar sede' : 'Crear sede' }}</span><small>{{ editorOpen && editorId ? 'Actualizar ubicación' : 'Agregar ubicación' }}</small>
          </button>
        </div>

        <Transition name="location-slider-panel" mode="out-in" @before-leave="prepareLocationSlideLeave" @after-enter="finishLocationSlideEnter">
          <div v-if="editorOpen" key="location-editor" class="location-slider-slide">
            <form class="record-editor location-record-editor" @submit.prevent="saveRecord">
              <div class="record-editor-heading">
                <div><p class="eyebrow">{{ editorId ? 'EDITAR UBICACIÓN' : 'NUEVA UBICACIÓN' }}</p><h3>{{ editorId ? 'Actualizar sede' : 'Crear sede' }}</h3></div>
                <button class="icon-button" type="button" aria-label="Volver al mapa" @click="closeRecordEditor"><XMarkIcon /></button>
              </div>
              <section class="location-picker" aria-label="Elegir ubicación de la sede">
                <div class="location-picker-toolbar">
                  <div><strong>Ubicación en el mapa</strong><span>Coloca el pin con un clic o arrástralo a la posición exacta.</span></div>
                </div>
                <p v-if="editorLocationError" class="map-geolocation-error" role="alert">{{ editorLocationError }}</p>
                <div class="location-picker-map-frame">
                  <div ref="editorMapElement" class="location-picker-map" :class="{ 'location-picker-map-selecting': selectingEditorPoint }" :aria-label="selectingEditorPoint ? 'Haz clic en el mapa para fijar la sede' : 'Mapa para ubicar la sede'"></div>
                  <div class="location-picker-actions" aria-label="Controles del mapa" @click.stop>
                    <button class="map-tool-button" type="button" :disabled="locatingEditor" title="Centrar el mapa en tu ubicación actual" @click="locateEditorLocation">
                      <MapPinIcon />{{ locatingEditor ? 'Localizando…' : 'Mi ubicación' }}
                    </button>
                    <button class="map-tool-button" type="button" :aria-pressed="selectingEditorPoint" :title="selectingEditorPoint ? 'Cancelar selección de punto' : 'Seleccionar sede haciendo clic en el mapa'" @click="selectingEditorPoint = !selectingEditorPoint">
                      <MapPinIcon />{{ selectingEditorPoint ? 'Cancelar punto' : 'Colocar pin' }}
                    </button>
                    <button class="map-tool-button" type="button" :disabled="!editorCoordinatesValid" title="Centrar el mapa en el pin de la sede" @click="centerEditorMapOnMarker">Centrar pin</button>
                    <button class="map-tool-button" type="button" title="Restablecer la vista inicial del mapa" @click="resetEditorMapView"><ArrowPathIcon />Vista inicial</button>
                    <button class="map-tool-button location-scroll-toggle" type="button" :aria-pressed="editorScrollZoom" :title="editorScrollZoom ? 'Desactivar zoom con la rueda del mouse' : 'Activar zoom con la rueda del mouse'" @click="toggleEditorScrollZoom">
                      {{ editorScrollZoom ? 'Zoom rueda: activado' : 'Zoom rueda: desactivado' }}
                    </button>
                  </div>
                </div>
                <p v-if="selectingEditorPoint" class="location-picker-hint" role="status">Haz clic en el mapa para colocar el pin de la sede.</p>
                <p class="location-picker-coordinates" role="status">
                  {{ recordForm.latitude && recordForm.longitude ? `Coordenadas: ${recordForm.latitude}, ${recordForm.longitude}` : 'Aún no se han definido coordenadas.' }}
                </p>
              </section>
              <div class="record-editor-fields location-record-fields">
                <label v-for="field in moduleFields" :key="field.key">
                  {{ field.label }}
                  <textarea v-if="field.type === 'textarea'" v-model="recordForm[field.key]" rows="3" :required="field.required" />
                  <select v-else-if="field.type === 'location'" v-model="recordForm[field.key]" :required="field.required">
                    <option value="" disabled>Selecciona una sede</option>
                    <option v-for="location in locationChoices" :key="location.id" :value="location.id">{{ location.title }}</option>
                  </select>
                  <input v-else v-model="recordForm[field.key]" :type="field.type || 'text'" :step="field.step" :required="field.required" :maxlength="field.type === 'email' ? 320 : 255" />
                </label>
              </div>
              <div class="record-editor-actions">
                <button class="map-tool-button" type="button" @click="closeRecordEditor">Cancelar</button>
                <button class="primary-action" type="submit" :disabled="saving">{{ saving ? 'Guardando…' : editorId ? 'Guardar cambios' : 'Crear sede' }}</button>
              </div>
            </form>
          </div>
          <div v-else key="location-map" class="location-slider-slide">
      <div v-if="loading && !records.length" class="module-loading">Cargando sedes…</div>
      <div v-else-if="records.length" class="locations-workspace">
        <section class="location-map-panel">
          <div class="map-heading">
            <div><p class="eyebrow">MAPA DE SEDES</p><h3>{{ visibleLocations.length }} de {{ records.length }} ubicaciones</h3></div>
            <button v-if="canWrite" class="map-tool-button" type="button" @click="openRecordEditor()"><PlusIcon />Nueva sede</button>
            <span class="map-city"><MapPinIcon />{{ searchCenter ? 'Centro de búsqueda activo' : 'Selecciona un centro' }}</span>
          </div>
          <div class="map-filter-toolbar" aria-label="Filtros del mapa">
            <label class="map-filter-control">Tipo de servicio
              <select v-model="selectedServiceType" :disabled="!serviceTypes.length" aria-label="Filtrar por tipo de servicio">
                <option value="">{{ serviceTypes.length ? 'Todos los tipos' : 'Sin tipos registrados' }}</option>
                <option v-for="serviceType in serviceTypes" :key="serviceType" :value="serviceType">{{ serviceType }}</option>
              </select>
            </label>
            <label class="map-filter-control">Distancia
              <select v-model="searchRadiusKm" aria-label="Filtrar por distancia en kilómetros">
                <option value="">Sin límite</option>
                <option value="1">1 km</option>
                <option value="5">5 km</option>
                <option value="10">10 km</option>
                <option value="25">25 km</option>
                <option value="50">50 km</option>
              </select>
            </label>
            <button class="map-tool-button" type="button" :disabled="locating" @click="locateUser">
              <MapPinIcon />{{ locating ? 'Ubicando…' : 'Mi ubicación' }}
            </button>
            <button class="map-tool-button map-reset-button" type="button" @click="resetMapFilters">
              <ArrowPathIcon />Limpiar
            </button>
          </div>
          <p class="map-filter-hint" role="status">
            {{ searchCenter ? 'El radio se mide desde el centro seleccionado.' : 'Para filtrar por distancia, usa tu ubicación o haz clic en el mapa para elegir un centro.' }}
          </p>
          <p v-if="geolocationError" class="map-geolocation-error" role="alert">{{ geolocationError }}</p>
          <p v-else-if="!visibleLocations.length" class="map-no-results" role="status">No hay sedes que coincidan con estos filtros.</p>
          <p v-else-if="!mappableLocations.length" class="map-no-results" role="status">Las sedes disponibles no tienen coordenadas geográficas válidas.</p>
          <div ref="mapElement" class="location-map" aria-label="Mapa interactivo de sedes"></div>
        </section>

        <aside v-if="selectedLocation" class="location-side-panel">
          <div class="selected-location-heading">
            <span class="location-pin"><MapPinIcon /></span>
            <div><p class="eyebrow">SEDE SELECCIONADA</p><h3>{{ selectedLocation?.title }}</h3></div>
          </div>
          <div v-if="canWrite" class="record-row-actions">
            <button type="button" class="record-action" @click="openRecordEditor(selectedLocation)"><PencilSquareIcon />Editar sede</button>
            <button v-if="canDelete" type="button" class="record-action record-action-danger" @click="removeRecord(selectedLocation)"><TrashIcon />Eliminar</button>
          </div>
          <p class="location-address">{{ selectedLocation?.description }}</p>

          <details class="map-options">
            <summary aria-label="Opciones de la sede"><EllipsisHorizontalIcon /><span>Opciones</span><ChevronDownIcon class="options-chevron" /></summary>
            <div class="map-options-menu" role="menu">
              <button role="menuitem" @click="setAction('reservation')">Reservar espacio</button>
              <button role="menuitem" @click="setAction('assignment')">Asignar evento</button>
            </div>
          </details>

          <form v-if="action === 'reservation'" class="location-action-form" @submit.prevent="saveReservation">
            <div class="form-heading"><h4>Reservar espacio</h4><button type="button" class="form-close" aria-label="Cerrar formulario" @click="action = ''">×</button></div>
            <label>Actividad<input v-model="bookingForm.title" required maxlength="120" placeholder="Ej. Reunión de equipo"></label>
            <label>Responsable<input v-model="bookingForm.contactName" required maxlength="100" placeholder="Nombre completo"></label>
            <div class="form-date-grid">
              <label>Inicio<input v-model="bookingForm.startsAt" required type="datetime-local"></label>
              <label>Fin<input v-model="bookingForm.endsAt" required type="datetime-local"></label>
            </div>
            <label>Notas<textarea v-model="bookingForm.notes" rows="2" maxlength="300" placeholder="Detalles opcionales"></textarea></label>
            <button class="primary-action" type="submit" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar reserva' }}</button>
          </form>

          <form v-else-if="action === 'assignment'" class="location-action-form" @submit.prevent="saveAssignment">
            <div class="form-heading"><h4>Asignar evento</h4><button type="button" class="form-close" aria-label="Cerrar formulario" @click="action = ''">×</button></div>
            <label>Evento
              <select v-model="eventForm.eventId" required>
                <option v-for="event in events" :key="event.id" :value="event.id">{{ event.title }} · {{ displayDate(event.startsAt) }}</option>
              </select>
            </label>
            <p class="form-hint">Se cambiará la sede del evento seleccionado.</p>
            <button class="primary-action" type="submit" :disabled="saving || !events.length">{{ saving ? 'Guardando…' : 'Asignar a esta sede' }}</button>
          </form>

          <div class="location-list-heading"><CalendarDaysIcon /><h4>Próximas reservas</h4></div>
          <div v-if="reservations.filter((reservation) => reservation.locationId === selectedLocationId).length" class="location-reservation-list">
            <article v-for="reservation in reservations.filter((item) => item.locationId === selectedLocationId)" :key="reservation.id" class="location-reservation-row">
              <strong>{{ reservation.title }}</strong><span>{{ displayDate(reservation.startsAt) }}</span><small>{{ reservation.contactName }}</small>
            </article>
          </div>
          <p v-else class="location-no-reservations">Esta sede no tiene reservas de espacio registradas.</p>

          <div class="location-list-heading event-list-heading"><CalendarDaysIcon /><h4>Eventos asignados</h4></div>
          <div class="assigned-event-list">
            <article v-for="event in events.filter((item) => item.location === selectedLocation?.title)" :key="event.id" class="assigned-event-row">
              <strong>{{ event.title }}</strong><span>{{ displayDate(event.startsAt) }}</span>
            </article>
            <p v-if="!events.some((item) => item.location === selectedLocation?.title)" class="location-no-reservations">Sin eventos asignados.</p>
          </div>
        </aside>
        <aside v-else class="location-side-panel location-empty-selection" aria-live="polite">
          <MapPinIcon />
          <h3>Sin sede en esta búsqueda</h3>
          <p>Amplía la distancia o limpia los filtros para volver a mostrar las sedes.</p>
          <button class="map-tool-button" type="button" @click="resetMapFilters"><ArrowPathIcon />Limpiar filtros</button>
        </aside>
      </div>
      <div v-else-if="canWrite" class="module-empty">
        <span class="empty-icon"><MapPinIcon aria-hidden="true" /></span>
        <strong>Sin sedes todavía</strong>
        <p>Registra la primera sede de esta organización.</p>
        <button class="primary-action" type="button" @click="openRecordEditor()"><PlusIcon />Nueva sede</button>
      </div>
          </div>
        </Transition>
      </section>
    </template>

    <div v-else-if="loading && !records.length" class="module-loading">Cargando datos…</div>
    <section v-else-if="records.length || canWrite" class="module-records" :class="{ 'attendance-module-records': isAttendanceModule, 'resources-module-records': isResourcesModule, 'reports-module-records': isReportsModule, 'settings-module-records': isSettingsModule }" :aria-label="`Datos de ${module.label}`">
      <template v-if="isAttendanceModule">
        <div class="attendance-summary" aria-label="Resumen de asistencia">
          <div><span>Sesiones registradas</span><strong>{{ attendanceSummary.sessions }}</strong></div>
          <div><span>Asistentes contabilizados</span><strong>{{ attendanceSummary.attendeeCount }}</strong></div>
          <div><span>Por realizar</span><strong>{{ attendanceSummary.pending }}</strong></div>
        </div>
      </template>
      <div v-if="isResourcesModule" class="resources-summary" aria-label="Resumen del inventario">
        <div><span>Tipos de recurso</span><strong>{{ resourcesSummary.total }}</strong></div>
        <div><span>Disponibles</span><strong>{{ resourcesSummary.available }}</strong></div>
        <div><span>Requieren atención</span><strong>{{ resourcesSummary.attention }}</strong></div>
      </div>
      <div v-if="isReportsModule" class="reports-summary" aria-label="Resumen de informes">
        <div><span>Informes registrados</span><strong>{{ reportsSummary.total }}</strong></div>
        <div><span>En preparación o revisión</span><strong>{{ reportsSummary.inProgress }}</strong></div>
        <div><span>Finalizados</span><strong>{{ reportsSummary.finalized }}</strong></div>
      </div>
      <div v-if="isSettingsModule" class="settings-summary" aria-label="Resumen de preferencias">
        <div><span>Preferencias registradas</span><strong>{{ settingsSummary.total }}</strong></div>
        <div><span>Activas</span><strong>{{ settingsSummary.active }}</strong></div>
        <div><span>Pendientes de revisión</span><strong>{{ settingsSummary.review }}</strong></div>
      </div>
      <div class="records-toolbar">
        <div><p class="eyebrow">{{ isAttendanceModule ? 'HISTORIAL' : isResourcesModule ? 'INVENTARIO' : isReportsModule ? 'SEGUIMIENTO' : isSettingsModule ? 'CATÁLOGO' : 'REGISTROS' }}</p><h3>{{ isAttendanceModule ? `${visibleModuleRecords.length} de ${records.length} sesiones` : isResourcesModule ? `${visibleModuleRecords.length} de ${records.length} tipos de recurso` : isReportsModule ? `${visibleModuleRecords.length} de ${records.length} informes` : isSettingsModule ? `${visibleModuleRecords.length} de ${records.length} preferencias` : `${records.length} registros` }}</h3></div>
        <button v-if="canWrite" class="map-tool-button" type="button" @click="openRecordEditor()"><PlusIcon />{{ isAttendanceModule ? 'Registrar sesión' : isResourcesModule ? 'Agregar recurso' : isReportsModule ? 'Crear informe' : isSettingsModule ? 'Agregar preferencia' : 'Nuevo' }}</button>
      </div>
      <p v-if="isCommunityPublishableModule" class="module-community-visibility" role="status">
        <GlobeAltIcon aria-hidden="true" />{{ publicModuleRecordCount }} de {{ records.length }} registros se muestran en Comunidad. Usa “Compartir” para autorizar cada publicación.
      </p>
      <div v-if="isAttendanceModule" class="attendance-filters">
        <label>Buscar sesión<input v-model="attendanceSearch" type="search" placeholder="Nombre, estado o nota" /></label>
        <label>Estado
          <select v-model="attendanceStatusFilter">
            <option value="all">Todos</option>
            <option v-for="status in attendanceStatusOptions" :key="status" :value="status">{{ status }}</option>
          </select>
        </label>
      </div>
      <div v-if="isResourcesModule" class="attendance-filters">
        <label>Buscar recurso<input v-model="resourcesSearch" type="search" placeholder="Nombre, ubicación o descripción" /></label>
        <label>Disponibilidad
          <select v-model="resourcesStatusFilter">
            <option value="all">Todos los estados</option>
            <option v-for="status in resourceStatusOptions" :key="status" :value="status">{{ status }}</option>
          </select>
        </label>
      </div>
      <div v-if="isReportsModule" class="attendance-filters">
        <label>Buscar informe<input v-model="reportsSearch" type="search" placeholder="Título, periodo o hallazgos" /></label>
        <label>Etapa
          <select v-model="reportsStatusFilter">
            <option value="all">Todas las etapas</option>
            <option v-for="status in reportStatusOptions" :key="status" :value="status">{{ status }}</option>
          </select>
        </label>
      </div>
      <div v-if="isSettingsModule" class="attendance-filters">
        <label>Buscar preferencia<input v-model="settingsSearch" type="search" placeholder="Nombre, valor o descripción" /></label>
        <label>Estado
          <select v-model="settingsStatusFilter">
            <option value="all">Todos los estados</option>
            <option v-for="status in settingsStatusOptions" :key="status" :value="status">{{ status }}</option>
          </select>
        </label>
      </div>
      <div class="records-list">
        <article v-for="record in visibleModuleRecords" :key="record.id" class="module-record-row" :class="{ 'attendance-record-row': isAttendanceModule, 'resource-record-row': isResourcesModule, 'report-record-row': isReportsModule, 'setting-record-row': isSettingsModule }">
          <span v-if="isResourcesModule" class="resource-record-icon"><CubeIcon aria-hidden="true" /></span>
          <span v-if="isReportsModule" class="report-record-icon"><ChartBarIcon aria-hidden="true" /></span>
          <span v-if="isSettingsModule" class="setting-record-icon"><Cog6ToothIcon aria-hidden="true" /></span>
          <div class="record-main"><h4>{{ record.title }}</h4><p>{{ record.description || (isAttendanceModule ? 'Sin observaciones adicionales.' : isReportsModule ? 'Sin hallazgos agregados todavía.' : isSettingsModule ? 'Sin descripción adicional.' : '') }}</p><span v-if="record.detail" :class="{ 'attendance-count': isAttendanceModule, 'report-summary-text': isReportsModule, 'setting-value': isSettingsModule }">{{ isAttendanceModule ? `Asistencia: ${record.detail}` : isReportsModule ? `Resumen: ${record.detail}` : isSettingsModule ? `Valor: ${record.detail}` : record.detail }}</span></div>
          <div class="record-meta"><span class="record-status" :class="{ 'attendance-status-pending': isAttendanceModule && /pendiente|programad|por registrar/i.test(record.status || ''), 'resource-status-attention': isResourcesModule && /mantenimiento|reparaci|dañad|fuera de servicio/i.test(record.status || ''), 'resource-status-in-use': isResourcesModule && /en uso|reservado/i.test(record.status || ''), 'report-status-progress': isReportsModule && /borrador|revisi|pendiente|preparaci/i.test(record.status || ''), 'report-status-final': isReportsModule && /finaliz|aprob|complet|publicad/i.test(record.status || ''), 'setting-status-inactive': isSettingsModule && /inactiva|deshabilitada/i.test(record.status || ''), 'setting-status-review': isSettingsModule && /pendiente|revisi|por validar/i.test(record.status || '') }">{{ record.status }}</span><time v-if="record.recordDate">{{ isResourcesModule || isSettingsModule ? 'Revisión · ' : isReportsModule ? 'Periodo · ' : '' }}{{ displayDate(record.recordDate) }}</time></div>
          <div v-if="canWrite" class="record-row-actions">
            <label v-if="isCommunityPublishableModule" class="record-publish-toggle" :title="record.isPublic ? 'Despublicar este registro de Comunidad' : 'Publicar este registro en Comunidad'">
              <input :checked="Boolean(record.isPublic)" type="checkbox" :disabled="saving" @change="setModuleRecordVisibility(record, $event.target.checked)" />
              <span>{{ record.isPublic ? 'En Comunidad' : 'Compartir' }}</span>
            </label>
            <button type="button" class="record-action" :aria-label="`Editar ${record.title}`" @click="openRecordEditor(record)"><PencilSquareIcon />Editar</button>
            <button v-if="canDelete" type="button" class="record-action record-action-danger" :aria-label="`Eliminar ${record.title}`" @click="removeRecord(record)"><TrashIcon />Eliminar</button>
          </div>
        </article>
      </div>
      <div v-if="isAttendanceModule && !visibleModuleRecords.length" class="attendance-no-results" role="status">
        <p>{{ records.length ? 'No hay sesiones que coincidan con la búsqueda y el filtro.' : 'Aún no hay sesiones en el historial.' }}</p>
        <button v-if="canWrite && !records.length" class="primary-action" type="button" @click="openRecordEditor()"><PlusIcon />Registrar primera sesión</button>
      </div>
      <div v-if="isResourcesModule && !visibleModuleRecords.length" class="attendance-no-results" role="status">
        <CubeIcon aria-hidden="true" />
        <p>{{ records.length ? 'No hay recursos que coincidan con esos filtros.' : 'El inventario todavía está vacío.' }}</p>
        <button v-if="canWrite && !records.length" class="primary-action" type="button" @click="openRecordEditor()"><PlusIcon />Agregar primer recurso</button>
      </div>
      <div v-if="isReportsModule && !visibleModuleRecords.length" class="attendance-no-results" role="status">
        <ChartBarIcon aria-hidden="true" />
        <p>{{ records.length ? 'No hay informes que coincidan con la búsqueda y la etapa.' : 'Todavía no hay informes registrados.' }}</p>
        <button v-if="canWrite && !records.length" class="primary-action" type="button" @click="openRecordEditor()"><PlusIcon />Crear primer informe</button>
      </div>
      <div v-if="isSettingsModule && !visibleModuleRecords.length" class="attendance-no-results" role="status">
        <Cog6ToothIcon aria-hidden="true" />
        <p>{{ records.length ? 'No hay preferencias que coincidan con la búsqueda o el estado.' : 'Todavía no hay preferencias registradas.' }}</p>
        <button v-if="canWrite && !records.length" class="primary-action" type="button" @click="openRecordEditor()"><PlusIcon />Agregar primera preferencia</button>
      </div>
    </section>
    <div v-else-if="!error" class="module-empty">
      <span class="empty-icon"><MapPinIcon aria-hidden="true" /></span>
      <strong>Sin registros todavía</strong>
      <p>No hay datos guardados para {{ module.label.toLowerCase() }}.</p>
    </div>
    </template>
  </section>
</template>