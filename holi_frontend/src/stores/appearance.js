import { defineStore } from 'pinia'
import { getAdminAppearance, getPublicAppearance, saveAdminAppearance } from '../services/appearanceService'

const defaults = {
  brandName: 'Holi Places',
  brandIcon: 'church',
  communityMode: 'editorial',
  colors: {
    primary: '#214F3D',
    accent: '#AD5D48',
    background: '#FAF9F4',
    text: '#20392F',
  },
}

export const useAppearanceStore = defineStore('appearance', {
  state: () => ({
    settings: structuredClone(defaults),
    loaded: false,
    loading: false,
    saving: false,
  }),
  actions: {
    apply(settings) {
      this.settings = {
        ...defaults,
        ...settings,
        colors: { ...defaults.colors, ...(settings?.colors || {}) },
      }
      this.loaded = true
      return this.settings
    },
    async loadPublic() {
      if (this.loaded || this.loading) return this.settings
      this.loading = true
      try {
        this.apply(await getPublicAppearance())
      } catch {
        this.loaded = true
      } finally {
        this.loading = false
      }
      return this.settings
    },
    async loadAdmin() {
      this.loading = true
      try {
        this.apply(await getAdminAppearance())
      } finally {
        this.loading = false
      }
      return this.settings
    },
    async save(settings) {
      this.saving = true
      try {
        this.apply(await saveAdminAppearance(settings))
        return this.settings
      } finally {
        this.saving = false
      }
    },
  },
})
