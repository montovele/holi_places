<script setup>
import { onMounted, reactive, ref } from 'vue'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingOffice2Icon,
  CheckIcon,
  ClipboardDocumentListIcon,
  CreditCardIcon,
  HomeIcon,
  PlusIcon,
  UsersIcon,
} from '@heroicons/vue/24/outline'
import { useRouter } from 'vue-router'
import { createOrganizationUser, getOrganizationUsers } from '../services/adminService'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const users = ref([])
const form = reactive({ email: '', initialPassword: '', role: 'operator' })
const saving = ref(false)
const error = ref('')
const notice = ref('')

function goBack() {
  const previousPath = globalThis.history?.state?.back
  if (typeof previousPath === 'string' && previousPath && !previousPath.startsWith('/login')) {
    router.back()
    return
  }
  router.push({ name: auth.user?.role === 'superadmin' ? 'organizations' : 'dashboard' })
}

async function loadUsers() {
  error.value = ''
  try {
    users.value = await getOrganizationUsers()
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo cargar el equipo.'
  }
}

async function submit() {
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    await createOrganizationUser(form)
    notice.value = 'La cuenta del equipo fue creada.'
    Object.assign(form, { email: '', initialPassword: '', role: 'operator' })
    await loadUsers()
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo crear la cuenta.'
  } finally {
    saving.value = false
  }
}

onMounted(loadUsers)
</script>

<template>
  <section class="module-view team-admin-view">
    <button class="team-admin-back" type="button" @click="goBack">
      <ArrowLeftIcon aria-hidden="true" />
      <span>Regresar</span>
      <small>A la página anterior</small>
    </button>

    <div class="module-intro"><p class="eyebrow">ADMINISTRACIÓN DE ACCESO</p><h2>Equipo</h2><p>Usuarios asignados a la organización activa.</p></div>

    <nav class="team-admin-navigation" aria-label="Accesos rápidos de administración">
      <p class="team-admin-navigation-heading">Accesos rápidos <span>Administra la plataforma y las cuentas de tu equipo</span></p>
      <div class="team-admin-navigation-grid">
        <RouterLink :to="{ name: 'dashboard' }">
          <span class="team-navigation-icon"><HomeIcon aria-hidden="true" /></span>
          <span class="team-navigation-copy"><strong>Panel general</strong><small>Regresa al resumen de actividad</small></span>
          <ArrowRightIcon class="team-navigation-arrow" aria-hidden="true" />
        </RouterLink>
        <a class="team-admin-navigation-primary" href="#team-invite">
          <span class="team-navigation-icon"><PlusIcon aria-hidden="true" /></span>
          <span class="team-navigation-copy"><strong>Invitar operador</strong><small>Crea una cuenta para el equipo</small></span>
          <ArrowRightIcon class="team-navigation-arrow" aria-hidden="true" />
        </a>
        <a href="#team-members">
          <span class="team-navigation-icon"><UsersIcon aria-hidden="true" /></span>
          <span class="team-navigation-copy"><strong>Ver equipo</strong><small>Consulta las cuentas registradas</small></span>
          <ArrowRightIcon class="team-navigation-arrow" aria-hidden="true" />
        </a>
        <RouterLink v-if="auth.user?.role === 'superadmin'" :to="{ name: 'organizations' }">
          <span class="team-navigation-icon"><BuildingOffice2Icon aria-hidden="true" /></span>
          <span class="team-navigation-copy"><strong>Organizaciones</strong><small>Administra congregaciones</small></span>
          <ArrowRightIcon class="team-navigation-arrow" aria-hidden="true" />
        </RouterLink>
        <RouterLink v-if="auth.user?.role === 'superadmin'" :to="{ name: 'plans' }">
          <span class="team-navigation-icon"><CreditCardIcon aria-hidden="true" /></span>
          <span class="team-navigation-copy"><strong>Planes SaaS</strong><small>Consulta el catálogo de planes</small></span>
          <ArrowRightIcon class="team-navigation-arrow" aria-hidden="true" />
        </RouterLink>
        <RouterLink v-if="auth.user?.role === 'superadmin'" :to="{ name: 'saas-subscriptions' }">
          <span class="team-navigation-icon"><ClipboardDocumentListIcon aria-hidden="true" /></span>
          <span class="team-navigation-copy"><strong>Suscripciones</strong><small>Gestiona accesos SaaS</small></span>
          <ArrowRightIcon class="team-navigation-arrow" aria-hidden="true" />
        </RouterLink>
      </div>
    </nav>

    <div v-if="error" class="module-alert" role="alert">{{ error }}</div>
    <div v-if="notice" class="module-notice" role="status"><CheckIcon />{{ notice }}</div>
    <form id="team-invite" class="record-editor team-admin-editor" @submit.prevent="submit">
      <div class="record-editor-heading"><div><p class="eyebrow">NUEVA CUENTA</p><h3>Invitar operador</h3></div></div>
      <div class="record-editor-fields">
        <label>Correo<input v-model.trim="form.email" type="email" required maxlength="320" /></label>
        <label>Contraseña inicial<input v-model="form.initialPassword" type="password" required minlength="12" maxlength="72" autocomplete="new-password" /></label>
      </div>
      <div class="record-editor-actions"><button class="primary-action" type="submit" :disabled="saving"><PlusIcon />{{ saving ? 'Creando…' : 'Crear operador' }}</button></div>
    </form>
    <section id="team-members" class="module-records team-admin-records">
      <div class="records-toolbar"><div><p class="eyebrow">CUENTAS</p><h3>{{ users.length }} usuarios</h3></div></div>
      <div class="records-list">
        <article v-for="user in users" :key="user.id" class="module-record-row">
          <div class="record-main"><h4>{{ user.email }}</h4><span>{{ user.id }}</span></div>
          <div class="record-meta"><span class="record-status">{{ user.role }}</span><time>{{ user.status }}</time></div>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.team-admin-view { scroll-behavior: smooth; }
