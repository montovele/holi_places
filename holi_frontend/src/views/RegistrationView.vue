<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRightIcon, EyeIcon, EyeSlashIcon, ShieldCheckIcon } from '@heroicons/vue/24/outline'
import { registerCongregation } from '../services/billingService'

const router = useRouter()
const form = reactive({ organizationName: '', email: '', password: '' })
const passwordConfirmation = ref('')
const passwordVisible = ref(false)
const saving = ref(false)
const error = ref('')
const passwordBytes = computed(() => new TextEncoder().encode(form.password).length)
const passwordLengthValid = computed(() => form.password.length >= 12)
const passwordBytesValid = computed(() => passwordBytes.value <= 72)
const passwordsMatch = computed(() => Boolean(passwordConfirmation.value) && form.password === passwordConfirmation.value)
const registrationReady = computed(() => passwordLengthValid.value && passwordBytesValid.value && passwordsMatch.value)

async function submit() {
  if (!registrationReady.value) {
    error.value = !passwordLengthValid.value
      ? 'La contraseña debe tener al menos 12 caracteres.'
      : !passwordBytesValid.value
        ? 'La contraseña no puede superar 72 bytes UTF-8.'
        : 'Las contraseñas no coinciden.'
    return
  }

  saving.value = true
  error.value = ''
  try {
    await registerCongregation({
      organizationName: form.organizationName,
      email: form.email,
      password: form.password,
    })
    await router.replace({ name: 'login', query: { registered: '1' } })
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo iniciar el registro.'
  } finally {
    saving.value = false
  }
}

</script>

<template>
  <main class="login-page registration-page">
    <section class="login-panel registration-panel">
      <RouterLink class="login-brand" :to="{ name: 'community' }"><span class="login-brand-mark">H</span><span>holi<span>places</span></span></RouterLink>
      <div class="registration-heading">
        <p class="eyebrow">REGISTRO DE CONGREGACIÓN</p>
        <h1>Crea tu espacio</h1>
        <p class="login-intro">Crea la cuenta administradora de tu comunidad. Podrás iniciar sesión al terminar.</p>
      </div>
      <form class="login-form registration-form" @submit.prevent="submit">
          <label>Nombre de la congregación<input v-model.trim="form.organizationName" required minlength="2" maxlength="255" autocomplete="organization" placeholder="Nombre de tu comunidad" /></label>
          <label>Correo administrador<input v-model.trim="form.email" type="email" required maxlength="320" autocomplete="email" placeholder="admin@ejemplo.com" /></label>
          <label class="registration-password-field">
            Contraseña
            <span class="password-input-wrap">
              <input v-model="form.password" :type="passwordVisible ? 'text' : 'password'" required minlength="12" maxlength="72" autocomplete="new-password" aria-describedby="password-policy" placeholder="Crea una contraseña segura" />
              <button class="password-visibility-button" type="button" :aria-label="passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="passwordVisible = !passwordVisible">
                <EyeSlashIcon v-if="passwordVisible" />
                <EyeIcon v-else />
              </button>
            </span>
          </label>
          <div id="password-policy" class="password-policy" aria-live="polite">
            <span :class="{ 'policy-valid': passwordLengthValid }">{{ passwordLengthValid ? '✓' : '•' }} Al menos 12 caracteres</span>
            <span :class="{ 'policy-valid': passwordBytesValid }">{{ passwordBytesValid ? '✓' : '•' }} Máximo 72 bytes UTF-8 ({{ passwordBytes }}/72)</span>
          </div>
          <label>Confirmar contraseña<input v-model="passwordConfirmation" :class="{ 'input-invalid': passwordConfirmation && !passwordsMatch, 'input-valid': passwordsMatch }" type="password" required minlength="12" maxlength="72" autocomplete="new-password" placeholder="Escribe la contraseña otra vez" /></label>
          <p v-if="passwordConfirmation && !passwordsMatch" class="password-match-error">Las contraseñas no coinciden.</p>
          <p v-if="error" class="login-error" role="alert">{{ error }}</p>
          <p class="registration-security-note"><ShieldCheckIcon /> Protegemos tu registro con validación segura y límites contra intentos automatizados.</p>
          <button class="primary-action registration-submit" type="submit" :disabled="saving" :aria-busy="saving">
            <span v-if="saving" class="registration-spinner" aria-hidden="true"></span>
            {{ saving ? 'Creando cuenta…' : 'Crear cuenta y continuar' }}
            <ArrowRightIcon v-if="!saving" />
          </button>
      </form>
      <RouterLink class="login-community-link registration-existing-link" :to="{ name: 'login' }">Ya tienes cuenta · Iniciar sesión</RouterLink>
    </section>
    <aside class="login-aside" aria-hidden="true"><img src="https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1400&q=85" alt="" /><p>Organiza las actividades de tu comunidad.</p></aside>
  </main>
</template>