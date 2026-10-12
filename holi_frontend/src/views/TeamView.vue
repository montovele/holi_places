<script setup>
import { onMounted, reactive, ref } from 'vue'
import { CheckIcon, PlusIcon } from '@heroicons/vue/24/outline'
import { createOrganizationUser, getOrganizationUsers } from '../services/adminService'

const users = ref([])
const form = reactive({ email: '', initialPassword: '', role: 'operator' })
const saving = ref(false)
const error = ref('')
const notice = ref('')

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
  <section class="module-view">
    <div class="module-intro"><p class="eyebrow">ADMINISTRACIÓN DE ACCESO</p><h2>Equipo</h2><p>Usuarios asignados a la organización activa.</p></div>
    <div v-if="error" class="module-alert" role="alert">{{ error }}</div>
    <div v-if="notice" class="module-notice" role="status"><CheckIcon />{{ notice }}</div>
    <form class="record-editor" @submit.prevent="submit">
      <div class="record-editor-heading"><div><p class="eyebrow">NUEVA CUENTA</p><h3>Invitar operador</h3></div></div>
      <div class="record-editor-fields">
        <label>Correo<input v-model.trim="form.email" type="email" required maxlength="320" /></label>
        <label>Contraseña inicial<input v-model="form.initialPassword" type="password" required minlength="12" maxlength="72" autocomplete="new-password" /></label>
      </div>
      <div class="record-editor-actions"><button class="primary-action" type="submit" :disabled="saving"><PlusIcon />{{ saving ? 'Creando…' : 'Crear operador' }}</button></div>
    </form>
    <section class="module-records">
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