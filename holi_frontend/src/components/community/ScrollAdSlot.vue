<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AdBanner from './AdBanner.vue'

const props = defineProps({
  ads: { type: Array, default: () => [] },
  placement: { type: String, required: true },
  slotIndex: { type: Number, default: 0 },
  slotCount: { type: Number, default: 1 },
  slotSeed: { type: Number, default: 0 },
})

const slotElement = ref(null)
const revealed = ref(false)
const selectedAd = computed(() => {
  const placementAds = props.ads.filter((ad) => ad.placement === props.placement)
  const slotCount = Math.max(1, props.slotCount)
  const adCount = placementAds.length
  if (!adCount || props.slotIndex < 0 || props.slotIndex >= slotCount) return null

  const offset = ((props.slotIndex + props.slotSeed) % adCount + adCount) % adCount
  if (adCount <= slotCount) return placementAds[offset]

  const adIndex = slotCount === 1 ? 0 : Math.round((props.slotIndex + props.slotSeed) * (adCount - 1) / (slotCount - 1)) % adCount
  return placementAds[adIndex]
})
let visibilityHandler

async function setupSlot(ad) {
  revealed.value = false
  if (visibilityHandler) {
    window.removeEventListener('scroll', visibilityHandler)
    window.removeEventListener('resize', visibilityHandler)
    visibilityHandler = null
  }
  await nextTick()
  if (!ad || !slotElement.value) return

  visibilityHandler = () => {
    if (!slotElement.value || revealed.value) return
    const bounds = slotElement.value.getBoundingClientRect()
    const revealLine = window.innerHeight * 0.84
    if (bounds.top > revealLine || bounds.bottom < window.innerHeight * 0.12) return
    revealed.value = true
    window.removeEventListener('scroll', visibilityHandler)
    window.removeEventListener('resize', visibilityHandler)
    visibilityHandler = null
  }
  window.addEventListener('scroll', visibilityHandler, { passive: true })
  window.addEventListener('resize', visibilityHandler, { passive: true })
  visibilityHandler()
}

watch(selectedAd, setupSlot, { immediate: true, flush: 'post' })
onMounted(() => setupSlot(selectedAd.value))

onBeforeUnmount(() => {
  if (!visibilityHandler) return
  window.removeEventListener('scroll', visibilityHandler)
  window.removeEventListener('resize', visibilityHandler)
})
</script>

<template>
  <div v-if="selectedAd" ref="slotElement" :class="['community-ad-slot', `community-ad-slot-${placement}-${slotIndex}`]">
    <Transition name="community-ad-reveal">
      <div v-if="revealed" class="community-ad-slot-content">
        <AdBanner :ads="[selectedAd]" :placement="placement" :slot-index="0" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.community-ad-slot { min-height: 1px; }
.community-ad-reveal-enter-active { transition: opacity 300ms ease, transform 300ms cubic-bezier(.2,.7,.2,1); }
.community-ad-reveal-enter-from { opacity: 0; transform: translateY(14px); }
@media (prefers-reduced-motion: reduce) {
  .community-ad-reveal-enter-active { transition: none; }
  .community-ad-reveal-enter-from { transform: none; }
}
</style>