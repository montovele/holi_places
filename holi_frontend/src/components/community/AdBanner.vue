<script setup>
import { computed } from 'vue'
import { ArrowUpRightIcon } from '@heroicons/vue/24/outline'
import { adMediaSource, isVideoAdMedia } from '../../services/adsService'

const props = defineProps({
  ads: { type: Array, default: () => [] },
  placement: { type: String, required: true },
  slotIndex: { type: Number, default: 0 },
  preview: { type: Boolean, default: false },
})

const visibleAds = computed(() => {
  if (!Array.isArray(props.ads) || !props.ads.length) return []
  const ad = props.ads[props.slotIndex] || props.ads[0]
  return ad ? [ad] : []
})
</script>

<template>
  <aside v-if="visibleAds.length" class="ad-placement" aria-label="Publicidad">
    <article v-for="ad in visibleAds" :key="ad.id" class="ad-placement-item">
      <img v-if="adMediaSource(ad.imageUrl) && !isVideoAdMedia(ad.imageUrl)" class="ad-placement-image" :src="adMediaSource(ad.imageUrl)" :alt="ad.brandName" loading="lazy" />
      <video v-else-if="adMediaSource(ad.imageUrl)" class="ad-placement-video" :src="adMediaSource(ad.imageUrl)" :aria-label="`Video publicitario de ${ad.brandName}`" controls playsinline preload="metadata"></video>
      <div class="ad-placement-copy">
        <p class="ad-placement-label">Publicidad <span>{{ ad.brandName }}</span></p>
        <h2>{{ ad.headline }}</h2>
        <p class="ad-placement-body">{{ ad.body }}</p>
        <span v-if="preview" class="ad-placement-link ad-placement-link-preview" aria-disabled="true">
          {{ ad.ctaLabel }} <ArrowUpRightIcon aria-hidden="true" />
        </span>
        <a v-else class="ad-placement-link" :href="ad.destinationUrl" target="_blank" rel="noopener noreferrer">
          {{ ad.ctaLabel }} <ArrowUpRightIcon aria-hidden="true" />
        </a>
      </div>
    </article>
  </aside>
</template>

<style scoped>
.ad-placement { display: grid; gap: 12px; margin: 28px 0; }
.ad-placement-item { display: grid; grid-template-columns: minmax(100px, 180px) minmax(0, 1fr); overflow: hidden; border: 1px solid #d9e2d9; border-left: 4px solid #b8694d; background: #f7f7ef; }
.ad-placement-image { width: 100%; height: 100%; min-height: 150px; object-fit: cover; }
.ad-placement-video { width: 100%; height: 100%; min-height: 150px; object-fit: contain; background: #17211c; }
.ad-placement-copy { display: grid; align-content: center; justify-items: start; gap: 8px; min-width: 0; padding: 18px 22px; }
.ad-placement-label { display: flex; flex-wrap: wrap; gap: 9px; margin: 0; color: #97573f; font: 700 9px 'DM Sans', sans-serif; letter-spacing: .08em; text-transform: uppercase; }
.ad-placement-label span { color: #718174; }
.ad-placement-copy h2 { margin: 0; color: #244739; font: 600 22px/1.15 'Cormorant Garamond', serif; overflow-wrap: anywhere; }
.ad-placement-body { margin: 0; color: #596c60; font: 12px/1.55 'DM Sans', sans-serif; }
.ad-placement-link { display: inline-flex; align-items: center; gap: 5px; margin-top: 2px; color: #215c42; font: 700 11px 'DM Sans', sans-serif; text-decoration: none; }
.ad-placement-link svg { width: 14px; height: 14px; }
.ad-placement-link:hover { text-decoration: underline; }
.ad-placement-link-preview { cursor: default; }
@media (max-width: 560px) {
  .ad-placement-item { grid-template-columns: 1fr; }
  .ad-placement-image { height: 150px; min-height: 0; }
  .ad-placement-video { height: 190px; min-height: 0; }
  .ad-placement-copy { padding: 15px; }
}
</style>