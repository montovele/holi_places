<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowPathIcon, ArrowRightIcon, CalendarDaysIcon, CheckIcon, ClockIcon, CreditCardIcon, ShieldCheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { RouterLink } from 'vue-router'
import { getPublicPlans, getSubscriptionStatus, startSubscriptionCheckout } from '../services/billingService'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const isSuperadmin = computed(() => auth.user?.role === 'superadmin')
const canManageSubscription = computed(() => ['admin', 'superadmin'].includes(auth.user?.role))
const subscription = ref(null)
const loading = ref(true)
const error = ref('')
const plans = ref([])
const plansLoading = ref(false)
const plansError = ref('')
const checkoutError = ref('')
const checkoutPlanId = ref(null)
const selectedPlan = ref(null)
const planDialog = ref(null)
const currentTime = ref(Date.now())
let pollTimer
let countdownTimer

const statusLabels = {
  active: 'Suscripción activa',
  pending_payment: 'Pago pendiente',
  past_due: 'Pago pendiente de regularizar',
  canceled: 'Suscripción cancelada',
  expired: 'Periodo vencido',
  not_registered: 'Sin suscripción',
}

function parseUtcDate(value) {
  if (!value) return null
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value
  const hasTimezone = typeof normalized === 'string' && normalized.includes('T') && /(Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
  const date = new Date(typeof normalized === 'string' && !hasTimezone ? `${normalized}Z` : normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value) {
  const date = parseUtcDate(value)
  if (!date) return 'No disponible'
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(date)
}

function formatPrice() {
  if (subscription.value?.amount === null || subscription.value?.amount === undefined || subscription.value?.amount === '') return 'Sin precio asignado'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: subscription.value.currency || 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(subscription.value.amount))
}

function formatIntervalLabel() {
  const unit = subscription.value?.intervalUnit
  if (!unit) return 'Periodicidad no disponible'
  const intervalName = unit === 'month' ? 'mes' : 'año'
  const count = Number(subscription.value?.intervalCount || 1)
  const plural = unit === 'month' ? 'meses' : 'años'
  return count > 1 ? `Cada ${count} ${plural}` : `Cada ${intervalName}`
}

const daysRemaining = computed(() => {
  const endDate = parseUtcDate(subscription.value?.currentPeriodEnd)
  if (!endDate) return null
  return Math.max(0, Math.ceil((endDate.getTime() - currentTime.value) / 86400000))
})

const expiryLabel = computed(() => {
  if (subscription.value?.status === 'canceled') return 'Acceso disponible hasta'
  return 'Próxima renovación'
})

const modulesLabel = computed(() => (subscription.value?.activeModules || []).map((moduleId) => (
  moduleId.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
)))

function formatPlanPrice(plan) {
  const price = Number(plan.precio)
  if (!Number.isFinite(price)) return 'Precio no disponible'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: plan.moneda || 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price)
}

function formatPlanInterval(plan) {
  const unit = plan.intervalo === 'year' ? 'año' : 'mes'
  const count = Number(plan.intervalo_cantidad || 1)
  return count > 1 ? `cada ${count} ${unit === 'año' ? 'años' : 'meses'}` : `al ${unit}`
}

