<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarDaysIcon, ClockIcon, GlobeAltIcon, MapPinIcon, NewspaperIcon, UsersIcon } from '@heroicons/vue/24/outline'
import { getPublicCommunity } from '../services/communityService'

const route = useRoute()
const router = useRouter()

const community = ref({ congregations: [], events: [], posts: [], moduleUpdates: [] })
const loading = ref(true)
const errorMessage = ref('')

const congregation = computed(() => community.value.congregations.find((item) => item.id === route.params.congregationId))
const congregationEvents = computed(() => community.value.events
  .filter((event) => event.locationId === route.params.congregationId)
  .sort((first, second) => new Date(first.startsAt) - new Date(second.startsAt)))
const congregationPosts = computed(() => community.value.posts
  .filter((post) => post.locationId === route.params.congregationId)
  .sort((first, second) => new Date(second.publishedAt) - new Date(first.publishedAt)))
const congregationUpdates = computed(() => community.value.moduleUpdates
  .filter((update) => update.organizationId === congregation.value?.organizationId)
  .sort((first, second) => new Date(second.recordDate || second.date || 0) - new Date(first.recordDate || first.date || 0)))

const groupedUpdates = computed(() => {
  const map = new Map()
  for (const update of congregationUpdates.value) {
    const key = update.moduleId || 'general'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(update)
  }
  return [...map.entries()].map(([moduleId, items]) => ({
    moduleId,
    label: updateLabel(moduleId),
    items,
  }))
})

const nextEvent = computed(() => congregationEvents.value[0])

function updateLabel(moduleId) {
  const labels = {
    groups: 'Grupos',
    attendance: 'Asistencia',
    resources: 'Recursos',
    communications: 'Comunicaciones',
    reports: 'Reportes',
    settings: 'Preferencias',
  }
  return labels[moduleId] || 'Actualización'
}

function formatDate(value, options = {}) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(new Date(value))
}

function formatEventDate(value) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value))
}

