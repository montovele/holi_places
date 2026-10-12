<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await auth.signIn({ email: email.value, password: password.value })
    await router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : { name: 'dashboard' })
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo iniciar sesión.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-panel">
      <RouterLink class="login-brand" :to="{ name: 'community' }" aria-label="Holi Places">
        <span class="login-brand-mark">H</span><span>holi<span>places</span></span>
      </RouterLink>
      <p v-if="route.query.registered === '1'" class="login-success-notice" role="status">Registro completado. Inicia sesión para continuar.</p>
      <p class="eyebrow">ADMINISTRACIÓN SEGURA</p>
      <h1>Inicia sesión</h1>
      <p class="login-intro">Accede al espacio de gestión de tu organización.</p>
      <form class="login-form" @submit.prevent="submit">
        <label>Correo electrónico<input v-model="email" type="email" autocomplete="username" required maxlength="320" /></label>
        <label>Contraseña<input v-model="password" type="password" autocomplete="current-password" required /></label>
        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
        <button class="primary-action" type="submit" :disabled="busy">{{ busy ? 'Verificando…' : 'Entrar' }}</button>
      </form>
      <RouterLink class="login-community-link" :to="{ name: 'register' }">Registrar una congregación</RouterLink>
      <RouterLink class="login-community-link" :to="{ name: 'community' }">Volver a la comunidad</RouterLink>
    </section>
    <aside class="login-aside" aria-hidden="true">
      <img src="https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1400&q=85" alt="" />
      <p>Un espacio para organizar lo que nos reúne.</p>
    </aside>
  </main>
</template>