<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingOffice2Icon,
  CheckIcon,
  ClipboardDocumentListIcon,
  CreditCardIcon,
  CubeIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { useRouter } from 'vue-router'
import { createPlan, createPlanPrice, deletePlan, listPlans, updatePlan } from '../services/plansService'
import modules from '../modules/registry'

const router = useRouter()
const plans = ref([])
const loading = ref(true)
const error = ref('')
const notice = ref('')
const form = reactive({ codigo: '', nombre: '', descripcion: '', estado: 'draft', entitlements: {} })
const priceForm = reactive({ amount: '', currency: 'MXN', interval_unit: 'month', interval_count: 1 })
const editingId = ref(null)
const allModules = modules.map(({ id }) => id)
const moduleLabels = Object.fromEntries(modules.map(({ id, label }) => [id, label]))
const activePlansCount = computed(() => plans.value.filter(({ estado }) => estado === 'active').length)
const pricedPlansCount = computed(() => plans.value.filter(({ amount }) => Number(amount) > 0).length)
const coveredModulesCount = computed(() => new Set(plans.value.flatMap((plan) => planEnabledModules(plan))).size)

const selectedModulesCount = computed(() => allModules.filter((moduleId) => form.entitlements[moduleId]).length)
const allModulesSelected = computed(() => selectedModulesCount.value === allModules.length)

function goBack() {
  const previousPath = globalThis.history?.state?.back
  if (typeof previousPath === 'string' && previousPath && !previousPath.startsWith('/login')) {
    router.back()
    return
  }
  router.push({ name: 'organizations' })
}

function toggleAllModules(event) {
  const enabled = event.target.checked
  form.entitlements = Object.fromEntries(allModules.map((moduleId) => [moduleId, enabled]))
}

function planEnabledModules(plan) {
  return Object.entries(plan.entitlements || {}).filter(([, enabled]) => enabled).map(([moduleId]) => moduleId)
}

function formatPlanPrice(plan) {
  if (plan.amount === null || plan.amount === undefined || plan.amount === '') return 'Sin precio'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: plan.currency || 'MXN',
    maximumFractionDigits: 2,
  }).format(Number(plan.amount))
}

function planInterval(plan) {
  if (!plan.intervalUnit) return 'Precio no configurado'
  const unit = plan.intervalUnit === 'year' ? 'año' : 'mes'
  const count = Number(plan.intervalCount) || 1
  return count === 1 ? `por ${unit}` : `cada ${count} ${unit === 'año' ? 'años' : 'meses'}`
}

function statusLabel(status) {
  return ({ active: 'Publicado', draft: 'Borrador', archived: 'Archivado' })[status] || status
}

