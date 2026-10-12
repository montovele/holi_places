<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowRightIcon, CalendarDaysIcon, CheckIcon, CircleStackIcon, ClockIcon, CreditCardIcon, LockClosedIcon, Squares2X2Icon } from '@heroicons/vue/24/outline'
import modules from '../modules/registry'
import { useSystemStore } from '../stores/system'
import { useAuthStore } from '../stores/auth'

const system = useSystemStore()
const auth = useAuthStore()
const modulesEnabled = computed(() => auth.user?.role === 'superadmin' || auth.subscription?.status === 'active')
const currentTime = ref(Date.now())
let countdownTimer
const currentDate = computed(() => new Intl.DateTimeFormat('es', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date()))
const eventDate = (value) => new Intl.DateTimeFormat('es', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
}).format(new Date(value))
const shortcuts = modules.filter(({ id }) => ['events', 'reservations', 'members', 'locations'].includes(id))
const subscriptionStatusLabels = {
  active: 'Activa',
  pending_payment: 'Pendiente de asignación',
  past_due: 'Pago pendiente',
  canceled: 'Cancelada',
  expired: 'Vencida',
  not_registered: 'Sin suscripción',
}

function parseSubscriptionDate(value) {
  if (!value) return null
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value
  const hasTimezone = typeof normalized === 'string' && normalized.includes('T') && /(Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
  const date = new Date(typeof normalized === 'string' && !hasTimezone ? `${normalized}Z` : normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatSubscriptionDate(value) {
  const date = parseSubscriptionDate(value)
  return date ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(date) : 'No disponible'
}

function formatSubscriptionPrice() {
  const { amount, currency = 'MXN' } = auth.subscription || {}
  if (amount === null || amount === undefined || amount === '') return 'Sin precio asignado'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount))
}

function formatSubscriptionInterval() {
  const { intervalUnit, intervalCount = 1 } = auth.subscription || {}
  if (!intervalUnit) return 'Periodicidad no disponible'
  const unit = intervalUnit === 'month' ? 'mes' : 'año'
  if (Number(intervalCount) === 1) return `Cada ${unit}`
  return `Cada ${intervalCount} ${intervalUnit === 'month' ? 'meses' : 'años'}`
}

const subscriptionDaysRemaining = computed(() => {
  const end = parseSubscriptionDate(auth.subscription?.currentPeriodEnd)
  return end ? Math.max(0, Math.ceil((end.getTime() - currentTime.value) / 86400000)) : null
})

const subscriptionModules = computed(() => (auth.subscription?.activeModules || []).map((moduleId) => (
  moduleId.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
)))

onMounted(() => {
  countdownTimer = setInterval(() => { currentTime.value = Date.now() }, 60000)
  if (auth.user?.role !== 'superadmin') auth.loadSubscription().catch(() => {})
})
onBeforeUnmount(() => clearInterval(countdownTimer))
</script>

<template>
  <section class="dashboard-view">
    <div class="welcome-row">
      <div>
        <p class="eyebrow">CENTRO DE OPERACIONES</p>
        <h2>Tu organización, en orden.</h2>
        <p class="welcome-copy">Una base preparada para conectar las áreas de gestión.</p>
      </div>
      <time class="date-chip">{{ currentDate }}</time>
    </div>

    <section v-if="auth.subscription && auth.user?.role !== 'superadmin'" class="dashboard-subscription" :class="`dashboard-subscription-${auth.subscription.status}`" aria-label="Resumen de suscripción">
      <div class="dashboard-subscription-heading">
        <div class="dashboard-subscription-title">
          <span class="dashboard-subscription-icon"><CheckIcon v-if="auth.subscription.status === 'active'" /><CreditCardIcon v-else /></span>
          <div>
            <p class="eyebrow">SUSCRIPCIÓN DE LA ORGANIZACIÓN</p>
            <h3>{{ auth.subscription.plan?.name || 'Estado de tu servicio' }}</h3>
          </div>
        </div>
        <span class="dashboard-subscription-status">{{ subscriptionStatusLabels[auth.subscription.status] || auth.subscription.status }}</span>
      </div>

      <div v-if="auth.subscription.plan || auth.subscription.status === 'active'" class="dashboard-subscription-price-line">
        <strong>{{ formatSubscriptionPrice() }}</strong>
        <span>{{ formatSubscriptionInterval() }}</span>
      </div>

      <div v-if="auth.subscription.plan || auth.subscription.status === 'active'" class="dashboard-subscription-facts">
        <div><span><CalendarDaysIcon /> Periodo actual</span><strong>{{ auth.subscription.currentPeriodStart || auth.subscription.currentPeriodEnd ? `${formatSubscriptionDate(auth.subscription.currentPeriodStart)} – ${formatSubscriptionDate(auth.subscription.currentPeriodEnd)}` : auth.subscription.periodSyncPending ? 'Fechas pendientes de sincronizar con Stripe' : 'Fechas aún no registradas' }}</strong></div>
        <div><span><ClockIcon /> {{ auth.subscription.status === 'canceled' ? 'Fin de acceso' : 'Próxima renovación' }}</span><strong>{{ auth.subscription.currentPeriodEnd ? formatSubscriptionDate(auth.subscription.currentPeriodEnd) : auth.subscription.periodSyncPending ? 'Pendiente de sincronización' : 'Sin fecha registrada' }}</strong><small v-if="subscriptionDaysRemaining !== null">{{ subscriptionDaysRemaining === 0 ? 'Hoy' : `${subscriptionDaysRemaining} días restantes` }}</small></div>
      </div>

      <p v-if="auth.subscription.status === 'pending_payment' && !auth.subscription.plan" class="dashboard-subscription-message">Tu organización todavía no tiene un plan. Explora las opciones disponibles y contrata el servicio desde aquí.</p>
      <p v-else-if="auth.subscription.status === 'past_due'" class="dashboard-subscription-message">El pago requiere atención. Contacta a la persona responsable de la cuenta.</p>
      <div v-if="subscriptionModules.length" class="dashboard-subscription-modules">
        <span>Módulos incluidos · {{ subscriptionModules.length }}</span>
        <div><span v-for="moduleName in subscriptionModules" :key="moduleName">{{ moduleName }}</span></div>
      </div>
      <div class="dashboard-subscription-footer">
        <span v-if="auth.subscription.status === 'active'">{{ subscriptionModules.length }} módulos habilitados</span>
        <span v-else>Los módulos requieren una suscripción activa.</span>
        <RouterLink class="dashboard-subscription-link" :to="{ name: 'billing' }">{{ auth.subscription.status === 'pending_payment' ? 'Elegir plan' : 'Ver detalles' }} <ArrowRightIcon aria-hidden="true" /></RouterLink>
      </div>
    </section>

    <div class="connection-panel" :class="`connection-${system.apiStatus}`">
      <span class="connection-symbol"><CircleStackIcon aria-hidden="true" /></span>
      <div class="connection-copy">
          <strong>{{ system.apiStatus === 'online' ? 'API y base de datos disponibles' : system.apiStatus === 'checking' ? 'Comprobando API y base de datos' : 'No se pudo conectar con Express' }}</strong>
          <span>{{ system.apiStatus === 'online' ? `${system.databaseEngine === 'mysql' ? 'MySQL' : 'Base de datos'} conectada.` : system.apiError || 'El endpoint /api/health responderá cuando el backend esté iniciado.' }}</span>
      </div>
      <button class="refresh-button" aria-label="Comprobar conexión con API" @click="system.checkApi()">
        <ArrowRightIcon aria-hidden="true" />
      </button>
    </div>

    <div class="dashboard-columns">
      <section class="panel agenda-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">ACTIVIDAD</p><h3>Agenda próxima</h3></div>
          <RouterLink v-if="modulesEnabled" class="text-link" :to="{ name: 'events' }">Agenda <ArrowRightIcon aria-hidden="true" /></RouterLink>
          <span v-else class="text-link shortcut-disabled" aria-disabled="true">Agenda <LockClosedIcon aria-hidden="true" /></span>
        </div>
        <div v-if="system.events.length" class="event-list">
          <article v-for="event in system.events" :key="event.id" class="event-row">
            <time class="event-date">{{ eventDate(event.startsAt) }}</time>
            <div class="event-details">
              <strong>{{ event.name }}</strong>
              <span>{{ event.location }} · {{ event.reservationCount }} {{ event.reservationCount === 1 ? 'reserva' : 'reservas' }}</span>
            </div>
          </article>
        </div>
        <div v-else class="empty-state">
          <span class="empty-icon"><CalendarDaysIcon aria-hidden="true" /></span>
          <strong>{{ system.dashboardError ? 'No se pudo cargar la agenda' : 'Sin actividades para mostrar' }}</strong>
          <p>{{ system.dashboardError || 'No hay actividades próximas registradas.' }}</p>
        </div>
      </section>

      <section class="panel shortcuts-panel">
        <div class="panel-heading"><div><p class="eyebrow">MÓDULOS</p><h3>Accesos directos</h3></div></div>
        <nav class="shortcut-list" aria-label="Accesos directos">
          <template v-if="modulesEnabled">
            <RouterLink v-for="module in shortcuts" :key="module.id" class="shortcut-link" :to="{ name: module.id }">
              <span>{{ module.label }}</span><ArrowRightIcon aria-hidden="true" />
            </RouterLink>
          </template>
          <template v-else>
            <button v-for="module in shortcuts" :key="module.id" class="shortcut-link shortcut-disabled" type="button" disabled>
              <span>{{ module.label }}</span><LockClosedIcon aria-hidden="true" />
            </button>
          </template>
        </nav>
      </section>
    </div>

    <section class="module-index">
      <div class="module-index-heading"><Squares2X2Icon aria-hidden="true" /><h3>Áreas de administración</h3><span>{{ modules.length }} módulos</span></div>
      <div class="module-chips">
        <template v-if="modulesEnabled">
          <RouterLink v-for="module in modules" :key="module.id" :to="{ name: module.id }">{{ module.label }}</RouterLink>
        </template>
        <template v-else>
          <button v-for="module in modules" :key="module.id" class="module-chip-disabled" type="button" disabled>
            {{ module.label }} <LockClosedIcon aria-hidden="true" />
          </button>
        </template>
      </div>
    </section>
  </section>
</template>

<script>
export default {
  data: () => ({ modules }),
}
</script>