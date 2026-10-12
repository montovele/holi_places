<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { CheckIcon, CreditCardIcon, CubeIcon, PencilIcon, PlusIcon, SparklesIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { createPlan, createPlanPrice, deletePlan, listPlans, updatePlan } from '../services/plansService'
import modules from '../modules/registry'

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
    <div class="module-intro">
      <p class="eyebrow">SAAS · PLANES</p>
      <h2>Catálogo de planes</h2>
      <p>Diseña ofertas, administra el acceso a módulos y revisa los precios publicados.</p>
    </div>

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

    <form class="record-editor plans-editor" @submit.prevent="submit">
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

    <section class="module-records plans-records">
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