function formatModuleName(moduleId) {
  return moduleId.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

async function openPlanDetails(plan) {
  selectedPlan.value = plan
  await nextTick()
  planDialog.value?.showModal()
}

function closePlanDetails() {
  planDialog.value?.close()
  selectedPlan.value = null
}

function checkoutFromDetails() {
  const plan = selectedPlan.value
  closePlanDetails()
  if (plan) beginCheckout(plan)
}

async function loadPublicPlans() {
  if (!canManageSubscription.value || subscription.value?.status === 'active') return
  plansLoading.value = true
  plansError.value = ''
  try {
    plans.value = await getPublicPlans()
  } catch (problem) {
    plansError.value = problem.response?.data?.error?.message || 'No se pudieron cargar los planes disponibles.'
  } finally {
    plansLoading.value = false
  }
}

async function beginCheckout(plan) {
  checkoutPlanId.value = plan.id
  checkoutError.value = ''
  try {
    const checkout = await startSubscriptionCheckout(plan.codigo || plan.id)
    if (!checkout.url) throw new Error('Stripe no devolvió un enlace de pago.')
    globalThis.location.assign(checkout.url)
  } catch (problem) {
    checkoutError.value = problem.response?.data?.error?.message || problem.message || 'No se pudo iniciar el pago.'
    checkoutPlanId.value = null
  }
}

async function refreshStatus() {
  try {
    subscription.value = await getSubscriptionStatus()
    auth.subscription = subscription.value
    if (subscription.value.status === 'active') {
      clearInterval(pollTimer)
      pollTimer = undefined
    }
    error.value = ''
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo consultar la suscripción.'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await refreshStatus()
  await loadPublicPlans()
  if (subscription.value?.status !== 'active') pollTimer = setInterval(refreshStatus, 30000)
  countdownTimer = setInterval(() => { currentTime.value = Date.now() }, 60000)
})
onBeforeUnmount(() => {
  clearInterval(pollTimer)
  clearInterval(countdownTimer)
})
</script>

<template>
  <main class="billing-page">
    <section class="billing-content">
      <div class="billing-header">
        <div>
          <p class="eyebrow">SUSCRIPCIÓN DE LA ORGANIZACIÓN</p>
          <h1>Tu suscripción</h1>
        </div>
        <div class="billing-pill" :class="{ active: subscription?.status === 'active', 'billing-pill-warning': ['past_due', 'pending_payment', 'expired'].includes(subscription?.status) }">
          <span class="dot" />
          {{ loading ? 'Consultando…' : statusLabels[subscription?.status] || 'Suscripción pendiente' }}
        </div>
      </div>

      <p class="billing-lead">Consulta el plan contratado, el estado de facturación y el periodo de acceso de tu organización.</p>

      <div class="billing-status" :class="{ 'billing-active': subscription?.status === 'active', 'billing-status-warning': ['past_due', 'pending_payment', 'expired'].includes(subscription?.status), 'billing-status-danger': subscription?.status === 'canceled' }" role="status">
        <CheckIcon v-if="subscription?.status === 'active'" /><CreditCardIcon v-else />
        <div>
          <strong>{{ loading ? 'Consultando estado…' : statusLabels[subscription?.status] || 'Suscripción pendiente' }}</strong>
          <span v-if="subscription?.status === 'active' && daysRemaining !== null">{{ daysRemaining === 0 ? 'El periodo termina hoy.' : `Quedan ${daysRemaining} días del periodo actual.` }}</span>
          <span v-else-if="subscription?.status === 'pending_payment'">Todavía no hay un plan contratado para esta organización.</span>
          <span v-else-if="subscription?.status === 'past_due'">Actualiza el estado de pago con la persona administradora de la plataforma.</span>
          <span v-else-if="subscription?.status === 'canceled'">La suscripción fue cancelada. Revisa la fecha final de acceso abajo.</span>
          <span v-else-if="subscription?.status === 'expired'">El periodo de la suscripción terminó.</span>
          <span v-else-if="subscription?.status === 'active'">Tu organización cuenta con acceso activo a los módulos incluidos.</span>
        </div>
        <button class="icon-button" type="button" aria-label="Actualizar estado" :disabled="loading" @click="refreshStatus"><ArrowPathIcon /></button>
      </div>

      <section v-if="subscription && subscription.status !== 'not_registered' && (subscription.plan || subscription.status !== 'pending_payment')" class="subscription-overview" aria-label="Detalle de la suscripción">
        <div class="subscription-overview-heading">
          <div>
            <p class="eyebrow compact">DETALLE DEL SERVICIO</p>
            <h2>{{ subscription.plan?.name || 'Sin plan asignado' }}</h2>
          </div>
          <span class="subscription-price">{{ formatPrice() }}<small v-if="subscription.intervalUnit"> / {{ formatIntervalLabel() }}</small></span>
        </div>

        <div class="subscription-facts">
          <div class="subscription-fact">
            <span><CalendarDaysIcon /> Periodo actual</span>
            <strong>{{ formatDate(subscription.currentPeriodStart) }}<template v-if="subscription.currentPeriodEnd"> – {{ formatDate(subscription.currentPeriodEnd) }}</template></strong>
          </div>
          <div class="subscription-fact">
            <span><ClockIcon /> {{ expiryLabel }}</span>
            <strong>{{ formatDate(subscription.currentPeriodEnd) }}</strong>
            <small v-if="['active', 'canceled'].includes(subscription.status) && daysRemaining !== null">
              {{ daysRemaining === 0 ? (subscription.status === 'canceled' ? 'Periodo de acceso finalizado' : 'Renovación hoy') : subscription.status === 'canceled' ? `${daysRemaining} días de acceso` : `${daysRemaining} días restantes` }}
            </small>
          </div>
          <div class="subscription-fact">
            <span><CreditCardIcon /> Frecuencia de cobro</span>
            <strong>{{ formatIntervalLabel() }}</strong>
          </div>
          <div class="subscription-fact">
            <span><ShieldCheckIcon /> Alta en la plataforma</span>
            <strong>{{ formatDate(subscription.createdAt) }}</strong>
          </div>
        </div>

        <div v-if="modulesLabel.length" class="subscription-modules">
          <h3>Módulos incluidos <span>{{ modulesLabel.length }}</span></h3>
          <div class="subscription-module-list">
            <span v-for="moduleName in modulesLabel" :key="moduleName">{{ moduleName }}</span>
          </div>
        </div>
        <p v-else-if="subscription.status === 'active'" class="subscription-empty-modules">No hay módulos habilitados en el plan asignado.</p>
      </section>

      <section v-else-if="subscription?.status === 'not_registered' || (subscription?.status === 'pending_payment' && !subscription?.plan)" class="subscription-overview subscription-empty-state">
        <CreditCardIcon />
        <div>
          <h2>{{ subscription?.status === 'pending_payment' ? 'Elige un plan para comenzar' : 'Sin suscripción registrada' }}</h2>
          <p>{{ subscription?.status === 'pending_payment' ? 'Selecciona el servicio que mejor se adapte a tu congregación y continúa al pago seguro.' : 'Esta cuenta todavía no tiene una suscripción asociada a la organización activa.' }}</p>
        </div>
      </section>

      <section v-if="canManageSubscription && subscription && subscription.status !== 'active'" class="billing-form-panel" aria-labelledby="available-plans-title">
        <div class="billing-form-header">
          <div><p class="eyebrow compact">SERVICIO PARA TU ORGANIZACIÓN</p><h2 id="available-plans-title">Planes disponibles</h2></div>
        </div>
        <p v-if="plansLoading" class="billing-lead" role="status">Cargando planes disponibles…</p>
        <p v-else-if="plansError" class="login-error" role="alert">{{ plansError }}</p>
        <div v-else-if="plans.length" class="billing-plan-grid">
          <article v-for="plan in plans" :key="plan.id" class="plan-card">
            <div class="plan-header"><span class="plan-icon">{{ plan.nombre.slice(0, 1).toUpperCase() }}</span><div><span class="plan-kicker">PLAN DE SERVICIO</span><h3>{{ plan.nombre }}</h3></div></div>
            <div class="plan-price-block"><strong class="plan-price">{{ formatPlanPrice(plan) }}</strong><span class="plan-period">{{ formatPlanInterval(plan) }}</span></div>
            <p class="plan-description">{{ plan.descripcion || 'Herramientas para organizar y acompañar a tu congregación.' }}</p>
            <div class="plan-card-details">
              <span><CheckIcon aria-hidden="true" /> {{ plan.modulos?.length || 0 }} módulos incluidos</span>
              <button class="plan-details-button" type="button" @click="openPlanDetails(plan)">Ver detalles</button>
            </div>
            <button class="plan-select-button" type="button" :disabled="checkoutPlanId !== null" :aria-busy="checkoutPlanId === plan.id" @click="beginCheckout(plan)">
              {{ checkoutPlanId === plan.id ? 'Conectando con Stripe…' : 'Contratar este plan' }}
              <ArrowRightIcon v-if="checkoutPlanId !== plan.id" aria-hidden="true" />
            </button>
          </article>
        </div>
        <p v-else class="subscription-empty-modules">Aún no hay planes publicados para contratar. Vuelve a intentarlo más tarde.</p>
        <p v-if="checkoutError" class="login-error" role="alert">{{ checkoutError }}</p>
      </section>

      <dialog v-if="selectedPlan" ref="planDialog" class="billing-plan-dialog" aria-labelledby="plan-details-title" @close="selectedPlan = null" @click.self="closePlanDetails">
        <button class="billing-plan-dialog-close" type="button" aria-label="Cerrar detalles del plan" @click="closePlanDetails"><XMarkIcon aria-hidden="true" /></button>
        <div class="billing-plan-dialog-content">
          <p class="eyebrow compact">DETALLE DEL PLAN</p>
          <div class="billing-plan-dialog-heading">
            <div><span class="plan-kicker">PLAN DE SERVICIO</span><h2 id="plan-details-title">{{ selectedPlan.nombre }}</h2></div>
            <div class="billing-plan-dialog-price"><strong>{{ formatPlanPrice(selectedPlan) }}</strong><span>{{ formatPlanInterval(selectedPlan) }}</span></div>
          </div>
          <p class="billing-plan-dialog-description">{{ selectedPlan.descripcion || 'Herramientas para organizar y acompañar a tu congregación.' }}</p>
          <section class="billing-plan-dialog-modules" aria-label="Módulos incluidos">
            <h3>Módulos incluidos <span>{{ selectedPlan.modulos?.length || 0 }}</span></h3>
            <ul v-if="selectedPlan.modulos?.length">
              <li v-for="module in selectedPlan.modulos" :key="module"><CheckIcon aria-hidden="true" />{{ formatModuleName(module) }}</li>
            </ul>
            <p v-else>Este plan no tiene módulos configurados.</p>
          </section>
          <p v-if="checkoutError" class="login-error" role="alert">{{ checkoutError }}</p>
          <div class="billing-plan-dialog-actions">
            <button class="billing-plan-secondary-action" type="button" @click="closePlanDetails">Volver a los planes</button>
            <button class="plan-select-button" type="button" :disabled="checkoutPlanId !== null" :aria-busy="checkoutPlanId === selectedPlan.id" @click="checkoutFromDetails">
              {{ checkoutPlanId === selectedPlan.id ? 'Conectando con Stripe…' : 'Contratar este plan' }}
              <ArrowRightIcon v-if="checkoutPlanId !== selectedPlan.id" aria-hidden="true" />
            </button>
          </div>
        </div>
      </dialog>

      <p v-if="error" class="login-error" role="alert">{{ error }}</p>
      <RouterLink v-if="isSuperadmin" class="billing-admin-link" :to="{ name: 'plans' }">Administrar catálogo SaaS</RouterLink>
      <RouterLink class="login-community-link" :to="{ name: 'community' }">Volver a la comunidad</RouterLink>
    </section>
  </main>
</template>