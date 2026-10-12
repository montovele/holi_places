<script setup>
import { onMounted, reactive, ref } from 'vue'
import { CheckIcon, PlusIcon } from '@heroicons/vue/24/outline'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const form = reactive({ name: '', slug: '', adminEmail: '', initialPassword: '' })
const saving = ref(false)
const error = ref('')
const notice = ref('')

async function loadOrganizations() {
  error.value = ''
  try {
    await auth.loadOrganizations()
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudieron cargar las organizaciones.'
  }
}

async function submit() {
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const organization = await auth.addOrganization(form)
    notice.value = `${organization.name} y su cuenta administradora fueron creados.`
    Object.assign(form, { name: '', slug: '', adminEmail: '', initialPassword: '' })
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo crear la organización.'
  } finally {
    saving.value = false
  }
}

onMounted(loadOrganizations)
</script>

<template>
  <section class="module-view organizations-view">
    <div class="module-intro"><p class="eyebrow">SAAS · SUPERADMINISTRACIÓN</p><h2>Organizaciones</h2><p>Tenants y cuentas administradoras iniciales.</p></div>
    <section class="superadmin-profile" aria-label="Cuenta superadmin autenticada">
      <p class="eyebrow">CUENTA SUPERADMIN</p>
      <dl><div><dt>Correo</dt><dd>{{ auth.user?.email }}</dd></div><div><dt>Rol</dt><dd>{{ auth.user?.role }}</dd></div><div><dt>ID</dt><dd>{{ auth.user?.id }}</dd></div></dl>
      <p class="profile-safety-note">No se muestran contraseñas, hashes ni tokens.</p>
    </section>
    <div v-if="error" class="module-alert" role="alert">{{ error }}</div>
    <div v-if="notice" class="module-notice" role="status"><CheckIcon />{{ notice }}</div>
    <form class="record-editor" @submit.prevent="submit">
      <div class="record-editor-heading"><div><p class="eyebrow">ALTA DE TENANT</p><h3>Nueva organización</h3></div></div>
      <div class="record-editor-fields">
        <label>Nombre<input v-model.trim="form.name" required maxlength="255" /></label>
        <label>Identificador<input v-model.trim="form.slug" required maxlength="100" pattern="[a-z0-9][a-z0-9-]*[a-z0-9]" /></label>
        <label>Correo del administrador<input v-model.trim="form.adminEmail" type="email" required maxlength="320" /></label>
        <label>Contraseña inicial<input v-model="form.initialPassword" type="password" required minlength="12" maxlength="72" autocomplete="new-password" /></label>
      </div>
      <div class="record-editor-actions"><button class="primary-action" type="submit" :disabled="saving"><PlusIcon />{{ saving ? 'Creando…' : 'Crear organización' }}</button></div>
    </form>
    <section class="module-records">
      <div class="records-toolbar"><div><p class="eyebrow">TENANTS REGISTRADOS</p><h3>{{ auth.organizations.length }} organizaciones</h3></div></div>
      <div class="records-list">
        <article v-for="organization in auth.organizations" :key="organization.id" class="module-record-row">
          <div class="record-main"><h4>{{ organization.name }}</h4><p>{{ organization.slug }}</p><span>{{ organization.id }}</span></div>
          <div class="record-meta"><span class="record-status">{{ organization.status || 'activa' }}</span><span>{{ organization.userCount || 1 }} usuarios</span></div>
          <button class="map-tool-button" type="button" @click="auth.selectOrganization(organization.id)">Abrir organización</button>
        </article>
      </div>
    </section>
  </section>
</template>