.team-admin-back { display: inline-flex; width: fit-content; min-height: 42px; align-items: center; gap: 9px; padding: 0 15px; border: 1px solid #bdcfbd; border-radius: 6px; color: #315d40; background: linear-gradient(135deg, #fff, #f5f8f2); box-shadow: 0 4px 12px rgba(35, 65, 43, .07); font: 700 12px 'Manrope', sans-serif; cursor: pointer; transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease, background 150ms ease; }
.team-admin-back svg { width: 17px; height: 17px; }
.team-admin-back small { margin-left: 2px; color: #778579; font: 400 10px 'DM Sans', sans-serif; }
.team-admin-back:hover { transform: translateX(-2px); border-color: #8eae91; background: #f2f7ef; box-shadow: 0 6px 15px rgba(35, 65, 43, .11); }
.team-admin-back:focus-visible, .team-admin-navigation-grid a:focus-visible { outline: 3px solid rgba(57, 125, 84, .38); outline-offset: 2px; }
.team-admin-navigation { padding: 16px 18px 18px; border: 1px solid #dfe8dc; border-radius: 8px; background: linear-gradient(125deg, #f9fbf7, #fff 75%); box-shadow: 0 7px 20px rgba(35, 65, 43, .05); }
.team-admin-navigation-heading { display: grid; gap: 3px; margin: 0 0 12px; color: #2c4936; font: 700 13px 'Manrope', sans-serif; }
.team-admin-navigation-heading span { color: #748075; font: 400 11px 'DM Sans', sans-serif; }
.team-admin-navigation-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.team-admin-navigation-grid a { display: flex; min-width: 0; min-height: 76px; align-items: center; gap: 10px; padding: 12px; border: 1px solid #dce5dc; border-radius: 6px; color: #365842; background: #fff; text-align: left; text-decoration: none; transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease; }
.team-admin-navigation-grid a:hover { transform: translateY(-2px); border-color: #abc0a9; background: #fcfefb; box-shadow: 0 6px 14px rgba(39, 70, 47, .1); }
.team-navigation-icon { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 6px; color: #42684b; background: #eff4eb; }
.team-navigation-icon svg { width: 19px; height: 19px; }
.team-navigation-copy { display: grid; min-width: 0; flex: 1; gap: 4px; }
.team-navigation-copy strong { color: #2d4935; font: 700 11px 'Manrope', sans-serif; }
.team-navigation-copy small { color: #798379; font-size: 9px; line-height: 1.4; }
.team-navigation-arrow { width: 15px; height: 15px; flex: 0 0 auto; color: #8b998b; }
.team-admin-navigation-grid .team-admin-navigation-primary { border-color: #2f6746; color: #fff; background: linear-gradient(135deg, #397d54, #285e40); box-shadow: 0 4px 10px rgba(39, 95, 62, .15); }
.team-admin-navigation-grid .team-admin-navigation-primary .team-navigation-icon { color: #fff; background: rgba(255, 255, 255, .15); }
.team-admin-navigation-grid .team-admin-navigation-primary .team-navigation-copy strong { color: #fff; }
.team-admin-navigation-grid .team-admin-navigation-primary .team-navigation-copy small { color: rgba(255, 255, 255, .82); }
.team-admin-navigation-grid .team-admin-navigation-primary .team-navigation-arrow { color: rgba(255, 255, 255, .85); }
.team-admin-navigation-grid .team-admin-navigation-primary:hover { border-color: #214d34; color: #fff; background: linear-gradient(135deg, #326e4a, #214f36); }
.team-admin-editor, .team-admin-records { scroll-margin-top: 18px; }
@media (max-width: 760px) {
  .team-admin-navigation-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 460px) {
  .team-admin-back { min-height: 40px; }
  .team-admin-back small { display: none; }
  .team-admin-navigation { padding: 13px 11px; }
  .team-admin-navigation-grid { grid-template-columns: 1fr; gap: 7px; }
  .team-admin-navigation-grid a { min-height: 66px; padding: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .team-admin-view *,
  .team-admin-view *::before,
  .team-admin-view *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
</style>