async function loadPlans() {
  loading.value = true
  error.value = ''
  try {
    plans.value = await listPlans()
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudieron cargar los planes.'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  editingId.value = null
  Object.assign(form, {
    codigo: '', nombre: '', descripcion: '', estado: 'draft', entitlements: Object.fromEntries(allModules.map((moduleId) => [moduleId, false])),
  })
  Object.assign(priceForm, { amount: '', currency: 'MXN', interval_unit: 'month', interval_count: 1 })
}

function fillDefaultEntitlements() {
  form.entitlements = Object.fromEntries(allModules.map((moduleId) => [moduleId, moduleId === 'events' || moduleId === 'locations']))
}

function startEdit(plan) {
  editingId.value = plan.id
  Object.assign(form, {
    codigo: plan.codigo,
    nombre: plan.nombre,
    descripcion: plan.descripcion || '',
    estado: plan.estado,
    entitlements: plan.entitlements || Object.fromEntries(allModules.map((moduleId) => [moduleId, false])),
  })
  Object.assign(priceForm, {
    amount: plan.amount ?? '',
    currency: plan.currency || 'MXN',
    interval_unit: plan.intervalUnit || 'month',
    interval_count: Number(plan.intervalCount) || 1,
  })
}

async function submit() {
  try {
    const payload = {
      codigo: form.codigo,
      nombre: form.nombre,
      descripcion: form.descripcion,
      estado: form.estado,
      entitlements: form.entitlements,
    }

    let plan
    if (editingId.value) {
      plan = await updatePlan(editingId.value, payload)
      notice.value = 'Plan actualizado correctamente.'
    } else {
      plan = await createPlan(payload)
      notice.value = 'Plan creado correctamente.'
    }

    const normalizedAmount = Number(priceForm.amount)
    if (Number.isFinite(normalizedAmount) && normalizedAmount > 0) {
      await createPlanPrice(plan.id, {
        amount: normalizedAmount,
        currency: priceForm.currency,
        interval_unit: priceForm.interval_unit,
        interval_count: Number(priceForm.interval_count) || 1,
      })
      notice.value = editingId.value ? 'Plan y precio de Stripe actualizados correctamente.' : 'Plan y precio de Stripe creados correctamente.'
    }

    resetForm()
    await loadPlans()
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo guardar el plan.'
  }
}

async function remove(planId) {
  try {
    await deletePlan(planId)
    notice.value = 'El plan fue archivado.'
    if (editingId.value === planId) resetForm()
    await loadPlans()
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo archivar el plan.'
  }
}

onMounted(async () => {
  resetForm()
  await loadPlans()
})
</script>

<template>
  <section class="module-view plans-admin-view">
    <button class="plans-admin-back" type="button" @click="goBack">
      <ArrowLeftIcon aria-hidden="true" />
      <span>Regresar</span>
      <small>A la página anterior</small>
    </button>

    <div class="module-intro">
      <p class="eyebrow">SAAS · PLANES</p>
      <h2>Catálogo de planes</h2>
      <p>Diseña ofertas, administra el acceso a módulos y revisa los precios publicados.</p>
    </div>

    <nav class="plans-admin-navigation" aria-label="Accesos rápidos de administración SaaS">
      <p class="plans-admin-navigation-heading">Accesos rápidos <span>Gestiona congregaciones, planes y suscripciones</span></p>
      <div class="plans-admin-navigation-grid">
        <RouterLink :to="{ name: 'organizations' }">
          <span class="plans-navigation-icon"><BuildingOffice2Icon aria-hidden="true" /></span>
          <span class="plans-navigation-copy"><strong>Organizaciones</strong><small>Busca y administra congregaciones</small></span>
          <ArrowRightIcon class="plans-navigation-arrow" aria-hidden="true" />
        </RouterLink>
        <RouterLink :to="{ name: 'saas-subscriptions' }">
          <span class="plans-navigation-icon"><CreditCardIcon aria-hidden="true" /></span>
          <span class="plans-navigation-copy"><strong>Suscripciones</strong><small>Asigna y gestiona accesos SaaS</small></span>
          <ArrowRightIcon class="plans-navigation-arrow" aria-hidden="true" />
        </RouterLink>
        <a class="plans-admin-navigation-primary" href="#plans-editor">
          <span class="plans-navigation-icon"><PlusIcon aria-hidden="true" /></span>
          <span class="plans-navigation-copy"><strong>Crear un plan</strong><small>Configura precio y módulos incluidos</small></span>
          <ArrowRightIcon class="plans-navigation-arrow" aria-hidden="true" />
        </a>
        <a href="#plans-list">
          <span class="plans-navigation-icon"><ClipboardDocumentListIcon aria-hidden="true" /></span>
          <span class="plans-navigation-copy"><strong>Ver catálogo</strong><small>Consulta, edita o archiva planes</small></span>
          <ArrowRightIcon class="plans-navigation-arrow" aria-hidden="true" />
        </a>
      </div>
    </nav>

    <section class="plans-overview" aria-label="Resumen del catálogo">
      <article class="plans-overview-item plans-overview-total">
        <span class="plans-overview-icon"><CreditCardIcon aria-hidden="true" /></span>
        <div><p>Planes del catálogo</p><strong>{{ plans.length }}</strong><small>ofertas configuradas</small></div>
      </article>
      <article class="plans-overview-item">
        <span class="plans-overview-icon"><CheckIcon aria-hidden="true" /></span>
        <div><p>Disponibles</p><strong>{{ activePlansCount }}</strong><small>publicados para selección</small></div>
      </article>
      <article class="plans-overview-item">
        <span class="plans-overview-icon"><CubeIcon aria-hidden="true" /></span>
        <div><p>Módulos cubiertos</p><strong>{{ coveredModulesCount }}<small> / {{ allModules.length }}</small></strong><small>incluidos en algún plan</small></div>
      </article>
      <article class="plans-overview-item">
        <span class="plans-overview-icon"><SparklesIcon aria-hidden="true" /></span>
        <div><p>Con precio</p><strong>{{ pricedPlansCount }}</strong><small>con tarifa registrada</small></div>
      </article>
    </section>

    <div v-if="error" class="module-alert" role="alert">{{ error }}</div>
    <div v-if="notice" class="module-notice" role="status"><CheckIcon />{{ notice }}</div>

    <form id="plans-editor" class="record-editor plans-editor" @submit.prevent="submit">
      <div class="record-editor-heading">
        <div>
          <p class="eyebrow">{{ editingId ? 'EDITAR PLAN' : 'NUEVO PLAN' }}</p>
          <h3>{{ editingId ? 'Actualizar catálogo' : 'Crear plan SaaS' }}</h3>
        </div>
        <button v-if="editingId" type="button" class="secondary-action" @click="resetForm">Cancelar</button>
      </div>

      <section class="plan-editor-section">
        <div class="plan-section-heading">
          <span class="plan-section-index">01</span>
          <div><h4>Información del plan</h4><p>Identidad y disponibilidad del producto.</p></div>
        </div>
        <div class="record-editor-fields">
        <label>
          Código
          <input v-model.trim="form.codigo" required maxlength="64" placeholder="starter" />
        </label>
        <label>
          Nombre
          <input v-model.trim="form.nombre" required maxlength="120" placeholder="Starter" />
        </label>
        <label class="field-long">
          Descripción
          <textarea v-model.trim="form.descripcion" rows="3" placeholder="Descripción del plan para clientes"></textarea>
        </label>
        <label>
          Estado
          <select v-model="form.estado">
            <option value="draft">Borrador</option>
            <option value="active">Activo</option>
            <option value="archived">Archivado</option>
          </select>
        </label>
        </div>
      </section>

      <section class="plan-editor-section plan-price-section">
        <div class="plan-section-heading">
          <span class="plan-section-index">02</span>
          <div><h4>Precio de suscripción</h4><p>Configura el importe recurrente que se registrará en Stripe.</p></div>
        </div>
        <div class="price-editor-grid">
        <label>
          Precio
          <input v-model.number="priceForm.amount" type="number" min="0" step="0.01" placeholder="299" />
        </label>
        <label>
          Moneda
          <select v-model="priceForm.currency">
            <option value="MXN">MXN</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label>
          Periodicidad
          <select v-model="priceForm.interval_unit">
            <option value="month">Mensual</option>
            <option value="year">Anual</option>
          </select>
        </label>
        <label>
          Cantidad / ciclo
          <input v-model.number="priceForm.interval_count" type="number" min="1" max="12" />
        </label>
        </div>

        <p class="price-help">Al guardar, se crea automáticamente el precio recurrente en Stripe.</p>
      </section>

      <section class="plan-editor-section plan-modules-section">
        <div class="plan-modules-heading">
          <div class="plan-section-heading">
            <span class="plan-section-index">03</span>
            <div><h4>Acceso a módulos</h4><p>Selecciona las funciones incluidas en este plan.</p></div>
          </div>
          <label class="module-select-all">
            <input type="checkbox" :checked="allModulesSelected" :indeterminate="selectedModulesCount > 0 && !allModulesSelected" @change="toggleAllModules" />
            <span>Seleccionar todos</span>
          </label>
        </div>
        <div class="module-selection-summary" aria-live="polite">{{ selectedModulesCount }} de {{ allModules.length }} módulos seleccionados</div>
        <div class="module-toggle-grid">
          <label v-for="moduleId in allModules" :key="moduleId" class="module-toggle-item">
            <input v-model="form.entitlements[moduleId]" type="checkbox" />
            <span>{{ moduleLabels[moduleId] }}</span>
          </label>
        </div>
      </section>

      <div class="record-editor-actions">
        <button class="primary-action" type="submit">
          <PlusIcon v-if="!editingId" />
          <PencilIcon v-else />
          {{ editingId ? 'Guardar cambios' : 'Crear plan' }}
        </button>
      </div>
    </form>

    <section id="plans-list" class="module-records plans-records">
      <div class="records-toolbar">
        <div>
          <p class="eyebrow">OFERTAS Y ACCESO</p>
          <h3>Planes configurados</h3>
        </div>
        <span class="plans-list-count">{{ plans.length }} {{ plans.length === 1 ? 'plan' : 'planes' }}</span>
      </div>

      <div v-if="loading" class="records-empty">Cargando planes…</div>
      <div v-else-if="plans.length" class="plans-card-grid">
        <article v-for="(plan, index) in plans" :key="plan.id" class="saas-plan-card" :class="{ 'saas-plan-card-active': plan.estado === 'active', 'saas-plan-card-editing': editingId === plan.id }" :style="{ '--plan-index': index }">
          <header class="saas-plan-card-heading">
            <div class="saas-plan-identity">
              <span class="saas-plan-mark"><CreditCardIcon aria-hidden="true" /></span>
              <div><p>{{ plan.codigo }}</p><h4>{{ plan.nombre }}</h4></div>
            </div>
            <span class="saas-plan-status" :class="`saas-plan-status-${plan.estado}`">{{ statusLabel(plan.estado) }}</span>
          </header>

          <div class="saas-plan-price">
            <strong>{{ formatPlanPrice(plan) }}</strong>
            <span>{{ planInterval(plan) }}</span>
          </div>

          <p class="saas-plan-description">{{ plan.descripcion || 'Sin descripción. Edita el plan para agregar detalles de la oferta.' }}</p>

          <div class="saas-plan-entitlement-heading">
            <span>Módulos incluidos</span>
            <strong>{{ planEnabledModules(plan).length }}<small> / {{ allModules.length }}</small></strong>
          </div>
          <div v-if="planEnabledModules(plan).length" class="saas-plan-module-list">
            <span v-for="moduleId in planEnabledModules(plan).slice(0, 5)" :key="moduleId">{{ moduleLabels[moduleId] }}</span>
            <span v-if="planEnabledModules(plan).length > 5" class="saas-plan-module-more">+{{ planEnabledModules(plan).length - 5 }}</span>
          </div>
          <p v-else class="saas-plan-empty-modules">No hay módulos habilitados</p>

          <footer class="saas-plan-actions">
            <button class="saas-plan-edit" type="button" @click="startEdit(plan)"><PencilIcon aria-hidden="true" />Editar plan</button>
            <button class="saas-plan-archive" type="button" :aria-label="`Archivar ${plan.nombre}`" title="Archivar plan" @click="remove(plan.id)"><TrashIcon aria-hidden="true" /></button>
          </footer>
        </article>
      </div>
      <div v-else class="plans-empty-state">
        <span><CreditCardIcon aria-hidden="true" /></span>
        <h4>Aún no hay planes</h4>
        <p>Crea la primera oferta para habilitar opciones de suscripción.</p>
      </div>
    </section>
  </section>
</template>

<style scoped>
.plans-admin-back { display: inline-flex; width: fit-content; min-height: 42px; align-items: center; gap: 9px; padding: 0 15px; border: 1px solid #bdcfbd; border-radius: 6px; color: #315d40; background: linear-gradient(135deg, #fff, #f5f8f2); box-shadow: 0 4px 12px rgba(35, 65, 43, .07); font: 700 12px 'Manrope', sans-serif; cursor: pointer; transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease, background 150ms ease; }
.plans-admin-back svg { width: 17px; height: 17px; }
.plans-admin-back small { margin-left: 2px; color: #778579; font: 400 10px 'DM Sans', sans-serif; }
.plans-admin-back:hover { transform: translateX(-2px); border-color: #8eae91; background: #f2f7ef; box-shadow: 0 6px 15px rgba(35, 65, 43, .11); }
.plans-admin-back:focus-visible, .plans-admin-navigation-grid a:focus-visible { outline: 3px solid rgba(57, 125, 84, .38); outline-offset: 2px; }
.plans-admin-navigation { padding: 16px 18px 18px; border: 1px solid #dfe8dc; border-radius: 8px; background: linear-gradient(125deg, #f9fbf7, #fff 75%); box-shadow: 0 7px 20px rgba(35, 65, 43, .05); }
.plans-admin-navigation-heading { display: grid; gap: 3px; margin: 0 0 12px; color: #2c4936; font: 700 13px 'Manrope', sans-serif; }
.plans-admin-navigation-heading span { color: #748075; font: 400 11px 'DM Sans', sans-serif; }
.plans-admin-navigation-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.plans-admin-navigation-grid a { display: flex; min-width: 0; min-height: 76px; align-items: center; gap: 10px; padding: 12px; border: 1px solid #dce5dc; border-radius: 6px; color: #365842; background: #fff; text-align: left; text-decoration: none; transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease; }
.plans-admin-navigation-grid a:hover { transform: translateY(-2px); border-color: #abc0a9; background: #fcfefb; box-shadow: 0 6px 14px rgba(39, 70, 47, .1); }
.plans-navigation-icon { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 6px; color: #42684b; background: #eff4eb; }
.plans-navigation-icon svg { width: 19px; height: 19px; }
.plans-navigation-copy { display: grid; min-width: 0; flex: 1; gap: 4px; }
.plans-navigation-copy strong { color: #2d4935; font: 700 11px 'Manrope', sans-serif; }
.plans-navigation-copy small { color: #798379; font-size: 9px; line-height: 1.4; }
.plans-navigation-arrow { width: 15px; height: 15px; flex: 0 0 auto; color: #8b998b; }
.plans-admin-navigation-grid .plans-admin-navigation-primary { border-color: #2f6746; color: #fff; background: linear-gradient(135deg, #397d54, #285e40); box-shadow: 0 4px 10px rgba(39, 95, 62, .15); }
.plans-admin-navigation-grid .plans-admin-navigation-primary .plans-navigation-icon { color: #fff; background: rgba(255, 255, 255, .15); }
.plans-admin-navigation-grid .plans-admin-navigation-primary .plans-navigation-copy strong { color: #fff; }
.plans-admin-navigation-grid .plans-admin-navigation-primary .plans-navigation-copy small { color: rgba(255, 255, 255, .82); }
.plans-admin-navigation-grid .plans-admin-navigation-primary .plans-navigation-arrow { color: rgba(255, 255, 255, .85); }
.plans-admin-navigation-grid .plans-admin-navigation-primary:hover { border-color: #214d34; color: #fff; background: linear-gradient(135deg, #326e4a, #214f36); }
#plans-editor, #plans-list { scroll-margin-top: 18px; }
@media (max-width: 760px) {
  .plans-admin-navigation-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 460px) {
  .plans-admin-back { min-height: 40px; }
  .plans-admin-back small { display: none; }
  .plans-admin-navigation { padding: 13px 11px; }
  .plans-admin-navigation-grid { grid-template-columns: 1fr; gap: 7px; }
  .plans-admin-navigation-grid a { min-height: 66px; padding: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .plans-admin-view *,
  .plans-admin-view *::before,
  .plans-admin-view *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
</style>
