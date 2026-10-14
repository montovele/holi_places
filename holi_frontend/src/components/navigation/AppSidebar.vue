<script setup>
import { computed } from 'vue'
import {
  BuildingOffice2Icon,
  BuildingLibraryIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  CubeIcon,
  GlobeAltIcon,
  HeartIcon,
  HomeIcon,
  MapPinIcon,
  MegaphoneIcon,
  LockClosedIcon,
  UserGroupIcon,
  UsersIcon,
  BookOpenIcon,
  SparklesIcon,
} from '@heroicons/vue/24/outline'
import modules from '../../modules/registry'
import { useAuthStore } from '../../stores/auth'
import { useAppearanceStore } from '../../stores/appearance'

defineProps({ open: Boolean })
defineEmits(['close'])
const auth = useAuthStore()
const appearance = useAppearanceStore()
const modulesEnabled = computed(() => auth.user?.role === 'superadmin' || auth.subscription?.status === 'active')
const brandIcons = { church: BuildingLibraryIcon, book: BookOpenIcon, heart: HeartIcon, community: GlobeAltIcon, light: SparklesIcon }
const brandStyle = computed(() => ({
  '--app-primary': appearance.settings.colors.primary,
  '--app-accent': appearance.settings.colors.accent,
}))

const icons = {
  events: CalendarDaysIcon,
  reservations: ClipboardDocumentListIcon,
  members: UsersIcon,
  groups: UserGroupIcon,
  attendance: ClipboardDocumentListIcon,
  locations: MapPinIcon,
  resources: CubeIcon,
  communications: ChatBubbleLeftRightIcon,
  reports: ChartBarIcon,
  subscription: CreditCardIcon,
  settings: Cog6ToothIcon,
}
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar-open': open }" :style="brandStyle">
    <RouterLink class="brand" :to="{ name: 'dashboard' }" @click="$emit('close')">
      <span class="brand-mark"><component :is="brandIcons[appearance.settings.brandIcon] || BuildingLibraryIcon" aria-hidden="true" /></span>
      <span class="brand-name">{{ appearance.settings.brandName }}</span>
    </RouterLink>
    <p class="sidebar-section-label">ADMINISTRACIÓN</p>
    <nav class="primary-nav" aria-label="Navegación principal">
      <RouterLink class="nav-link" :to="{ name: 'dashboard' }" active-class="nav-link-active" @click="$emit('close')">
        <HomeIcon class="nav-icon" aria-hidden="true" />
        <span>Panel general</span>
      </RouterLink>
      <RouterLink class="nav-link" :to="{ name: 'community' }" @click="$emit('close')">
        <GlobeAltIcon class="nav-icon" aria-hidden="true" />
        <span>Blog y actividades</span>
      </RouterLink>
      <RouterLink v-if="auth.user?.role === 'superadmin'" class="nav-link" :to="{ name: 'appearance' }" active-class="nav-link-active" @click="$emit('close')">
        <Cog6ToothIcon class="nav-icon" aria-hidden="true" />
        <span>Marca y comunidad</span>
      </RouterLink>
      <RouterLink v-if="auth.user?.role === 'superadmin'" class="nav-link" :to="{ name: 'ads' }" active-class="nav-link-active" @click="$emit('close')">
        <MegaphoneIcon class="nav-icon" aria-hidden="true" />
        <span>Publicidad</span>
      </RouterLink>
      <RouterLink v-if="['admin', 'superadmin'].includes(auth.user?.role)" class="nav-link" :to="{ name: 'my-ads' }" active-class="nav-link-active" @click="$emit('close')">
        <MegaphoneIcon class="nav-icon" aria-hidden="true" />
        <span>Mis anuncios</span>
      </RouterLink>
      <template v-if="modulesEnabled">
        <RouterLink
          v-for="module in modules"
          :key="module.id"
          class="nav-link"
          :to="{ name: module.id }"
          active-class="nav-link-active"
          @click="$emit('close')"
        >
          <component :is="icons[module.id]" class="nav-icon" aria-hidden="true" />
          <span>{{ module.label }}</span>
        </RouterLink>
      </template>
      <template v-else>
        <button
          v-for="module in modules"
          :key="module.id"
          class="nav-link nav-link-disabled"
          type="button"
          disabled
          :title="`Activa la suscripción para habilitar ${module.label}`"
          :aria-label="`${module.label}, deshabilitado hasta activar la suscripción`"
        >
          <component :is="icons[module.id]" class="nav-icon" aria-hidden="true" />
          <span>{{ module.label }}</span>
          <LockClosedIcon class="nav-lock" aria-hidden="true" />
        </button>
      </template>
    </nav>
    <div class="sidebar-footer"><span class="connection-dot"></span>API independiente</div>
  </aside>
  <button v-if="open" class="sidebar-scrim" aria-label="Cerrar menú" @click="$emit('close')"></button>
</template>