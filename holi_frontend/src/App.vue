<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowUpIcon } from '@heroicons/vue/24/outline'
import { useAppearanceStore } from './stores/appearance'

const showBackToTop = ref(false)
const appearance = useAppearanceStore()

function updateBackToTopVisibility() {
  showBackToTop.value = window.scrollY > 360
}

function scrollToTop() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' })
}

onMounted(() => {
  updateBackToTopVisibility()
  appearance.loadPublic()
  window.addEventListener('scroll', updateBackToTopVisibility, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateBackToTopVisibility)
})
</script>

<template>
  <RouterView />
  <Transition name="back-to-top">
    <button
      v-if="showBackToTop"
      class="global-back-to-top"
      type="button"
      aria-label="Volver arriba"
      title="Volver arriba"
      @click="scrollToTop"
    >
      <ArrowUpIcon aria-hidden="true" />
    </button>
  </Transition>
</template>