function formatHour(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

async function loadData() {
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
    }

    if (!congregation.value) {
      errorMessage.value = 'No encontramos una congregación pública con ese identificador.'
      return
    }
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || 'No pudimos cargar la información pública de la congregación.'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="congregation-profile-page">
    <header class="profile-header">
      <RouterLink class="back-link" :to="{ name: 'community' }">← Volver a comunidad</RouterLink>
      <div class="profile-header-brand">
        <span class="brand-mark">H</span>
        <span>holi<span>places</span></span>
      </div>
    </header>

    <main v-if="loading" class="profile-state">Cargando ficha pública…</main>
    <main v-else-if="errorMessage" class="profile-state profile-error">{{ errorMessage }}</main>
    <main v-else-if="!congregation" class="profile-state">La congregación no está disponible.</main>
    <main v-else class="profile-shell">
      <section class="hero-card">
        <div class="hero-copy">
          <p class="eyebrow"><GlobeAltIcon class="mini-icon" /> Comunidad abierta</p>
          <h1>{{ congregation.name }}</h1>
          <p class="lead">Una visión pública de la congregación: encuentros, actividades, sedes y contenidos compartidos.</p>

          <div class="hero-metrics">
            <div>
              <strong>{{ congregationEvents.length }}</strong>
              <span>encuentros</span>
            </div>
            <div>
              <strong>{{ congregationPosts.length }}</strong>
              <span>publicaciones</span>
            </div>
            <div>
              <strong>{{ congregationUpdates.length }}</strong>
              <span>aportes públicos</span>
            </div>
          </div>
        </div>

        <div class="hero-visual">
          <img src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1400&q=80" alt="Congregación con comunidad reuniéndose" />
          <div class="location-badge">
            <MapPinIcon class="mini-icon" />
            <span>{{ congregation.city }}</span>
          </div>
        </div>
      </section>

      <section class="info-grid">
        <article class="info-panel">
          <div class="panel-title">
            <MapPinIcon class="mini-icon" />
            <h2>Ubicación</h2>
          </div>
          <p>{{ congregation.address }}</p>
          <p>{{ congregation.city }}</p>
          <a
            class="map-link"
            :href="`https://www.google.com/maps/dir/?api=1&destination=${congregation.latitude},${congregation.longitude}`"
            target="_blank"
            rel="noopener noreferrer"
          >
            Cómo llegar
          </a>
        </article>

        <article class="info-panel">
          <div class="panel-title">
            <CalendarDaysIcon class="mini-icon" />
            <h2>Próximo encuentro</h2>
          </div>
          <template v-if="nextEvent">
            <h3>{{ nextEvent.title }}</h3>
            <p>{{ formatEventDate(nextEvent.startsAt) }} · {{ formatHour(nextEvent.startsAt) }}</p>
            <p>{{ nextEvent.description }}</p>
          </template>
          <p v-else>No hay encuentros públicos programados.</p>
        </article>

        <article class="info-panel">
          <div class="panel-title">
            <UsersIcon class="mini-icon" />
            <h2>Participación</h2>
          </div>
          <p>Se comparte la vida pública de la congregación con información autorizada y actualizada.</p>
          <ul class="bullet-list">
            <li>Encuentros y actividades públicas</li>
            <li>Recursos y grupos disponibles</li>
            <li>Reportes y comunicaciones autorizadas</li>
          </ul>
        </article>
      </section>

      <section class="content-section">
        <div class="section-heading">
          <h2>Agenda pública</h2>
          <span>{{ congregationEvents.length }} próximos</span>
        </div>

        <div v-if="congregationEvents.length" class="events-list">
          <article v-for="event in congregationEvents" :key="event.id" class="event-card">
            <div class="event-date">
              <span>{{ formatDate(event.startsAt, { month: 'short' }).replace('.', '') }}</span>
              <strong>{{ new Date(event.startsAt).getDate() }}</strong>
            </div>
            <div class="event-details">
              <p class="event-time">{{ formatEventDate(event.startsAt) }} · {{ formatHour(event.startsAt) }}</p>
              <h3>{{ event.title }}</h3>
              <p>{{ event.description }}</p>
              <small>{{ event.attendeeCount || 0 }} personas inscritas</small>
            </div>
          </article>
        </div>
        <div v-else class="empty-box">Todavía no hay encuentros públicos para esta congregación.</div>
      </section>

      <section class="content-section">
        <div class="section-heading">
          <h2>Áreas públicas</h2>
          <span>{{ groupedUpdates.length }} secciones</span>
        </div>

        <div v-if="groupedUpdates.length" class="areas-grid">
          <article v-for="section in groupedUpdates" :key="section.moduleId" class="area-card">
            <h3>{{ section.label }}</h3>
            <ul>
              <li v-for="item in section.items.slice(0, 4)" :key="item.id">
                <strong>{{ item.title }}</strong>
                <span>{{ item.description || item.detail || 'Contenido publicado' }}</span>
              </li>
            </ul>
          </article>
        </div>
        <div v-else class="empty-box">No hay contenidos públicos publicados en esta congregación.</div>
      </section>

      <section class="content-section">
        <div class="section-heading">
          <h2>Publicaciones y actividades</h2>
          <span>{{ congregationPosts.length }}</span>
        </div>

        <div v-if="congregationPosts.length" class="posts-grid">
          <article v-for="post in congregationPosts" :key="post.id" class="post-card">
            <div class="post-image-wrap">
              <img :src="post.imageUrl || 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=80'" :alt="post.title" />
            </div>
            <div class="post-copy">
              <div class="post-meta">
                <span>{{ post.type === 'activity' ? 'Actividad' : 'Publicación' }}</span>
                <time>{{ formatDate(post.publishedAt) }}</time>
              </div>
              <h3>{{ post.title }}</h3>
              <p>{{ post.excerpt || post.body }}</p>
            </div>
          </article>
        </div>
        <div v-else class="empty-box">Aún no hay publicaciones compartidas públicamente.</div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.congregation-profile-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f6f3ee 0%, #eef4ef 100%);
  color: #1f2a2f;
  font-family: Inter, 'Segoe UI', sans-serif;
}

.profile-header {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 24px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.back-link,
.profile-header-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: #1f2a2f;
  font-weight: 700;
}

.profile-header-brand {
  font-size: 1.2rem;
}

