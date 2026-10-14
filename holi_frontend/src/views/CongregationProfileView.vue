<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeftIcon, ArrowRightIcon, CalendarDaysIcon, ClockIcon, GlobeAltIcon, MapPinIcon, NewspaperIcon, StarIcon, UsersIcon } from '@heroicons/vue/24/outline'
import { getPublicCommunity } from '../services/communityService'
import ScrollAdSlot from '../components/community/ScrollAdSlot.vue'
import { usePublicAdRotation } from '../composables/usePublicAdRotation'

const route = useRoute()

const community = ref({ congregations: [], events: [], posts: [], moduleUpdates: [], ads: [] })
const { ads: liveAds } = usePublicAdRotation()
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
const profileAds = computed(() => {
  const targetedAds = liveAds.value.filter((ad) => ad.placement === 'profile')
  const availableAds = targetedAds.length
    ? targetedAds
    : liveAds.value.filter((ad) => ad.placement === 'content')
  return availableAds.map((ad) => ({ ...ad, placement: 'profile' }))
})
const mapDestination = computed(() => {
  const { latitude, longitude, address = '', city = '' } = congregation.value || {}
  const coordinates = [latitude, longitude].map(Number)
  const destination = coordinates.every(Number.isFinite) && coordinates[0] !== 0 && coordinates[1] !== 0
    ? `${coordinates[0]},${coordinates[1]}`
    : [address, city].filter(Boolean).join(', ')
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
})

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

async function loadData(congregationId) {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await getPublicCommunity()
    if (congregationId !== route.params.congregationId) return
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
    if (congregationId !== route.params.congregationId) return
    errorMessage.value = error.response?.data?.error?.message || 'No pudimos cargar la información pública de la congregación.'
  } finally {
    if (congregationId === route.params.congregationId) loading.value = false
  }
}

watch(() => route.params.congregationId, loadData, { immediate: true })
</script>

