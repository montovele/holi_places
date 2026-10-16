<script setup>
import { computed, onMounted, ref } from 'vue'
import { ArrowRightIcon, BookOpenIcon, BuildingLibraryIcon, CalendarDaysIcon, GlobeAltIcon, HeartIcon, MapPinIcon, NewspaperIcon, SparklesIcon, UsersIcon } from '@heroicons/vue/24/outline'
import { communityMediaSource, getPublicCommunity } from '../services/communityService'
import { useAppearanceStore } from '../stores/appearance'
import { usePublicAdRotation } from '../composables/usePublicAdRotation'
import ScrollAdSlot from '../components/community/ScrollAdSlot.vue'

const appearance = useAppearanceStore()
const loading = ref(true)
const errorMessage = ref('')
const community = ref({ congregations: [], events: [], posts: [], moduleUpdates: [], ads: [] })
const { ads: liveAds } = usePublicAdRotation()
const selectedCongregation = ref('all')
const selectedArea = ref('all')
const brandIcons = { church: BuildingLibraryIcon, book: BookOpenIcon, heart: HeartIcon, community: GlobeAltIcon, light: SparklesIcon }
const appearanceStyle = computed(() => ({
  '--social-primary': appearance.settings.colors.primary,
  '--social-accent': appearance.settings.colors.accent,
  '--social-paper': appearance.settings.colors.background,
  '--social-ink': appearance.settings.colors.text,
}))

const moduleCatalog = [
  { id: 'groups', label: 'Grupos' },
  { id: 'attendance', label: 'Asistencia' },
  { id: 'resources', label: 'Recursos' },
  { id: 'communications', label: 'Comunicaciones' },
  { id: 'reports', label: 'Reportes' },
  { id: 'settings', label: 'Preferencias compartidas' },
]

const visibleCongregations = computed(() => {
  if (selectedCongregation.value === 'all') return community.value.congregations
  return community.value.congregations.filter((congregation) => congregation.id === selectedCongregation.value)
})

const visibleEvents = computed(() => {
  return community.value.events.filter((event) => {
    if (selectedCongregation.value === 'all') return true
    return event.locationId === selectedCongregation.value
  })
})

const visiblePosts = computed(() => {
  return community.value.posts.filter((post) => {
    if (selectedCongregation.value === 'all') return true
    return post.locationId === selectedCongregation.value
  })
})

const visibleUpdates = computed(() => {
  return community.value.moduleUpdates.filter((update) => {
    if (selectedCongregation.value === 'all') return true
    return update.organizationId === community.value.congregations.find((item) => item.id === selectedCongregation.value)?.organizationId
  })
})

const selectedDetail = computed(() => {
  if (selectedCongregation.value === 'all') return null
  return community.value.congregations.find((item) => item.id === selectedCongregation.value) || null
})

const organizationModuleBoards = computed(() => {
  const organizations = new Map()

  for (const congregation of visibleCongregations.value) {
    const organizationId = congregation.organizationId || `location:${congregation.id}`
    if (!organizations.has(organizationId)) {
      const update = community.value.moduleUpdates.find((item) => item.organizationId === congregation.organizationId)
      organizations.set(organizationId, {
        id: organizationId,
        name: update?.congregation || congregation.name,
        locations: [],
      })
    }
    organizations.get(organizationId).locations.push(congregation)
  }

  return [...organizations.values()].map((organization) => {
    const modules = moduleCatalog
      .filter((module) => selectedArea.value === 'all' || selectedArea.value === module.id)
      .map((module) => ({
        ...module,
        items: visibleUpdates.value
          .filter((item) => item.organizationId === organization.id && item.moduleId === module.id)
          .sort((first, second) => new Date(second.recordDate || 0) - new Date(first.recordDate || 0)),
      }))
      .filter((module) => module.items.length)

    return {
      ...organization,
      modules,
      count: modules.reduce((total, module) => total + module.items.length, 0),
    }
  })
})

const summaryStats = computed(() => ({
  congregations: community.value.congregations.length,
  events: visibleEvents.value.length,
  posts: visiblePosts.value.length,
  contributions: visibleUpdates.value.length,
}))

function formatDate(value, options = {}) {
  if (!value) return 'Sin fecha'
  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(new Date(dateValue))
}

