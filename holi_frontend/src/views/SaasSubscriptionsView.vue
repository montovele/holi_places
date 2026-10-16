<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import {
  ArrowPathIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingOffice2Icon,
  CheckIcon,
  ClipboardDocumentListIcon,
  CreditCardIcon,
  PencilIcon,
  PlusIcon,
} from '@heroicons/vue/24/outline'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { listPlans } from '../services/plansService'
import {
  assignSaasSubscription,
  listSaasSubscriptions,
  updateSaasSubscription,
} from '../services/saasSubscriptionsService'

const auth = useAuthStore()
const router = useRouter()
const subscriptions = ref([])
const plans = ref([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const search = ref('')
const statusFilter = ref('all')
const editingId = ref('')
const currentDate = new Date().toISOString().slice(0, 10)
const form = reactive({
  organizationId: '',
  planId: '',
  startsAt: '',
  endsAt: '',
  status: 'active',
})

const activePlans = computed(() => plans.value.filter(({ estado }) => estado === 'active'))
const activeCount = computed(() => subscriptions.value.filter(({ effectiveStatus }) => effectiveStatus === 'active').length)
const pendingCount = computed(() => subscriptions.value.filter(({ effectiveStatus }) => effectiveStatus === 'pending_payment').length)
const attentionCount = computed(() => subscriptions.value.filter(({ effectiveStatus }) => ['past_due', 'expired'].includes(effectiveStatus)).length)
const stripeCount = computed(() => subscriptions.value.filter(({ stripeManaged }) => stripeManaged).length)
const filteredSubscriptions = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return subscriptions.value.filter((subscription) => {
    const matchesStatus = statusFilter.value === 'all' || subscription.effectiveStatus === statusFilter.value
    const matchesSearch = !query || [
      subscription.organizationName,
      subscription.organizationSlug,
      subscription.planName,
      subscription.planCode,
      subscription.organizationId,
    ].some((value) => String(value || '').toLocaleLowerCase().includes(query))
    return matchesStatus && matchesSearch
  })
})

function goBack() {
  const previousPath = globalThis.history?.state?.back
  if (typeof previousPath === 'string' && previousPath && !previousPath.startsWith('/login')) {
    router.back()
    return
  }
  router.push({ name: 'organizations' })
}

function dateString(date) {
  if (!date) return ''
  if (date instanceof Date) return date.toISOString().slice(0, 10)
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? String(date).slice(0, 10) : parsed.toISOString().slice(0, 10)
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function resetForm() {
  editingId.value = ''
  const today = currentDate
  Object.assign(form, {
    organizationId: '',
    planId: activePlans.value[0] ? String(activePlans.value[0].id) : '',
    startsAt: today,
    endsAt: addDays(today, 30),
    status: 'active',
  })
}

function startEdit(subscription) {
  editingId.value = subscription.id
  const today = currentDate
  const expired = subscription.effectiveStatus === 'expired' || dateString(subscription.endsAt) <= today
  Object.assign(form, {
    organizationId: subscription.organizationId,
    planId: String(subscription.planId || ''),
    startsAt: expired ? today : dateString(subscription.startsAt),
    endsAt: expired ? addDays(today, 30) : dateString(subscription.endsAt),
    status: !expired && subscription.status === 'canceled' ? 'canceled' : 'active',
  })
  error.value = ''
  notice.value = ''
}

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const [subscriptionRows, planRows] = await Promise.all([listSaasSubscriptions(), listPlans()])
    subscriptions.value = subscriptionRows
    plans.value = planRows
    if (!form.planId && activePlans.value.length) form.planId = String(activePlans.value[0].id)
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudieron cargar las suscripciones SaaS.'
  } finally {
    loading.value = false
  }
}

async function submit() {
  error.value = ''
  notice.value = ''
  saving.value = true
  try {
    const payload = {
      organizationId: form.organizationId,
      planId: Number(form.planId),
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      status: editingId.value ? form.status : 'active',
    }
    const saved = editingId.value
      ? await updateSaasSubscription(editingId.value, payload)
      : await assignSaasSubscription(payload)
    notice.value = editingId.value
      ? (saved.status === 'canceled' ? 'La suscripción manual fue cancelada.' : 'La suscripción fue actualizada.')
      : 'Plan asignado y acceso activado para la congregación.'
    resetForm()
    await loadData()
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo guardar la suscripción.'
  } finally {
    saving.value = false
  }
}

