<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import {
  BookOpenIcon,
  BuildingLibraryIcon,
  CheckIcon,
  GlobeAltIcon,
  HeartIcon,
  PaintBrushIcon,
  SparklesIcon,
} from '@heroicons/vue/24/outline'
import { appearancePalettes, brandIcons, communityModes } from '../modules/appearanceOptions'
import { useAppearanceStore } from '../stores/appearance'

const appearance = useAppearanceStore()
const form = reactive({
  brandName: 'Holi Places',
  brandIcon: 'church',
  communityMode: 'editorial',
  colors: { primary: '#214F3D', accent: '#AD5D48', background: '#FAF9F4', text: '#20392F' },
})
const loading = ref(true)
const error = ref('')
const notice = ref('')
const brandIconComponents = {
  church: BuildingLibraryIcon,
  book: BookOpenIcon,
  heart: HeartIcon,
  community: GlobeAltIcon,
  light: SparklesIcon,
}
const selectedPalette = computed(() => appearancePalettes.find((palette) => (
  Object.keys(palette.colors).every((key) => palette.colors[key] === form.colors[key])
))?.id || '')
const previewStyle = computed(() => ({
  '--preview-primary': form.colors.primary,
  '--preview-accent': form.colors.accent,
  '--preview-background': form.colors.background,
  '--preview-text': form.colors.text,
}))

function applySettings(settings) {
  Object.assign(form, {
    brandName: settings.brandName,
    brandIcon: settings.brandIcon,
    communityMode: settings.communityMode,
    colors: { ...settings.colors },
  })
}

function selectPalette(palette) {
  Object.assign(form.colors, palette.colors)
}