function formatTime(value) {
  if (!value) return 'Horario por confirmar'
  return new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

async function loadCommunity() {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await getPublicCommunity()
    community.value = {
      congregations: [],
      events: [],
      posts: [],
      moduleUpdates: [],
      ...data,
    }
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || 'No se pudo cargar la comunidad pública.'
  } finally {
    loading.value = false
  }
}

onMounted(loadCommunity)
</script>

<template>
  <div class="community-social-page" :class="`community-social-mode-${appearance.settings.communityMode}`" :style="appearanceStyle">
    <header class="community-header">
      <RouterLink class="brand" :to="{ name: 'community' }">
        <span class="brand-mark"><component :is="brandIcons[appearance.settings.brandIcon] || BuildingLibraryIcon" aria-hidden="true" /></span>
        <span>{{ appearance.settings.brandName }}</span>
      </RouterLink>
      <nav class="top-links" aria-label="Navegación de comunidad">
        <a href="#mapa">Mapa</a>
        <a href="#tablero">Tablero</a>
        <a href="#agenda">Agenda</a>
      </nav>
      <RouterLink class="header-action" :to="{ name: 'dashboard' }">
        Panel de gestión
      </RouterLink>
    </header>

    <main class="community-shell">
      <section class="hero-panel">
        <div class="hero-copy">
          <p class="eyebrow"><GlobeAltIcon class="mini" /> Comunidad abierta</p>
          <h1>La vida de cada congregación, visible y conectada.</h1>
          <p class="lead">
            Una experiencia pública que reúne la identidad geográfica, la organización por áreas y los contenidos compartidos por cada comunidad.
          </p>
          <div class="hero-actions">
            <a href="#mapa" class="primary-cta">Explorar comunidad <ArrowRightIcon class="mini" /></a>
            <RouterLink :to="{ name: 'community' }" class="secondary-cta">Volver a la vista general</RouterLink>
          </div>

          <div class="stats-row">
            <div>
              <strong>{{ summaryStats.congregations }}</strong>
              <span>congregaciones</span>
            </div>
            <div>
              <strong>{{ summaryStats.events }}</strong>
              <span>encuentros</span>
            </div>
            <div>
              <strong>{{ summaryStats.posts }}</strong>
              <span>publicaciones</span>
            </div>
          </div>
        </div>

        <div class="hero-visual">
          <div class="visual-card large-card">
            <span class="card-label">Mapa de comunidad</span>
            <h3>Todos los lugares activos</h3>
            <div class="location-list">
              <span v-for="congregation in community.congregations.slice(0, 4)" :key="congregation.id">
                <MapPinIcon class="mini" /> {{ congregation.name }}
              </span>
            </div>
          </div>
          <div class="visual-card small-card">
            <span class="card-label">Áreas</span>
            <h3>Grupos, reportes, recursos y más</h3>
          </div>
        </div>
      </section>

      <section class="layer-section">
        <article class="layer-card">
          <span class="layer-number">1</span>
          <div>
            <p class="eyebrow">Capa geográfica</p>
            <h3>Mapa + sedes + agenda</h3>
            <p>La comunidad se entiende también desde su ubicación, su presencia y sus actividades abiertas.</p>
          </div>
        </article>
        <article class="layer-card">
          <span class="layer-number">2</span>
          <div>
            <p class="eyebrow">Capa organizacional</p>
            <h3>Áreas por contenido</h3>
            <p>Se estructura la vida pública por grupos, asistencia, recursos, comunicaciones y reportes.</p>
          </div>
        </article>
        <article class="layer-card">
          <span class="layer-number">3</span>
          <div>
            <p class="eyebrow">Capa editorial</p>
            <h3>Historias y actividades</h3>
            <p>Lo que se comparte se vuelve parte de la identidad comunitaria.</p>
          </div>
        </article>
      </section>

      <section id="mapa" class="content-section">
        <div class="section-header">
          <div>
            <p class="eyebrow">Congregaciones activas</p>
            <h2>Selecciona una comunidad</h2>
          </div>
          <select v-model="selectedCongregation" class="selector">
            <option value="all">Todas las congregaciones</option>
            <option v-for="congregation in community.congregations" :key="congregation.id" :value="congregation.id">
              {{ congregation.name }}
            </option>
          </select>
        </div>

        <div v-if="loading" class="neutral-state">Cargando la comunidad pública…</div>
        <div v-else-if="errorMessage" class="neutral-state error-state">{{ errorMessage }}</div>
        <div v-else class="congregation-grid">
          <button
            v-for="congregation in visibleCongregations"
            :key="congregation.id"
            type="button"
            class="congregation-card"
            :class="{ active: selectedCongregation === congregation.id }"
            @click="selectedCongregation = congregation.id"
          >
            <span class="card-label">{{ congregation.city }}</span>
            <h3>{{ congregation.name }}</h3>
            <p>{{ congregation.address || 'Dirección pública disponible' }}</p>
            <div class="mini-stats">
              <span>{{ community.events.filter((event) => event.locationId === congregation.id).length }} eventos</span>
              <span>{{ community.posts.filter((post) => post.locationId === congregation.id).length }} posts</span>
            </div>
          </button>
        </div>
      </section>

      <section v-if="selectedDetail" class="content-section highlight-panel">
        <div class="section-header">
          <div>
            <p class="eyebrow">Ficha pública</p>
            <h2>{{ selectedDetail.name }}</h2>
          </div>
          <RouterLink class="text-link" :to="{ name: 'congregation-profile', params: { congregationId: selectedDetail.id } }">
            Ver perfil completo <ArrowRightIcon class="mini" />
          </RouterLink>
        </div>

        <div class="detail-grid">
          <article class="detail-box">
            <h3>Próximo encuentro</h3>
            <template v-if="visibleEvents[0]">
              <strong>{{ visibleEvents[0].title }}</strong>
              <p>{{ formatDate(visibleEvents[0].startsAt) }} · {{ formatTime(visibleEvents[0].startsAt) }}</p>
            </template>
            <p v-else>No hay encuentros públicos por ahora.</p>
          </article>

          <article class="detail-box">
            <h3>Ubicación</h3>
            <p>{{ selectedDetail.address }}</p>
            <p>{{ selectedDetail.city }}</p>
          </article>
        </div>
      </section>

      <ScrollAdSlot :ads="liveAds" placement="community" :slot-index="0" :slot-count="3" :slot-seed="6" />

      <section id="tablero" class="content-section">
        <div class="section-header">
          <div>
            <p class="eyebrow">Información autorizada por cada organización</p>
            <h2>Módulos publicados por congregación</h2>
          </div>
          <div class="area-pills" role="tablist" aria-label="Seleccionar área">
            <button type="button" role="tab" :aria-selected="selectedArea === 'all'" :class="{ active: selectedArea === 'all' }" @click="selectedArea = 'all'">Todos</button>
            <button v-for="module in moduleCatalog" :key="module.id" type="button" role="tab" :aria-selected="selectedArea === module.id" :class="{ active: selectedArea === module.id }" @click="selectedArea = module.id">
              {{ module.label }}
            </button>
          </div>
        </div>

        <div v-if="organizationModuleBoards.length" class="board-grid">
          <article v-for="organization in organizationModuleBoards" :key="organization.id" class="board-card organization-board">
            <header>
              <div>
                <p class="eyebrow">Organización</p>
                <h3>{{ organization.name }}</h3>
              </div>
              <span :aria-label="`${organization.count} registros públicos`">{{ organization.count }}</span>
            </header>

            <p v-if="organization.locations.length" class="organization-locations">
              <MapPinIcon class="mini" />
              {{ organization.locations.map((location) => location.name).join(' · ') }}
            </p>

            <div v-if="organization.modules.length" class="group-stack">
              <section v-for="module in organization.modules" :key="`${organization.id}-${module.id}`" class="group-block module-group">
                <header>
                  <h4>{{ module.label }}</h4>
                  <span>{{ module.items.length }}</span>
                </header>
                <ul>
                  <li v-for="item in module.items" :key="item.id">
                    <div class="module-record-heading">
                      <strong>{{ item.title }}</strong>
                      <span v-if="item.status" class="record-status">{{ item.status }}</span>
                    </div>
                    <span v-if="item.description">{{ item.description }}</span>
                    <span v-if="item.detail">{{ item.detail }}</span>
                    <time v-if="item.recordDate">{{ formatDate(item.recordDate) }}</time>
                  </li>
                </ul>
              </section>
            </div>
            <p v-else class="empty-copy">Esta organización aún no tiene registros públicos en esta área.</p>
          </article>
        </div>
        <div v-else class="neutral-state">No hay congregaciones disponibles para mostrar.</div>
      </section>

      <ScrollAdSlot :ads="liveAds" placement="community" :slot-index="1" :slot-count="3" :slot-seed="7" />

      <ScrollAdSlot :ads="liveAds" placement="content" :slot-index="0" :slot-count="3" :slot-seed="10" />

      <section id="agenda" class="content-section">
        <div class="section-header">
          <div>
            <p class="eyebrow">Agenda abierta</p>
            <h2>Próximos encuentros</h2>
          </div>
          <span class="pill-badge">{{ visibleEvents.length }} actividades</span>
        </div>

        <div v-if="visibleEvents.length" class="events-list">
          <article v-for="event in visibleEvents.slice(0, 6)" :key="event.id" class="event-card">
            <div class="event-date">
              <span>{{ formatDate(event.startsAt, { month: 'short' }).replace('.', '') }}</span>
              <strong>{{ new Date(event.startsAt).getDate() }}</strong>
            </div>
            <div class="event-body">
              <p class="mini-label"><CalendarDaysIcon class="mini" /> {{ event.congregation }}</p>
              <h3>{{ event.title }}</h3>
              <p>{{ event.description }}</p>
              <div class="event-meta">
                <span>{{ formatDate(event.startsAt, { weekday: 'short' }) }}</span>
                <span>{{ formatTime(event.startsAt) }}</span>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="neutral-state">Todavía no hay encuentros públicos.</div>
      </section>

      <ScrollAdSlot :ads="liveAds" placement="community" :slot-index="2" :slot-count="3" :slot-seed="8" />

      <ScrollAdSlot :ads="liveAds" placement="content" :slot-index="1" :slot-count="3" :slot-seed="11" />

      <section class="content-section stories-section">
        <div class="section-header">
          <div>
            <p class="eyebrow">Historias y actividades</p>
            <h2>Lo que la comunidad comparte</h2>
          </div>
        </div>

        <div v-if="visiblePosts.length" class="stories-grid">
          <article v-for="post in visiblePosts.slice(0, 4)" :key="post.id" class="story-card">
            <div class="story-thumb">
              <video v-if="post.mediaType === 'video'" :src="communityMediaSource(post.mediaUrl || post.imageUrl)" controls playsinline :aria-label="post.title" />
              <img v-else :src="communityMediaSource(post.mediaUrl || post.imageUrl) || post.imageUrl || 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=80'" :alt="post.title" />
            </div>
            <div class="story-copy">
              <p class="mini-label"><NewspaperIcon class="mini" /> {{ post.congregation }}</p>
              <h3>{{ post.title }}</h3>
              <p>{{ post.excerpt || post.body }}</p>
              <time>{{ formatDate(post.publishedAt) }}</time>
            </div>
          </article>
        </div>
        <div v-else class="neutral-state">Aún no hay publicaciones para mostrar.</div>
      </section>

      <ScrollAdSlot :ads="liveAds" placement="content" :slot-index="2" :slot-count="3" :slot-seed="12" />
    </main>
  </div>