function statusLabel(status) {
  return ({
    active: 'Activa',
    pending_payment: 'Pendiente de pago',
    past_due: 'Pago vencido',
    canceled: 'Cancelada',
    expired: 'Vencida',
  })[status] || status
}

function formatPrice(subscription) {
  if (subscription.amount === null || subscription.amount === undefined) return 'Sin tarifa'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: subscription.currency || 'MXN',
    maximumFractionDigits: 2,
  }).format(Number(subscription.amount))
}

function periodLabel(subscription) {
  const start = dateString(subscription.startsAt)
  const end = dateString(subscription.endsAt)
  if (!start && !end) return 'Sin periodo registrado'
  return `${start || '—'} a ${end || 'sin fecha de fin'}`
}

onMounted(async () => {
  await loadData()
  resetForm()
})
</script>

<template>
  <section class="module-view saas-subscriptions-view">
    <button class="saas-subscription-back" type="button" @click="goBack">
      <ArrowLeftIcon aria-hidden="true" />
      <span>Regresar</span>
      <small>A la página anterior</small>
    </button>

    <div class="module-intro">
      <p class="eyebrow">SAAS · SUPERADMINISTRACIÓN</p>
      <h2>Suscripciones SaaS</h2>
      <p>Asigna acceso por plan a las congregaciones y consulta el estado de sus suscripciones en un solo lugar.</p>
    </div>

    <nav class="saas-subscription-navigation" aria-label="Accesos principales de suscripciones">
      <p class="saas-subscription-navigation-heading">Accesos rápidos <span>Gestiona cada parte de tu plataforma SaaS</span></p>
      <div class="saas-subscription-navigation-grid">
        <RouterLink :to="{ name: 'organizations' }">
          <span class="saas-navigation-icon"><BuildingOffice2Icon aria-hidden="true" /></span>
          <span class="saas-navigation-copy"><strong>Organizaciones</strong><small>Busca y administra congregaciones</small></span>
          <ArrowRightIcon class="saas-navigation-arrow" aria-hidden="true" />
        </RouterLink>
        <RouterLink :to="{ name: 'plans' }">
          <span class="saas-navigation-icon"><CreditCardIcon aria-hidden="true" /></span>
          <span class="saas-navigation-copy"><strong>Planes SaaS</strong><small>Consulta planes y precios publicados</small></span>
          <ArrowRightIcon class="saas-navigation-arrow" aria-hidden="true" />
        </RouterLink>
        <a class="saas-subscription-navigation-primary" href="#saas-subscription-assignment">
          <span class="saas-navigation-icon"><PlusIcon aria-hidden="true" /></span>
          <span class="saas-navigation-copy"><strong>Asignar un plan</strong><small>Activa acceso para una congregación</small></span>
          <ArrowRightIcon class="saas-navigation-arrow" aria-hidden="true" />
        </a>
        <a href="#saas-subscription-list">
          <span class="saas-navigation-icon"><ClipboardDocumentListIcon aria-hidden="true" /></span>
          <span class="saas-navigation-copy"><strong>Ver suscripciones</strong><small>Busca, filtra y revisa su estado</small></span>
          <ArrowRightIcon class="saas-navigation-arrow" aria-hidden="true" />
        </a>
      </div>
    </nav>

    <section class="saas-subscription-overview" aria-label="Resumen de suscripciones">
      <article>
        <span class="saas-overview-icon"><ClipboardDocumentListIcon /></span>
        <div><span>Suscripciones registradas</span><strong>{{ subscriptions.length }}</strong></div>
      </article>
      <article>
        <span class="saas-overview-icon saas-overview-icon-active"><CheckIcon /></span>
        <div><span>Accesos activos</span><strong>{{ activeCount }}</strong></div>
      </article>
      <article>
        <span class="saas-overview-icon saas-overview-icon-attention"><ArrowPathIcon /></span>
        <div><span>Requieren atención</span><strong>{{ attentionCount }}</strong></div>
      </article>
      <article>
        <span class="saas-overview-icon saas-overview-icon-stripe"><CreditCardIcon /></span>
        <div><span>Administradas por Stripe</span><strong>{{ stripeCount }}</strong></div>
      </article>
    </section>

    <div v-if="error" class="module-alert" role="alert">{{ error }}</div>
    <div v-if="notice" class="module-notice" role="status"><CheckIcon />{{ notice }}</div>

    <form id="saas-subscription-assignment" class="record-editor saas-subscription-editor" @submit.prevent="submit">
      <div class="record-editor-heading">
        <div>
          <p class="eyebrow">{{ editingId ? 'GESTIONAR ACCESO MANUAL' : 'ASIGNACIÓN DIRECTA' }}</p>
          <h3>{{ editingId ? 'Actualizar suscripción' : 'Asignar un plan a una congregación' }}</h3>
        </div>
        <button v-if="editingId" type="button" class="secondary-action" @click="resetForm">Cancelar edición</button>
      </div>
      <p class="saas-subscription-guidance">
        El acceso manual se activa inmediatamente y no genera un cobro en Stripe. Configura las fechas de vigencia;
        las suscripciones vinculadas a Stripe continúan sincronizándose desde el proveedor.
      </p>
      <div class="record-editor-fields">
        <label>
          Congregación
          <select v-model="form.organizationId" required :disabled="Boolean(editingId)">
            <option value="" disabled>Selecciona una congregación</option>
            <option v-for="organization in auth.organizations" :key="organization.id" :value="organization.id">
              {{ organization.name }} · {{ organization.slug }}
            </option>
          </select>
        </label>
        <label>
          Plan publicado
          <select v-model="form.planId" required>
            <option value="" disabled>Selecciona un plan</option>
            <option v-for="plan in activePlans" :key="plan.id" :value="String(plan.id)">
              {{ plan.nombre }}{{ plan.amount ? ` · ${formatPrice(plan)}` : '' }}
            </option>
          </select>
        </label>
        <label>Inicio de vigencia<input v-model="form.startsAt" type="date" :max="currentDate" required /></label>
        <label>Fin de vigencia<input v-model="form.endsAt" type="date" required /></label>
        <label v-if="editingId">
          Estado del acceso
          <select v-model="form.status">
            <option value="active">Activo</option>
            <option value="canceled">Cancelado</option>
          </select>
        </label>
      </div>
      <p v-if="!activePlans.length" class="saas-subscription-guidance" role="note">
        Publica al menos un plan en el catálogo SaaS antes de asignarlo.
      </p>
      <div class="record-editor-actions">
        <button class="primary-action" type="submit" :disabled="saving || !activePlans.length">
          <ArrowPathIcon v-if="saving" class="saas-subscription-spinner" />
          <PencilIcon v-else-if="editingId" />
          <PlusIcon v-else />
          {{ saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Asignar plan y activar acceso' }}
        </button>
      </div>
    </form>

    <section id="saas-subscription-list" class="module-records saas-subscription-records">
      <div class="records-toolbar">
        <div><p class="eyebrow">CONTROL DE ACCESO</p><h3>Suscripciones por congregación</h3></div>
        <span>{{ filteredSubscriptions.length }} de {{ subscriptions.length }}</span>
      </div>
      <div class="saas-subscription-filters">
        <label>Buscar congregación o plan<input v-model="search" type="search" placeholder="Nombre, identificador o plan" /></label>
        <label>Estado
          <select v-model="statusFilter">
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="pending_payment">Pendientes</option>
            <option value="past_due">Pago vencido</option>
            <option value="canceled">Canceladas</option>
            <option value="expired">Vencidas</option>
          </select>
        </label>
        <button type="button" class="secondary-action" :disabled="loading" @click="loadData"><ArrowPathIcon />Actualizar</button>
      </div>
      <div v-if="loading" class="records-empty">Cargando suscripciones…</div>
      <div v-else-if="filteredSubscriptions.length" class="saas-subscription-table-wrap">
        <table class="saas-subscription-table">
          <thead><tr><th>Congregación</th><th>Plan</th><th>Estado</th><th>Vigencia</th><th>Origen</th><th>Gestión</th></tr></thead>
          <tbody>
            <tr v-for="subscription in filteredSubscriptions" :key="subscription.id">
              <td>
                <strong><BuildingOffice2Icon />{{ subscription.organizationName }}</strong>
                <small>{{ subscription.organizationSlug }} · {{ subscription.organizationId }}</small>
              </td>
              <td>
                <strong>{{ subscription.planName || 'Sin plan asignado' }}</strong>
                <small>{{ formatPrice(subscription) }}<template v-if="subscription.intervalUnit"> · {{ subscription.intervalUnit === 'year' ? 'anual' : 'mensual' }}</template></small>
              </td>
              <td><span class="saas-subscription-status" :class="`status-${subscription.effectiveStatus}`">{{ statusLabel(subscription.effectiveStatus) }}</span></td>
              <td>{{ periodLabel(subscription) }}</td>
              <td><span :class="subscription.stripeManaged ? 'saas-origin-stripe' : 'saas-origin-manual'">{{ subscription.stripeManaged ? 'Stripe' : 'Manual' }}</span></td>
              <td>
                <button
                  v-if="!subscription.stripeManaged"
                  class="saas-subscription-edit"
                  type="button"
                  @click="startEdit(subscription)"
                ><PencilIcon />{{ subscription.effectiveStatus === 'expired' ? 'Renovar' : 'Editar' }}</button>
                <span v-else class="saas-subscription-sync-note">Sincronizada</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="records-empty">
        {{ subscriptions.length ? 'No hay suscripciones que coincidan con los filtros.' : 'Aún no hay suscripciones registradas.' }}
      </div>
      <p v-if="pendingCount" class="saas-subscription-footnote">{{ pendingCount }} suscripciones pendientes de pago se muestran para seguimiento; asignar acceso manual no las cobra ni sustituye un checkout de Stripe activo.</p>
    </section>
  </section>
</template>

<style scoped>
.saas-subscriptions-view { display: grid; gap: 18px; scroll-behavior: smooth; }
.saas-subscription-back { display: inline-flex; width: fit-content; min-height: 42px; align-items: center; gap: 9px; padding: 0 15px; border: 1px solid #bdcfbd; border-radius: 6px; color: #315d40; background: linear-gradient(135deg, #fff, #f5f8f2); box-shadow: 0 4px 12px rgba(35, 65, 43, .07); font: 700 12px 'Manrope', sans-serif; cursor: pointer; transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease, background 150ms ease; }
.saas-subscription-back svg { width: 17px; height: 17px; }
.saas-subscription-back small { margin-left: 2px; color: #778579; font: 400 10px 'DM Sans', sans-serif; }
.saas-subscription-back:hover { transform: translateX(-2px); border-color: #8eae91; background: #f2f7ef; box-shadow: 0 6px 15px rgba(35, 65, 43, .11); }
.saas-subscription-back:focus-visible { outline: 3px solid rgba(57, 125, 84, .38); outline-offset: 2px; }
.saas-subscriptions-view > .module-intro { position: relative; overflow: hidden; padding: 24px 27px; border: 1px solid #dce8de; border-left: 4px solid #a98551; border-radius: 8px; background: radial-gradient(ellipse at 94% 5%, rgba(208, 220, 197, .38), transparent 32%), linear-gradient(112deg, #f4f8f2, #fff 72%); box-shadow: 0 9px 26px rgba(35, 65, 43, .055); }
.saas-subscriptions-view > .module-intro .eyebrow { color: #947044; }
.saas-subscriptions-view > .module-intro h2 { color: #244739; font: 600 32px/1.1 'Cormorant Garamond', serif; }
.saas-subscriptions-view > .module-intro > p:not(.eyebrow) { max-width: 650px; color: #66756a; line-height: 1.6; }
.saas-subscription-navigation { padding: 16px 18px 18px; border: 1px solid #dfe8dc; border-radius: 8px; background: linear-gradient(125deg, #f9fbf7, #fff 75%); box-shadow: 0 7px 20px rgba(35, 65, 43, .05); }
.saas-subscription-navigation-heading { display: grid; gap: 3px; margin: 0 0 12px; color: #2c4936; font: 700 13px 'Manrope', sans-serif; }
.saas-subscription-navigation-heading span { color: #748075; font: 400 11px 'DM Sans', sans-serif; }
.saas-subscription-navigation-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.saas-subscription-navigation-grid a { display: flex; min-width: 0; min-height: 76px; align-items: center; gap: 10px; padding: 12px; border: 1px solid #dce5dc; border-radius: 6px; color: #365842; background: #fff; text-align: left; text-decoration: none; transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease; }
.saas-subscription-navigation-grid a:hover { transform: translateY(-2px); border-color: #abc0a9; background: #fcfefb; box-shadow: 0 6px 14px rgba(39, 70, 47, .1); }
.saas-subscription-navigation-grid a:focus-visible { outline: 3px solid rgba(57, 125, 84, .38); outline-offset: 2px; }
.saas-navigation-icon { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 6px; color: #42684b; background: #eff4eb; }
.saas-navigation-icon svg { width: 19px; height: 19px; }
.saas-navigation-copy { display: grid; min-width: 0; flex: 1; gap: 4px; }
.saas-navigation-copy strong { color: #2d4935; font: 700 11px 'Manrope', sans-serif; }
.saas-navigation-copy small { color: #798379; font-size: 9px; line-height: 1.4; }
.saas-navigation-arrow { width: 15px; height: 15px; flex: 0 0 auto; color: #8b998b; }
.saas-subscription-navigation-grid .saas-subscription-navigation-primary { border-color: #2f6746; color: #fff; background: linear-gradient(135deg, #397d54, #285e40); box-shadow: 0 4px 10px rgba(39, 95, 62, .15); }
.saas-subscription-navigation-grid .saas-subscription-navigation-primary .saas-navigation-icon { color: #fff; background: rgba(255, 255, 255, .15); }
.saas-subscription-navigation-grid .saas-subscription-navigation-primary .saas-navigation-copy strong { color: #fff; }
.saas-subscription-navigation-grid .saas-subscription-navigation-primary .saas-navigation-copy small { color: rgba(255, 255, 255, .82); }
.saas-subscription-navigation-grid .saas-subscription-navigation-primary .saas-navigation-arrow { color: rgba(255, 255, 255, .85); }
.saas-subscription-navigation-grid .saas-subscription-navigation-primary:hover { border-color: #214d34; color: #fff; background: linear-gradient(135deg, #326e4a, #214f36); }
.saas-subscription-overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 11px; }
.saas-subscription-overview article { display: flex; min-width: 0; align-items: center; gap: 12px; padding: 15px; border: 1px solid #e1e9e1; border-top: 3px solid #c7d5c5; border-radius: 6px; background: linear-gradient(145deg, #fff, #fbfcfa); box-shadow: 0 4px 13px rgba(35, 65, 43, .035); transition: transform 160ms ease, box-shadow 160ms ease; }
.saas-subscription-overview article:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(35, 65, 43, .08); }
.saas-overview-icon { display: grid; width: 36px; height: 36px; flex: 0 0 auto; place-items: center; border-radius: 5px; color: #496749; background: #eff4eb; }
.saas-overview-icon svg { width: 18px; height: 18px; }
.saas-overview-icon-active { color: #32714c; background: #eaf4eb; }
.saas-overview-icon-attention { color: #996634; background: #faf1e3; }
.saas-overview-icon-stripe { color: #655e90; background: #f0eff8; }
.saas-subscription-overview article > div { display: grid; min-width: 0; gap: 4px; }
.saas-subscription-overview article > div > span { overflow: hidden; color: #738075; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.saas-subscription-overview article strong { color: #2b4c38; font: 700 23px/1.1 'Manrope', sans-serif; font-variant-numeric: tabular-nums; }
.saas-subscription-editor { gap: 14px; scroll-margin-top: 18px; border-color: #dce8de; border-radius: 7px; background: linear-gradient(145deg, #fbfcfa, #f6f9f5); box-shadow: 0 6px 20px rgba(35, 65, 43, .045); }
.saas-subscription-editor > .record-editor-heading h3 { color: #244739; font: 600 21px/1.1 'Cormorant Garamond', serif; }
.saas-subscription-guidance { margin: 0; color: #617166; font-size: 12px; line-height: 1.55; }
.saas-subscription-editor .record-editor-fields input:focus, .saas-subscription-editor .record-editor-fields select:focus { border-color: #43805f; outline: 0; box-shadow: 0 0 0 3px rgba(67, 128, 95, .12); }
.saas-subscription-editor .record-editor-actions { padding-top: 12px; border-top: 1px solid #e4ece4; }
.saas-subscription-editor .primary-action { display: inline-flex; min-height: 40px; align-items: center; gap: 7px; padding: 0 15px; border-radius: 5px; background: linear-gradient(135deg, #397d54, #285e40); box-shadow: 0 4px 10px rgba(39, 95, 62, .15); transition: transform 160ms ease, box-shadow 160ms ease; }
.saas-subscription-editor .primary-action:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 7px 15px rgba(39, 95, 62, .2); }
.saas-subscription-editor .primary-action svg { width: 15px; height: 15px; }
.saas-subscription-records .records-toolbar .eyebrow { color: #947044; }
.saas-subscription-records { overflow: hidden; border-color: #e1e9e1; border-radius: 7px; box-shadow: 0 6px 20px rgba(35, 65, 43, .045); scroll-margin-top: 18px; }
.saas-subscription-filters { display: flex; align-items: end; gap: 10px; padding: 14px 18px; border-bottom: 1px solid #e8ede7; background: #fcfdfb; }
.saas-subscription-filters label { display: grid; flex: 1; gap: 5px; color: #53665e; font-size: 11px; font-weight: 600; }
.saas-subscription-filters input, .saas-subscription-filters select { min-height: 36px; padding: 7px 9px; border: 1px solid #dce5de; border-radius: 4px; background: #fff; color: #243d31; font: 12px 'DM Sans', sans-serif; }
.saas-subscription-filters input:focus, .saas-subscription-filters select:focus { border-color: #43805f; outline: 0; box-shadow: 0 0 0 3px rgba(67, 128, 95, .12); }
.saas-subscription-filters .secondary-action { display: inline-flex; min-height: 36px; align-items: center; gap: 6px; padding: 0 11px; border-color: #d7e2d7; color: #42604a; background: #fff; transition: background 150ms ease, border-color 150ms ease; }
.saas-subscription-filters .secondary-action:hover:not(:disabled) { border-color: #b8c9b7; background: #f5f8f2; }
.saas-subscription-table-wrap { overflow-x: auto; }
.saas-subscription-table { width: 100%; border-collapse: collapse; text-align: left; }
.saas-subscription-table th { padding: 11px 14px; color: #788278; background: #fafbf9; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.saas-subscription-table td { padding: 13px 14px; border-top: 1px solid #edf0ec; color: #536258; font-size: 11px; vertical-align: middle; }
.saas-subscription-table tbody tr { transition: background 140ms ease; }
.saas-subscription-table tbody tr:hover { background: #f8faf6; }
.saas-subscription-table td strong { display: flex; align-items: center; gap: 5px; color: #2b4435; font-size: 12px; }
.saas-subscription-table td strong svg { width: 15px; height: 15px; flex: 0 0 auto; }
.saas-subscription-table td small { display: block; max-width: 240px; margin-top: 4px; overflow: hidden; color: #879087; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.saas-subscription-status, .saas-origin-stripe, .saas-origin-manual { display: inline-flex; padding: 5px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; white-space: nowrap; }
.saas-subscription-status.status-active { color: #2d6746; background: #eaf5ed; }
.saas-subscription-status.status-pending_payment { color: #805b25; background: #fbf3df; }
.saas-subscription-status.status-past_due, .saas-subscription-status.status-expired { color: #9b493d; background: #f9eae6; }
.saas-subscription-status.status-canceled { color: #68726b; background: #eef0ed; }
.saas-origin-stripe { color: #635b95; background: #f0eef9; }
.saas-origin-manual { color: #39704f; background: #edf5ee; }
.saas-subscription-edit { display: inline-flex; align-items: center; gap: 5px; padding: 6px 8px; border: 1px solid #dce6dd; border-radius: 4px; color: #315d40; background: #fff; font: 600 11px 'DM Sans', sans-serif; cursor: pointer; transition: border-color 150ms ease, background 150ms ease; }
.saas-subscription-edit:hover { border-color: #b8c9b7; background: #f5f8f2; }
.saas-subscription-edit svg, .saas-subscription-filters button svg { width: 14px; height: 14px; }
.saas-subscription-sync-note, .saas-subscription-footnote { color: #858e85; font-size: 10px; }
.saas-subscription-footnote { margin: 0; padding: 0 18px 15px; }
.saas-subscription-spinner { animation: saas-subscription-spin 1s linear infinite; }
@keyframes saas-subscription-spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) {
  .saas-subscription-navigation-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .saas-subscription-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .saas-subscription-filters { align-items: stretch; flex-direction: column; }
  .saas-subscriptions-view > .module-intro { padding: 18px; }
  .saas-subscriptions-view > .module-intro h2 { font-size: 27px; }
  .saas-subscription-table { min-width: 790px; }
}
@media (max-width: 460px) {
  .saas-subscription-back { min-height: 40px; }
  .saas-subscription-back small { display: none; }
  .saas-subscription-navigation { padding: 13px 11px; }
  .saas-subscription-navigation-grid { grid-template-columns: 1fr; gap: 7px; }
  .saas-subscription-navigation-grid a { min-height: 66px; padding: 10px; }
  .saas-subscription-overview { gap: 7px; }
  .saas-subscription-overview article { gap: 8px; padding: 10px 8px; }
  .saas-overview-icon { width: 30px; height: 30px; }
  .saas-subscription-overview article > div > span { font-size: 9px; }
  .saas-subscription-overview article strong { font-size: 19px; }
}
@media (prefers-reduced-motion: reduce) {
  .saas-subscriptions-view *,
  .saas-subscriptions-view *::before,
  .saas-subscriptions-view *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
</style>