<template>
  <div class="congregation-profile-page">
    <header class="profile-header">
      <RouterLink class="back-link" :to="{ name: 'community' }"><ArrowLeftIcon aria-hidden="true" /> Volver a comunidad</RouterLink>
      <RouterLink class="profile-header-brand" :to="{ name: 'home' }" aria-label="Holi Places, inicio">
        <span class="brand-mark">H</span><span>holi<span>places</span></span>
      </RouterLink>
    </header>

    <main v-if="loading" class="profile-state" role="status"><span class="loading-mark" aria-hidden="true"></span><span>Cargando ficha pública…</span></main>
    <main v-else-if="errorMessage" class="profile-state profile-error" role="alert">
      <div><p>{{ errorMessage }}</p><button class="profile-button profile-button-primary" type="button" @click="loadData(route.params.congregationId)">Reintentar <ArrowRightIcon aria-hidden="true" /></button></div>
    </main>
    <main v-else-if="!congregation" class="profile-state">La congregación no está disponible.</main>
    <main v-else class="profile-shell">
      <nav class="profile-nav" aria-label="Navegación de la congregación">
        <span class="profile-nav-label">Explora</span>
        <a href="#perfil">Perfil</a><a href="#agenda">Agenda</a><a href="#areas">Áreas</a><a href="#historias">Historias</a>
        <a class="profile-nav-directions" :href="mapDestination" target="_blank" rel="noopener noreferrer"><MapPinIcon aria-hidden="true" /> Cómo llegar</a>
      </nav>

      <div class="profile-content">
        <section id="perfil" class="hero-card profile-reveal">
          <div class="hero-visual">
            <img src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1800&q=88" alt="Personas reunidas en una actividad comunitaria" fetchpriority="high" />
            <span class="location-badge"><MapPinIcon aria-hidden="true" />{{ congregation.city }}</span>
            <span class="hero-image-caption">COMUNIDAD ABIERTA <i></i> {{ congregation.city }}</span>
          </div>
          <div class="hero-copy">
            <p class="eyebrow"><GlobeAltIcon aria-hidden="true" /> UNA COMUNIDAD CERCA DE TI</p>
            <h1>{{ congregation.name }}</h1>
            <p class="lead">Encuentros, historias y actividades para conocer lo que sucede en esta comunidad y encontrar un espacio para participar.</p>
            <div class="hero-actions">
              <a class="profile-button profile-button-primary" href="#agenda">Ver próximos encuentros <ArrowRightIcon aria-hidden="true" /></a>
              <a class="profile-button profile-button-secondary" :href="mapDestination" target="_blank" rel="noopener noreferrer"><MapPinIcon aria-hidden="true" /> Cómo llegar</a>
            </div>
            <div class="hero-metrics" aria-label="Resumen de la congregación">
              <div><strong>{{ congregationEvents.length }}</strong><span>encuentros</span></div>
              <div><strong>{{ congregationPosts.length }}</strong><span>publicaciones</span></div>
              <div><strong>{{ congregationUpdates.length }}</strong><span>aportes públicos</span></div>
            </div>
          </div>
        </section>

        <ScrollAdSlot :ads="profileAds" placement="profile" :slot-index="0" :slot-count="3" :slot-seed="0" />

        <section class="info-grid profile-reveal" aria-label="Información de la congregación">
          <article class="info-panel info-location">
            <div class="panel-title"><span class="panel-icon"><MapPinIcon aria-hidden="true" /></span><h2>Encuéntranos</h2></div>
            <p v-if="congregation.type">{{ congregation.type }}</p>
            <p>{{ congregation.address || 'La ficha no incluye una dirección textual.' }}</p><p>{{ congregation.city }}</p>
            <p v-if="congregation.rating !== null && congregation.rating !== undefined" class="profile-rating"><StarIcon aria-hidden="true" />{{ Number(congregation.rating).toFixed(1) }} <span v-if="congregation.reviewCount !== null && congregation.reviewCount !== undefined">· {{ congregation.reviewCount }} reseñas en Maps</span></p>
            <a v-if="congregation.phone" class="text-action" :href="`tel:${congregation.phone}`">{{ congregation.phone }}</a>
            <a v-if="congregation.website" class="text-action" :href="congregation.website" target="_blank" rel="noopener noreferrer">Sitio web <ArrowRightIcon aria-hidden="true" /></a>
            <a class="text-action" :href="congregation.mapsUrl || mapDestination" target="_blank" rel="noopener noreferrer">Abrir en Google Maps <ArrowRightIcon aria-hidden="true" /></a>
          </article>
          <article class="info-panel info-next-event">
            <div class="panel-title"><span class="panel-icon"><CalendarDaysIcon aria-hidden="true" /></span><h2>Lo próximo</h2></div>
            <template v-if="nextEvent"><h3>{{ nextEvent.title }}</h3><p>{{ formatEventDate(nextEvent.startsAt) }} · {{ formatHour(nextEvent.startsAt) }}</p></template>
            <p v-else>No hay encuentros públicos programados.</p>
            <a class="text-action" href="#agenda">Ver agenda <ArrowRightIcon aria-hidden="true" /></a>
          </article>
          <article class="info-panel info-community">
            <div class="panel-title"><span class="panel-icon"><UsersIcon aria-hidden="true" /></span><h2>Vida compartida</h2></div>
            <p>Información autorizada sobre actividades, recursos y comunicaciones de la congregación.</p>
            <a class="text-action" href="#areas">Conocer las áreas <ArrowRightIcon aria-hidden="true" /></a>
          </article>
        </section>

        <ScrollAdSlot :ads="profileAds" placement="profile" :slot-index="1" :slot-count="3" :slot-seed="1" />

        <section id="agenda" class="content-section profile-reveal">
          <div class="section-heading"><div><p class="section-kicker">PARTICIPA</p><h2>Agenda pública</h2></div><span>{{ congregationEvents.length }} {{ congregationEvents.length === 1 ? 'encuentro próximo' : 'encuentros próximos' }}</span></div>
          <div v-if="congregationEvents.length" class="events-list">
            <article v-for="event in congregationEvents" :key="event.id" class="event-card">
              <div class="event-date"><span>{{ formatDate(event.startsAt, { month: 'short' }).replace('.', '') }}</span><strong>{{ new Date(event.startsAt).getDate() }}</strong></div>
              <div class="event-details"><p class="event-time"><ClockIcon aria-hidden="true" />{{ formatEventDate(event.startsAt) }} · {{ formatHour(event.startsAt) }}</p><h3>{{ event.title }}</h3><p>{{ event.description }}</p><small>{{ event.attendeeCount || 0 }} {{ event.attendeeCount === 1 ? 'persona inscrita' : 'personas inscritas' }}</small></div>
            </article>
          </div>
          <div v-else class="empty-box"><CalendarDaysIcon aria-hidden="true" /><span>Todavía no hay encuentros públicos para esta congregación.</span></div>
        </section>

        <ScrollAdSlot :ads="profileAds" placement="profile" :slot-index="2" :slot-count="3" :slot-seed="2" />

        <section id="areas" class="content-section profile-reveal">
          <div class="section-heading"><div><p class="section-kicker">LO QUE COMPARTIMOS</p><h2>Áreas públicas</h2></div><span>{{ groupedUpdates.length }} {{ groupedUpdates.length === 1 ? 'área' : 'áreas' }}</span></div>
          <div v-if="groupedUpdates.length" class="areas-grid">
            <article v-for="section in groupedUpdates" :key="section.moduleId" class="area-card"><h3>{{ section.label }}</h3><ul><li v-for="item in section.items.slice(0, 4)" :key="item.id"><strong>{{ item.title }}</strong><span>{{ item.description || item.detail || 'Contenido publicado' }}</span></li></ul></article>
          </div>
          <div v-else class="empty-box"><UsersIcon aria-hidden="true" /><span>No hay contenidos públicos publicados en esta congregación.</span></div>
        </section>

        <section id="historias" class="content-section profile-reveal">
          <div class="section-heading"><div><p class="section-kicker">VOCES DE LA COMUNIDAD</p><h2>Publicaciones y actividades</h2></div><span>{{ congregationPosts.length }} {{ congregationPosts.length === 1 ? 'historia' : 'historias' }}</span></div>
          <div v-if="congregationPosts.length" class="posts-grid">
            <article v-for="post in congregationPosts" :key="post.id" class="post-card">
              <div class="post-image-wrap"><img :src="post.imageUrl || 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=80'" :alt="post.title" loading="lazy" /></div>
              <div class="post-copy"><div class="post-meta"><span>{{ post.type === 'activity' ? 'Actividad' : 'Publicación' }}</span><time>{{ formatDate(post.publishedAt) }}</time></div><h3>{{ post.title }}</h3><p>{{ post.excerpt || post.body }}</p></div>
            </article>
          </div>
          <div v-else class="empty-box"><NewspaperIcon aria-hidden="true" /><span>Aún no hay publicaciones compartidas públicamente.</span></div>
        </section>
      </div>

      <footer class="profile-footer"><RouterLink :to="{ name: 'community' }"><ArrowLeftIcon aria-hidden="true" /> Regresar a Comunidad</RouterLink><a href="#perfil">Volver arriba <ArrowRightIcon aria-hidden="true" /></a></footer>
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