</template>

<style scoped>
.community-social-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f7f3ee 0%, #edf5f1 100%);
  color: #1f2a2f;
  font-family: Inter, 'Segoe UI', sans-serif;
}

.community-header {
  max-width: 1200px;
  margin: 0 auto;
  padding: 22px 24px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: #1f2a2f;
  font-weight: 800;
}

.brand-mark {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1c7a63, #d8aa63);
  color: white;
}

.brand span span {
  color: #1d7a63;
}

.top-links {
  display: flex;
  align-items: center;
  gap: 18px;
}

.top-links a,
.text-link,
.header-action,
.primary-cta,
.secondary-cta {
  text-decoration: none;
  color: inherit;
}

.top-links a {
  font-weight: 600;
  color: #405962;
}

.header-action,
.primary-cta,
.secondary-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  padding: 11px 16px;
  font-weight: 700;
}

.header-action,
.secondary-cta {
  background: rgba(255,255,255,0.7);
  border: 1px solid rgba(31,42,47,0.08);
}

.primary-cta {
  background: linear-gradient(135deg, #1d7a63, #2d6b7a);
  color: white;
  box-shadow: 0 12px 28px rgba(29,122,99,0.18);
}

.community-shell {
  max-width: 1200px;
  margin: 0 auto;
  padding: 30px 24px 72px;
}

.hero-panel {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 24px;
  padding: 28px 0 0;
}

.hero-copy,
.visual-card,
.layer-card,
.board-card,
.detail-box,
.event-card,
.story-card,
.content-section,
.congregation-card {
  background: rgba(255,255,255,0.78);
  border: 1px solid rgba(31,42,47,0.08);
  border-radius: 26px;
  box-shadow: 0 18px 40px rgba(31,42,47,0.04);
}

.hero-copy {
  padding: 32px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 800;
  color: #2f6d5a;
}

.hero-copy h1 {
  margin: 0;
  font-size: clamp(2.5rem, 5vw, 4.2rem);
  line-height: 0.96;
  letter-spacing: -0.04em;
}

.lead {
  margin-top: 18px;
  color: #4b5d67;
  line-height: 1.7;
  font-size: 1.04rem;
  max-width: 60ch;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 22px;
}

.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 28px;
}