async function loadSettings() {
  loading.value = true
  error.value = ''
  try {
    applySettings(await appearance.loadAdmin())
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo cargar la identidad visual.'
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  error.value = ''
  notice.value = ''
  try {
    applySettings(await appearance.save({
      brandName: form.brandName,
      brandIcon: form.brandIcon,
      communityMode: form.communityMode,
      colors: { ...form.colors },
    }))
    notice.value = 'La identidad y la presentación pública se actualizaron.'
  } catch (problem) {
    error.value = problem.response?.data?.error?.message || 'No se pudo guardar la identidad visual.'
  }
}

onMounted(loadSettings)
</script>

<template>
  <section class="module-view appearance-settings-view">
    <div class="module-intro">
      <p class="eyebrow">PLATAFORMA · SUPERADMINISTRACIÓN</p>
      <h2>Identidad visual</h2>
      <p>Administra la marca global y la forma en que las congregaciones aparecen en Comunidad.</p>
    </div>

    <div v-if="error" class="module-alert" role="alert">{{ error }}</div>
    <div v-if="notice" class="module-notice" role="status"><CheckIcon />{{ notice }}</div>
    <div v-if="loading" class="appearance-loading" role="status">Cargando configuración visual…</div>

    <form v-else class="appearance-layout" @submit.prevent="saveSettings">
      <div class="appearance-controls">
        <section class="appearance-section">
          <header class="appearance-section-heading">
            <span class="appearance-section-number">01</span>
            <div><h3>Marca de la plataforma</h3><p>Identidad que aparece en los navbars públicos y administrativos.</p></div>
          </header>
          <label class="appearance-brand-field">
            <span>Nombre visible</span>
            <input v-model.trim="form.brandName" maxlength="48" required placeholder="Holi Places" />
            <small>Hasta 48 caracteres.</small>
          </label>
          <fieldset class="appearance-icon-fieldset">
            <legend>Símbolo de marca</legend>
            <div class="appearance-icon-options">
              <label v-for="option in brandIcons" :key="option.id" class="appearance-icon-option" :class="{ selected: form.brandIcon === option.id }">
                <input v-model="form.brandIcon" type="radio" name="brand-icon" :value="option.id" />
                <component :is="brandIconComponents[option.id]" aria-hidden="true" />
                <span>{{ option.label }}</span>
              </label>
            </div>
          </fieldset>
        </section>

        <section class="appearance-section">
          <header class="appearance-section-heading">
            <span class="appearance-section-number">02</span>
            <div><h3>Paleta y color</h3><p>Selecciona una base profesional y ajusta cada tono.</p></div>
          </header>
          <fieldset class="appearance-palette-fieldset">
            <legend>Paletas sugeridas</legend>
            <div class="appearance-palette-options">
              <label v-for="palette in appearancePalettes" :key="palette.id" class="appearance-palette-option" :class="{ selected: selectedPalette === palette.id }">
                <input type="radio" name="palette" :checked="selectedPalette === palette.id" @change="selectPalette(palette)" />
                <span class="appearance-swatches" aria-hidden="true">
                  <i v-for="(color, key) in palette.colors" :key="key" :style="{ backgroundColor: color }"></i>
                </span>
                <span>{{ palette.label }}</span>
              </label>
            </div>
          </fieldset>
          <fieldset class="appearance-color-fieldset">
            <legend>Ajuste personalizado</legend>
            <label v-for="color in [
              { key: 'primary', label: 'Principal' },
              { key: 'accent', label: 'Acento' },
              { key: 'background', label: 'Fondo' },
              { key: 'text', label: 'Texto' },
            ]" :key="color.key" class="appearance-color-control">
              <span>{{ color.label }}</span>
              <input v-model="form.colors[color.key]" type="color" :aria-label="`Color ${color.label.toLowerCase()}`" />
              <code>{{ form.colors[color.key] }}</code>
            </label>
          </fieldset>
        </section>

        <section class="appearance-section">
          <header class="appearance-section-heading">
            <span class="appearance-section-number">03</span>
            <div><h3>Presentación de Comunidad</h3><p>La información es la misma; cambia su orden y jerarquía visual.</p></div>
          </header>
          <fieldset class="appearance-mode-fieldset">
            <legend>Modo de presentación</legend>
            <div class="appearance-mode-options">
              <label v-for="mode in communityModes" :key="mode.id" class="appearance-mode-option" :class="{ selected: form.communityMode === mode.id }">
                <input v-model="form.communityMode" type="radio" name="community-mode" :value="mode.id" />
                <span class="appearance-mode-illustration" :class="`mode-illustration-${mode.id}`" aria-hidden="true">
                  <i></i><i></i><i></i>
                </span>
                <span class="appearance-mode-copy"><strong>{{ mode.label }}</strong><small>{{ mode.description }}</small></span>
              </label>
            </div>
          </fieldset>
        </section>

        <div class="appearance-save-row">
          <span>Los cambios de marca se aplican a toda la plataforma.</span>
          <button class="primary-action" type="submit" :disabled="appearance.saving">
            <CheckIcon aria-hidden="true" />{{ appearance.saving ? 'Guardando…' : 'Guardar identidad' }}
          </button>
        </div>
      </div>

      <aside class="appearance-preview-column" aria-label="Previsualización">
        <div class="appearance-preview-sticky">
          <p class="eyebrow"><PaintBrushIcon aria-hidden="true" /> PREVISUALIZACIÓN EN VIVO</p>
          <div class="appearance-preview" :style="previewStyle">
            <header class="appearance-preview-nav">
              <span class="appearance-preview-mark"><component :is="brandIconComponents[form.brandIcon]" aria-hidden="true" /></span>
              <strong>{{ form.brandName || 'Nombre de marca' }}</strong>
              <span>Comunidad</span>
            </header>
            <div class="appearance-preview-content">
              <p>COMUNIDAD ABIERTA</p>
              <h3>{{ communityModes.find(({ id }) => id === form.communityMode)?.label }}</h3>
              <div class="appearance-preview-panels" :class="`mode-illustration-${form.communityMode}`">
                <span></span><span></span><span></span>
              </div>
              <button type="button">Explorar comunidad</button>
            </div>
          </div>
          <p class="appearance-preview-note">La portada y el panel usarán esta marca después de guardar.</p>
        </div>
      </aside>
    </form>
  </section>
</template>