.congregation-profile-page {
  --profile-ink: #183b31;
  --profile-muted: #66756b;
  --profile-paper: #f7f8f3;
  --profile-line: #dfe6dc;
  --profile-green: #245d46;
  --profile-coral: #b85843;
  min-height: 100vh;
  overflow: clip;
  color: var(--profile-ink);
  background-color: var(--profile-paper);
  background-image: linear-gradient(rgba(35, 83, 61, .025) 1px, transparent 1px), linear-gradient(90deg, rgba(35, 83, 61, .025) 1px, transparent 1px);
  background-size: 32px 32px;
  font-family: 'DM Sans', sans-serif;
}

.profile-header {
  max-width: 1280px;
  min-height: 66px;
  align-items: center;
  padding: 10px 38px;
}

.back-link,
.profile-header-brand { font-size: 12px; }
.back-link { gap: 8px; color: #4f6559; transition: color 160ms ease; }
.back-link:hover { color: var(--profile-coral); }
.back-link svg { width: 15px; height: 15px; }
.profile-header-brand { gap: 9px; font: 800 15px 'Manrope', sans-serif; }
.brand-mark { width: 32px; height: 32px; border-radius: 50%; background: var(--profile-green); font: 700 17px 'Cormorant Garamond', serif; }
.brand-mark + span span { color: var(--profile-coral); }

.profile-shell { max-width: none; margin: 0; padding: 0 0 24px; }
.profile-nav {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: center;
  gap: clamp(18px, 3vw, 42px);
  padding: 8px 28px;
  border-block: 1px solid rgba(24, 59, 49, .1);
  background: rgba(247, 248, 243, .94);
  backdrop-filter: blur(14px);
}
.profile-nav a { color: #56685c; font-size: 11px; font-weight: 700; text-decoration: none; transition: color 160ms ease; }
.profile-nav a:hover { color: var(--profile-coral); }
.profile-nav-label { color: #8a968d; font-size: 9px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.profile-nav .profile-nav-directions { display: inline-flex; align-items: center; gap: 7px; color: var(--profile-green); }
.profile-nav-directions svg { width: 15px; height: 15px; }
.profile-content { width: min(1210px, 100%); margin: 0 auto; padding: 36px 34px 0; }
.profile-content > section[id] { scroll-margin-top: 82px; }

.hero-card {
  position: relative;
  display: grid;
  min-height: 440px;
  grid-template-columns: minmax(0, 1.02fr) minmax(0, .98fr);
  gap: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  isolation: isolate;
}
.hero-visual { min-height: 430px; overflow: hidden; background: #d9e4d9; }
.hero-visual::after { position: absolute; inset: 0 auto 0 0; width: 51%; background: linear-gradient(90deg, transparent 72%, var(--profile-paper) 100%); content: ''; pointer-events: none; }
.hero-visual img { transition: transform 700ms cubic-bezier(.2,.7,.2,1); }
.hero-card:hover .hero-visual img { transform: scale(1.035); }
.location-badge { bottom: 22px; left: 22px; padding: 9px 13px; border: 1px solid rgba(255,255,255,.7); border-radius: 3px; color: var(--profile-ink); background: rgba(250, 251, 246, .94); font-size: 11px; }
.location-badge svg { width: 15px; height: 15px; color: var(--profile-coral); }
.hero-image-caption { position: absolute; right: 20px; bottom: 25px; display: flex; align-items: center; gap: 9px; color: #fff; font-size: 9px; font-weight: 800; letter-spacing: .1em; text-shadow: 0 1px 8px rgba(0,0,0,.55); }
.hero-image-caption i { width: 4px; height: 4px; border-radius: 50%; background: #efb45d; }
.hero-copy { z-index: 1; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; padding: 38px 10px 38px 30px; }
.eyebrow { gap: 8px; margin-bottom: 18px; color: #5c805f; font-size: 9px; letter-spacing: .14em; }
.mini-icon { width: 14px; height: 14px; }
.hero-copy h1 { max-width: 610px; color: var(--profile-ink); font: 600 clamp(42px, 5.4vw, 70px)/.98 'Cormorant Garamond', serif; overflow-wrap: anywhere; }
.lead { max-width: 470px; margin: 17px 0 0; color: var(--profile-muted); font-size: 13px; line-height: 1.75; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
.profile-button { display: inline-flex; min-height: 42px; align-items: center; justify-content: center; gap: 9px; padding: 0 14px; border: 1px solid transparent; border-radius: 3px; font: 700 10px 'DM Sans', sans-serif; text-decoration: none; transition: transform 160ms ease, background 160ms ease, border-color 160ms ease; }
.profile-button:hover { transform: translateY(-2px); }
.profile-button svg { width: 15px; height: 15px; }
.profile-button-primary { color: white; background: var(--profile-green); }
.profile-button-primary:hover { background: #174630; }
.profile-button-secondary { border-color: #cbd8ca; color: var(--profile-green); background: rgba(255,255,255,.5); }
.profile-button-secondary:hover { border-color: var(--profile-green); }
.hero-metrics { width: 100%; gap: 0; margin-top: 28px; padding-top: 17px; border-top: 1px solid var(--profile-line); }
.hero-metrics div { min-width: 0; flex: 1; padding: 0 13px; border: 0; border-radius: 0; background: transparent; }
.hero-metrics div:first-child { padding-left: 0; }
.hero-metrics div + div { border-left: 1px solid var(--profile-line); }
.hero-metrics strong { color: var(--profile-coral); font: 700 23px 'Manrope', sans-serif; }
.hero-metrics span { display: block; margin-top: 3px; color: var(--profile-muted); font-size: 9px; }

.info-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 30px; }
.info-panel { min-width: 0; padding: 20px; border: 1px solid var(--profile-line); border-radius: 5px; background: rgba(255,255,255,.72); box-shadow: none; transition: border-color 180ms ease, transform 180ms ease; }
.info-panel:hover { transform: translateY(-3px); border-color: #a8c0a8; }
.panel-title { gap: 10px; margin-bottom: 14px; }
.panel-icon { display: grid; width: 32px; height: 32px; flex: 0 0 auto; place-items: center; color: var(--profile-green); background: #eaf1e8; }
.panel-icon svg { width: 16px; height: 16px; }
.panel-title h2 { color: var(--profile-ink); font: 700 13px 'Manrope', sans-serif; }
.info-panel p { margin: 6px 0; color: var(--profile-muted); font-size: 11px; line-height: 1.6; }
.profile-rating { display: flex; align-items: center; gap: 5px; color: #765a24 !important; font-weight: 700; }
.profile-rating svg { width: 14px; height: 14px; }
.info-panel h3 { margin: 0; color: var(--profile-ink); font: 600 19px/1.2 'Cormorant Garamond', serif; }
.text-action { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; color: var(--profile-green); font-size: 10px; font-weight: 800; text-decoration: none; }
.text-action svg { width: 13px; height: 13px; transition: transform 160ms ease; }
.text-action:hover svg { transform: translateX(3px); }

:deep(.community-ad-slot) { margin: 30px 0; }
:deep(.ad-placement) { margin: 0; }
.content-section { margin-top: 24px; padding: 27px 0 30px; border-top: 1px solid var(--profile-line); border-radius: 0; background: transparent; box-shadow: none; }
.section-heading { align-items: end; margin-bottom: 18px; }
.section-kicker { margin: 0 0 5px; color: #73866f; font-size: 9px; font-weight: 800; letter-spacing: .12em; }
.section-heading h2 { color: var(--profile-ink); font: 600 34px/1 'Cormorant Garamond', serif; }
.section-heading > span { padding-bottom: 3px; color: var(--profile-muted); font-size: 10px; font-weight: 700; }
.events-list { gap: 10px; }
.event-card { grid-template-columns: 78px minmax(0, 1fr); gap: 18px; padding: 16px; border: 1px solid var(--profile-line); border-radius: 4px; background: rgba(255,255,255,.76); box-shadow: none; transition: border-color 180ms ease, transform 180ms ease; }
.event-card:hover { transform: translateX(3px); border-color: #aac2a9; }
.event-date { min-height: 82px; padding: 10px; border-radius: 3px; color: var(--profile-green); background: #e9f0e7; }
.event-date span { font-size: 9px; font-weight: 800; }
.event-date strong { font: 700 31px 'Manrope', sans-serif; }
.event-time { display: flex; align-items: center; gap: 6px; color: #55765a !important; font-size: 10px; }
.event-time svg { width: 13px; height: 13px; }
.event-details h3 { color: var(--profile-ink); font: 700 14px 'Manrope', sans-serif; }
.event-details p { margin: 6px 0; font-size: 11px; }
.event-details small { color: #738078; font-size: 10px; }
.areas-grid, .posts-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.area-card { padding: 20px; border: 1px solid var(--profile-line); border-radius: 4px; background: rgba(255,255,255,.72); box-shadow: none; transition: transform 180ms ease, border-color 180ms ease; }
.area-card:hover, .post-card:hover { transform: translateY(-3px); border-color: #a8c0a8; }
.area-card h3 { margin-bottom: 12px; color: var(--profile-green); font: 700 13px 'Manrope', sans-serif; }
.area-card li { gap: 5px; padding-top: 12px; border-color: var(--profile-line); }
.area-card li strong { color: var(--profile-ink); font-size: 11px; }
.area-card li span { font-size: 10px; }
.post-card { border: 1px solid var(--profile-line); border-radius: 4px; background: rgba(255,255,255,.76); box-shadow: none; transition: transform 180ms ease, border-color 180ms ease; }
.post-image-wrap { height: clamp(170px, 22vw, 240px); overflow: hidden; background: #dfe8df; }
.post-image-wrap img { transition: transform 500ms ease; }
.post-card:hover .post-image-wrap img { transform: scale(1.035); }
.post-copy { padding: 16px 18px 19px; }
.post-meta { color: var(--profile-muted); font-size: 9px; }
.post-meta span { color: var(--profile-coral); font-weight: 800; }
.post-copy h3 { color: var(--profile-ink); font: 700 14px 'Manrope', sans-serif; }
.post-copy p { margin-bottom: 0; font-size: 11px; }
.empty-box { min-height: 110px; justify-content: flex-start; gap: 12px; border: 1px dashed #c6d2c4; border-radius: 4px; color: var(--profile-muted); background: rgba(255,255,255,.45); font-size: 11px; }
.empty-box svg { width: 20px; height: 20px; flex: 0 0 auto; color: #648266; }
.profile-state { max-width: 700px; min-height: 300px; gap: 14px; margin: 35px auto; border: 1px solid var(--profile-line); border-radius: 5px; background: #fff; font-size: 13px; }
.profile-error { flex-direction: column; color: #8a3c32; }
.profile-error p { margin: 0 0 14px; }
.loading-mark { width: 20px; height: 20px; border: 2px solid #d8e3d7; border-top-color: var(--profile-green); border-radius: 50%; animation: profile-spin 750ms linear infinite; }
.profile-footer { display: flex; justify-content: space-between; gap: 15px; max-width: 1210px; margin: 28px auto 0; padding: 20px 34px 0; border-top: 1px solid var(--profile-line); }
.profile-footer a { display: inline-flex; align-items: center; gap: 8px; color: #56695b; font-size: 10px; font-weight: 800; text-decoration: none; }
.profile-footer a:hover { color: var(--profile-coral); }
.profile-footer svg { width: 14px; height: 14px; }
.profile-reveal { animation: profile-enter 650ms cubic-bezier(.2,.7,.2,1) both; }
.info-grid.profile-reveal { animation-delay: 90ms; }
@keyframes profile-enter { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes profile-spin { to { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .profile-content { padding-inline: 24px; }
  .hero-card { min-height: 390px; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); }
  .hero-visual { min-height: 390px; }
  .hero-copy { padding-left: 8px; }
  .hero-copy h1 { font-size: 52px; }
  .info-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .info-community { grid-column: 1 / -1; }
  .profile-header { padding-inline: 24px; }
}

@media (max-width: 620px) {
  .profile-header { min-height: 58px; padding: 9px 17px; }
  .profile-header-brand { font-size: 13px; }
  .back-link { font-size: 10px; }
  .profile-nav { justify-content: flex-start; gap: 21px; overflow-x: auto; padding-inline: 17px; scrollbar-width: none; }
  .profile-nav::-webkit-scrollbar { display: none; }
  .profile-nav-label { display: none; }
  .profile-nav a { flex: 0 0 auto; font-size: 10px; }
  .profile-content { padding: 16px 17px 0; }
  .hero-card { display: flex; flex-direction: column; }
  .hero-visual { min-height: 245px; height: 245px; }
  .hero-visual::after { inset: auto 0 0; width: auto; height: 36%; background: linear-gradient(transparent, rgba(13, 37, 28, .42)); }
  .hero-image-caption { right: 13px; bottom: 17px; font-size: 8px; }
  .location-badge { bottom: 12px; left: 12px; padding: 7px 10px; font-size: 9px; }
  .hero-copy { padding: 23px 0 5px; }
  .eyebrow { margin-bottom: 12px; font-size: 8px; }
  .hero-copy h1 { font-size: 47px; }
  .lead { margin-top: 12px; font-size: 12px; }
  .hero-actions { width: 100%; gap: 8px; margin-top: 16px; }
  .profile-button { min-height: 40px; padding-inline: 11px; font-size: 9px; }
  .hero-metrics { margin-top: 19px; padding-top: 13px; }
  .hero-metrics div { padding-inline: 8px; }
  .hero-metrics strong { font-size: 20px; }
  .hero-metrics span { font-size: 8px; }
  .info-grid { grid-template-columns: 1fr; gap: 9px; margin-top: 20px; }
  .info-community { grid-column: auto; }
  .info-panel { padding: 16px; }
  :deep(.community-ad-slot) { margin: 20px 0; }
  .content-section { margin-top: 14px; padding-block: 22px; }
  .section-heading { align-items: flex-end; gap: 8px; }
  .section-heading h2 { font-size: 30px; }
  .section-heading > span { max-width: 115px; text-align: right; font-size: 9px; }
  .event-card { grid-template-columns: 58px minmax(0, 1fr); gap: 12px; padding: 11px; }
  .event-date { min-height: 69px; }
  .event-date strong { font-size: 25px; }
  .areas-grid, .posts-grid { grid-template-columns: 1fr; }
  .post-image-wrap { height: 205px; }
  .profile-footer { margin-top: 20px; padding: 17px; }
}

@media (prefers-reduced-motion: reduce) {
  .congregation-profile-page *, .congregation-profile-page *::before, .congregation-profile-page *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
</style>