.stats-row div {
  min-width: 125px;
  background: #eef7f4;
  border-radius: 18px;
  padding: 18px 16px;
  border: 1px solid rgba(29,122,99,0.12);
}

.stats-row strong {
  display: block;
  font-size: 1.8rem;
}

.stats-row span {
  color: #55737d;
  font-size: 0.8rem;
}

.hero-visual {
  display: grid;
  gap: 18px;
}

.visual-card {
  padding: 22px;
}

.large-card {
  min-height: 240px;
  background: linear-gradient(135deg, rgba(29,122,99,0.12), rgba(255,255,255,0.75));
}

.small-card {
  min-height: 140px;
}

.card-label,
.pill-badge,
.mini-label {
  color: #2f6d5a;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 800;
}

.location-list {
  margin-top: 16px;
  display: grid;
  gap: 10px;
}

.location-list span {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #3c5863;
}

.layer-section {
  margin-top: 34px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.layer-card {
  display: flex;
  gap: 18px;
  padding: 22px;
}

.layer-number {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eff7f3;
  border-radius: 14px;
  color: #1d7a63;
  font-weight: 800;
}

.layer-card h3,
.section-header h2,
.board-card h3,
.detail-box h3,
.event-body h3,
.story-copy h3,
.congregation-card h3 {
  margin: 0;
}

.layer-card p {
  margin: 8px 0 0;
  color: #4c616a;
  line-height: 1.65;
}

.content-section {
  margin-top: 34px;
  padding: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

.selector {
  border-radius: 13px;
  border: 1px solid rgba(31,42,47,0.12);
  background: rgba(255,255,255,0.8);
  padding: 11px 14px;
  color: #1f2a2f;
  min-width: 220px;
}

.congregation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 18px;
}

.congregation-card {
  border: 1px solid rgba(31,42,47,0.08);
  padding: 18px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.congregation-card:hover,
.congregation-card.active {
  transform: translateY(-2px);
  box-shadow: 0 18px 30px rgba(31,42,47,0.08);
}

.congregation-card p {
  margin: 10px 0 0;
  color: #4d6068;
  line-height: 1.6;
}

.mini-stats {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mini-stats span {
  background: #f1f7f4;
  border-radius: 999px;
  padding: 7px 10px;
  font-size: 0.72rem;
  color: #2f5860;
  font-weight: 700;
}

.highlight-panel {
  background: linear-gradient(135deg, rgba(255,255,255,0.9), rgba(230,243,239,0.8));
}

.text-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #1d7a63;
  font-weight: 700;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.detail-box {
  padding: 20px;
}

.detail-box p,
.event-body p,
.story-copy p,
.group-block li span,
.group-block li time,
.empty-copy {
  color: #4b5f68;
  line-height: 1.6;
}

.area-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.area-pills button {
  border: 1px solid rgba(31,42,47,0.1);
  border-radius: 999px;
  background: transparent;
  padding: 8px 12px;
  font-weight: 700;
  color: #405760;
  cursor: pointer;
}

.area-pills button.active {
  background: #eaf6f1;
  color: #1d7a63;
  border-color: rgba(29,122,99,0.24);
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 18px;
}

.board-card {
  padding: 18px;
}

.board-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.board-card header span {
  min-width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f2f8f4;
  border-radius: 12px;
  color: #1d7a63;
  font-weight: 800;
}

.organization-locations {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0 0 14px;
  color: #4b5f68;
  font-size: 0.82rem;
  line-height: 1.5;
}

.group-stack {
  display: grid;
  gap: 18px;
}

.group-block {
  border-top: 1px solid rgba(31,42,47,0.08);
  padding-top: 12px;
}

.group-block h4 {
  margin: 0 0 10px;
}

.module-group header {
  margin-bottom: 8px;
}

.module-group header span {
  min-width: 28px;
  height: 28px;
  font-size: 0.8rem;
}

.group-block ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.group-block li {
  display: grid;
  gap: 4px;
}

.group-block li strong {
  color: #1f2d35;
}

.module-record-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.record-status {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 3px 8px;
  background: #edf4f1;
  color: #376253;
  font-size: 0.68rem;
  font-weight: 700;
}

.events-list,
.stories-grid {
  display: grid;
  gap: 16px;
}

.event-card {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 18px;
  padding: 18px;
}

.event-date {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: linear-gradient(180deg, #e7f1ee, #f5f2ec);
  border-radius: 18px;
  color: #175a47;
  min-height: 100px;
}

.event-date span {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.7rem;
}

.event-date strong {
  font-size: 2rem;
  line-height: 1;
}

.event-body {
  display: grid;
  gap: 8px;
}

.event-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  color: #4c666d;
  font-size: 0.85rem;
  font-weight: 600;
}

.story-card {
  overflow: hidden;
}

.story-thumb {
  height: 200px;
}

.story-thumb img, .story-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.story-copy {
  padding: 18px;
}

.story-copy p {
  margin: 8px 0 10px;
}

.story-copy time {
  color: #40606c;
  font-size: 0.8rem;
  font-weight: 700;
}

.neutral-state {
  min-height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.6);
  border: 1px dashed rgba(31,42,47,0.18);
  border-radius: 22px;
  color: #465b64;
  padding: 20px;
  text-align: center;
}

.error-state {
  border-style: solid;
  border-color: rgba(166, 60, 60, 0.3);
  color: #7d2d2d;
}

.mini {
  width: 18px;
  height: 18px;
}

.community-social-page {
  color: var(--social-ink, #1f2a2f);
  background: var(--social-paper, #f7f3ee);
}

.community-social-page .brand,
.community-social-page .brand span span { color: var(--social-ink, #1f2a2f); }
.community-social-page .brand-mark { color: #fff; background: var(--social-primary, #1c7a63); }
.community-social-page .brand-mark svg { width: 18px; height: 18px; }
.community-social-page .brand > span:last-child { color: var(--social-ink, #1f2a2f); }
.community-social-page .brand > span:last-child > span { color: var(--social-primary, #1c7a63); }
.community-social-page .eyebrow,
.community-social-page .card-label,
.community-social-page .pill-badge,
.community-social-page .mini-label { color: var(--social-primary, #2f6d5a); }
.community-social-page .primary-cta,
.community-social-page .area-pills button.active { background: var(--social-primary, #1d7a63); }
.community-social-page .area-pills button.active { border-color: var(--social-primary, #1d7a63); }
.community-social-page .record-status { background: color-mix(in srgb, var(--social-primary, #214f3d) 9%, white); color: var(--social-primary, #214f3d); }
.community-social-page .congregation-card.active,
.community-social-page .congregation-card:hover { border-color: color-mix(in srgb, var(--social-primary, #214f3d) 42%, white); }
.community-social-page .primary-cta:hover { background: var(--social-accent, #ad5d48); }

.community-social-mode-directory .community-shell,
.community-social-mode-organizational .community-shell { display: flex; flex-direction: column; }
.community-social-mode-directory .hero-panel { order: 0; }
.community-social-mode-directory .layer-section { order: 1; }
.community-social-mode-directory #mapa { order: 2; }
.community-social-mode-directory .highlight-panel { order: 3; }
.community-social-mode-directory #agenda { order: 4; }
.community-social-mode-directory #tablero { order: 5; }
.community-social-mode-directory .stories-section { order: 6; }
.community-social-mode-organizational .hero-panel { order: 0; }
.community-social-mode-organizational .layer-section { order: 1; }
.community-social-mode-organizational #tablero { order: 2; }
.community-social-mode-organizational #mapa { order: 3; }
.community-social-mode-organizational .highlight-panel { order: 4; }
.community-social-mode-organizational #agenda { order: 5; }
.community-social-mode-organizational .stories-section { order: 6; }

@media (max-width: 900px) {
  .hero-panel,
  .layer-section,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .event-card {
    grid-template-columns: 1fr;
  }

  .community-header,
  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