.brand-mark {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: linear-gradient(135deg, #1d7a63, #d7a95e);
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
}

.brand-mark + span span { color: #1d7a63; }

.profile-shell {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px 72px;
}

.hero-card {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 28px;
  background: rgba(255,255,255,0.7);
  border: 1px solid rgba(31,42,47,0.08);
  border-radius: 30px;
  box-shadow: 0 24px 60px rgba(31,42,47,0.08);
  overflow: hidden;
}

.hero-copy {
  padding: 36px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.72rem;
  font-weight: 800;
  color: #2f6d5a;
  margin: 0 0 12px;
}

.hero-copy h1 {
  margin: 0;
  font-size: clamp(2.5rem, 5vw, 4rem);
  line-height: 1;
}

.lead {
  margin-top: 18px;
  font-size: 1.06rem;
  line-height: 1.7;
  color: #44616d;
  max-width: 60ch;
}

.hero-metrics {
  margin-top: 28px;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.hero-metrics div {
  min-width: 120px;
  padding: 16px 18px;
  background: #f0f7f4;
  border-radius: 18px;
  border: 1px solid rgba(29,122,99,0.12);
}

.hero-metrics strong {
  display: block;
  font-size: 1.8rem;
  line-height: 1.1;
}

.hero-metrics span {
  color: #4a5c62;
  font-size: 0.8rem;
}

.hero-visual {
  position: relative;
  min-height: 360px;
}

.hero-visual img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.location-badge {
  position: absolute;
  bottom: 18px;
  left: 18px;
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(255,255,255,0.9);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}

.info-grid {
  margin-top: 32px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.info-panel, .content-section, .event-card, .area-card, .post-card {
  background: rgba(255,255,255,0.85);
  border: 1px solid rgba(31,42,47,0.08);
  border-radius: 24px;
  box-shadow: 0 14px 38px rgba(31,42,47,0.04);
}

.info-panel {
  padding: 22px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.panel-title h2 {
  margin: 0;
  font-size: 1.1rem;
}

.info-panel p,
.info-panel li,
.event-details p,
.post-copy p,
.area-card li span {
  color: #48606a;
  line-height: 1.65;
}

.map-link {
  display: inline-flex;
  margin-top: 10px;
  color: #1d7a63;
  font-weight: 700;
  text-decoration: none;
}

.bullet-list {
  margin: 12px 0 0;
  padding-left: 18px;
}

.content-section {
  margin-top: 34px;
  padding: 24px;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

.section-heading h2 {
  margin: 0;
  font-size: clamp(1.5rem, 2vw, 2rem);
}

.section-heading span {
  color: #4f5d63;
  font-weight: 700;
}

.events-list {
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
  align-items: center;
  justify-content: center;
  padding: 16px 12px;
  border-radius: 18px;
  background: linear-gradient(180deg, #e4f1ec, #f5f5f0);
  color: #114e3a;
}

.event-date span {
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
}

.event-date strong {
  font-size: 2rem;
  line-height: 1;
}

.event-time {
  margin: 0 0 6px;
  color: #2f6d5a;
  font-weight: 700;
}

.event-details h3,
.area-card h3,
.post-copy h3 {
  margin: 0 0 8px;
}

.event-details small {
  color: #55717b;
}

.areas-grid,
.posts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.area-card {
  padding: 20px;
}

.area-card ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.area-card li {
  display: grid;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid rgba(31,42,47,0.08);
}

.area-card li strong {
  color: #1e2c34;
}

.post-card {
  overflow: hidden;
}

.post-image-wrap {
  height: 220px;
}

.post-image-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.post-copy {
  padding: 20px;
}

.post-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #49636f;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
}

.empty-box,
.profile-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  border-radius: 22px;
  border: 1px dashed rgba(31,42,47,0.2);
  background: rgba(255,255,255,0.5);
  color: #445760;
  text-align: center;
  padding: 24px;
}

.profile-error {
  color: #8a2b2b;
  border-color: rgba(138,43,43,0.3);
}

.mini-icon {
  width: 18px;
  height: 18px;
}

@media (max-width: 900px) {
  .hero-card,
  .info-grid,
  .areas-grid,
  .posts-grid {
    grid-template-columns: 1fr;
  }

  .event-card {
    grid-template-columns: 1fr;
  }

  .profile-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
}
</style>
