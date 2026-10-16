<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowPathIcon, ArrowRightOnRectangleIcon, Bars3Icon, BuildingOffice2Icon, SignalIcon } from '@heroicons/vue/24/outline'
import { useAuthStore } from '../../stores/auth'
import { useSystemStore } from '../../stores/system'

defineEmits(['toggle-menu'])

const route = useRoute()
const router = useRouter()
const system = useSystemStore()
const auth = useAuthStore()
const title = computed(() => route.meta.title || 'Holi Places')
const subtitle = computed(() => route.meta.subtitle || '')
const activeOrganizationName = computed(() => {
  if (auth.user?.role === 'superadmin') {
    return auth.organizations.find(({ id }) => id === auth.selectedOrganizationId)?.name || ''
  }
  return auth.user?.organizationName || ''
})

function selectTenant(event) {
  auth.selectOrganization(event.target.value)
  globalThis.location.reload()
}

onMounted(() => system.checkApi())

async function signOut() {
  await auth.signOut()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <header class="topbar">
    <button class="icon-button menu-toggle" aria-label="Abrir menú" @click="$emit('toggle-menu')">
      <Bars3Icon aria-hidden="true" />
    </button>
    <div class="page-heading">
      <h1>{{ title }}</h1>
      <p>{{ subtitle }}</p>
    </div>
    <div class="topbar-tools">
      <RouterLink v-if="auth.user?.role === 'superadmin'" class="superadmin-link" :to="{ name: 'organizations' }">Organizaciones</RouterLink>
      <RouterLink v-if="auth.user?.role === 'superadmin'" class="superadmin-link" :to="{ name: 'plans' }">Planes SaaS</RouterLink>
      <RouterLink v-if="auth.user?.role === 'superadmin'" class="superadmin-link" :to="{ name: 'saas-subscriptions' }">Suscripciones</RouterLink>
      <RouterLink v-if="auth.user?.role === 'superadmin'" class="superadmin-link" :to="{ name: 'appearance' }">Marca y comunidad</RouterLink>
      <RouterLink v-if="['superadmin', 'admin'].includes(auth.user?.role)" class="superadmin-link" :to="{ name: 'team' }">Equipo</RouterLink>
      <span v-if="activeOrganizationName && auth.user?.role !== 'superadmin'" class="active-organization" :title="activeOrganizationName">
        <BuildingOffice2Icon aria-hidden="true" /><span>{{ activeOrganizationName }}</span>
      </span>
      <label v-if="auth.user?.role === 'superadmin'" class="tenant-picker" aria-label="Organización activa">
        <span>Congregación</span>
        <select :value="auth.selectedOrganizationId" :title="activeOrganizationName || 'Selecciona una congregación'" @change="selectTenant">
          <option value="">Sin selección</option>
          <option v-for="organization in auth.organizations" :key="organization.id" :value="organization.id">{{ organization.name }}</option>
        </select>
      </label>
      <button
        class="api-status"
        :class="`api-${system.apiStatus}`"
        :aria-label="system.apiStatus === 'online' ? 'API conectada' : system.apiStatus === 'checking' ? 'Conectando API' : 'API desconectada'"
        :title="system.apiError || (system.apiCheckedAt ? `Comprobada: ${new Date(system.apiCheckedAt).toLocaleTimeString()}` : 'Comprobando API')"
        @click="system.checkApi()"
      >
        <SignalIcon aria-hidden="true" />
        <span>{{ system.apiStatus === 'online' ? 'API conectada' : system.apiStatus === 'checking' ? 'Conectando API' : 'API desconectada' }}</span>
        <ArrowPathIcon v-if="system.apiStatus === 'offline'" class="retry-icon" aria-hidden="true" />
      </button>
      <span class="profile-email">{{ auth.user?.email }}</span>
      <button class="icon-button signout-button" type="button" aria-label="Cerrar sesión" title="Cerrar sesión" @click="signOut"><ArrowRightOnRectangleIcon /></button>
    </div>
  </header>
</template>