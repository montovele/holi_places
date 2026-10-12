<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowPathIcon, CalendarDaysIcon, CheckIcon, ClockIcon, CreditCardIcon } from '@heroicons/vue/24/outline'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const refreshing = ref(false)
const error = ref('')
const currentTime = ref(Date.now())
let countdownTimer

const subscription = computed(() => auth.subscription || {})
const statusLabels = {
  active: 'Activa',
  pending_payment: 'Pendiente de asignación',
  past_due: 'Pago pendiente',
  canceled: 'Cancelada',
  expired: 'Vencida',
  not_registered: 'Sin suscripción',
}

function parseDate(value) {
  if (!value) return null
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value
  const hasTimezone = typeof normalized === 'string' && normalized.includes('T') && /(Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
  const date = new Date(typeof normalized === 'string' && !hasTimezone ? `${normalized}Z` : normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value) {
  const date = parseDate(value)
  return date ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(date) : 'No disponible'
}

const priceLabel = computed(() => {
  if (subscription.value.amount === null || subscription.value.amount === undefined || subscription.value.amount === '') return 'Sin precio asignado'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: subscription.value.currency || 'MXN',
    maximumFractionDigits: 2,
  }).format(Number(subscription.value.amount))
})

const intervalLabel = computed(() => {
  const unit = subscription.value.intervalUnit
  if (!unit) return 'Periodicidad no disponible'
  const count = Number(subscription.value.intervalCount || 1)
  if (count === 1) return `Cada ${unit === 'month' ? 'mes' : 'año'}`
  return `Cada ${count} ${unit === 'month' ? 'meses' : 'años'}`
})

const daysRemaining = computed(() => {
  const end = parseDate(subscription.value.currentPeriodEnd)
  return end ? Math.max(0, Math.ceil((end.getTime() - currentTime.value) / 86400000)) : null
})

const modules = computed(() => (subscription.value.activeModules || []).map((moduleId) => (
  moduleId.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
)))

async function refreshSubscription() {
  refreshing.value = true
  error.value = ''
  try {
    await auth.loadSubscription()
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo actualizar la información de suscripción.'
  } finally {
    refreshing.value = false
  }
}

onMounted(() => {
  countdownTimer = setInterval(() => { currentTime.value = Date.now() }, 60000)
  refreshSubscription()
})
onBeforeUnmount(() => clearInterval(countdownTimer))
</script>

<template>
  <section class="subscription-overview subscription-module-overview" aria-label="Información de la suscripción contratada">
    <div class="subscription-overview-heading">
      <div>
        <p class="eyebrow compact">PLAN CONTRATADO</p>
        <h2>{{ subscription.plan?.name || 'Sin plan asignado' }}</h2>
      </div>
      <div class="subscription-module-status" :class="`subscription-module-status-${subscription.status || 'unknown'}`">
        <span class="subscription-module-status-dot" />{{ statusLabels[subscription.status] || 'Estado no disponible' }}
      </div>
    </div>

    <div v-if="subscription.plan || subscription.status === 'active'" class="subscription-module-price">
      <strong>{{ priceLabel }}</strong><span>{{ intervalLabel }}</span>
    </div>

    <p v-if="subscription.status === 'pending_payment' && !subscription.plan" class="subscription-module-message">
      La organización todavía no tiene un plan asignado. La contratación y administración de planes corresponde a superadmin.
    </p>
    <p v-else-if="subscription.status === 'past_due'" class="subscription-module-message">
      El pago requiere atención. Contacta a la persona responsable de la cuenta.
    </p>

    <div v-if="subscription.plan || subscription.status === 'active'" class="subscription-facts subscription-module-facts">
      <div class="subscription-fact">
        <span><CalendarDaysIcon /> Periodo actual</span>
        <strong v-if="subscription.currentPeriodStart || subscription.currentPeriodEnd">{{ formatDate(subscription.currentPeriodStart) }} – {{ formatDate(subscription.currentPeriodEnd) }}</strong>
        <strong v-else>{{ subscription.periodSyncPending ? 'Fechas pendientes de sincronizar con Stripe' : 'Fechas aún no registradas' }}</strong>
      </div>
      <div class="subscription-fact">
        <span><ClockIcon /> {{ subscription.status === 'canceled' ? 'Fin de acceso' : 'Próxima renovación' }}</span>
        <strong>{{ subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : subscription.periodSyncPending ? 'Pendiente de sincronización' : 'Sin fecha registrada' }}</strong>
        <small v-if="['active', 'canceled'].includes(subscription.status) && daysRemaining !== null">
          {{ daysRemaining === 0 ? (subscription.status === 'canceled' ? 'Periodo de acceso finalizado' : 'Renovación hoy') : subscription.status === 'canceled' ? `${daysRemaining} días de acceso` : `${daysRemaining} días restantes` }}
        </small>
      </div>
      <div class="subscription-fact">
        <span><CreditCardIcon /> Frecuencia de cobro</span>
        <strong>{{ intervalLabel }}</strong>
      </div>
      <div class="subscription-fact">
        <span><CalendarDaysIcon /> Alta en la plataforma</span>
        <strong>{{ formatDate(subscription.createdAt) }}</strong>
      </div>
    </div>

    <div v-if="modules.length" class="subscription-modules">
      <h3>Módulos incluidos <span>{{ modules.length }}</span></h3>
      <div class="subscription-module-list"><span v-for="moduleName in modules" :key="moduleName">{{ moduleName }}</span></div>
    </div>
    <p v-else-if="subscription.status === 'active'" class="subscription-empty-modules">No hay módulos habilitados en el plan asignado.</p>

    <div class="subscription-module-footer">
      <span>Solo lectura · Administrado por superadmin</span>
      <button class="map-tool-button" type="button" :disabled="refreshing" @click="refreshSubscription">
        <ArrowPathIcon />{{ refreshing ? 'Actualizando…' : 'Actualizar' }}
      </button>
    </div>
    <p v-if="error" class="login-error" role="alert">{{ error }}</p>
  </section>
</template>