import { onBeforeUnmount, onMounted, ref } from 'vue'
import { getPublicAdRotation } from '../services/communityService'

const minimumIntervalSeconds = 15
const maximumIntervalSeconds = 3600

export function usePublicAdRotation() {
  const ads = ref([])
  const refreshIntervalSeconds = ref(60)
  const lastUpdatedAt = ref(null)
  const error = ref('')
  let timerId
  let requestVersion = 0
  let disposed = false

  function scheduleRefresh() {
    window.clearTimeout(timerId)
    if (disposed || document.visibilityState === 'hidden') return
    timerId = window.setTimeout(refresh, refreshIntervalSeconds.value * 1000)
  }

  async function refresh() {
    const currentRequest = ++requestVersion
    try {
      const result = await getPublicAdRotation()
      if (disposed || currentRequest !== requestVersion) return
      ads.value = result.ads || []
      const interval = Number(result.refreshIntervalSeconds)
      refreshIntervalSeconds.value = Number.isInteger(interval)
        ? Math.min(maximumIntervalSeconds, Math.max(minimumIntervalSeconds, interval))
        : 60
      lastUpdatedAt.value = new Date()
      error.value = ''
    } catch (problem) {
      if (disposed || currentRequest !== requestVersion) return
      error.value = problem.response?.data?.error?.message || 'No se pudo actualizar la publicidad.'
    } finally {
      if (!disposed && currentRequest === requestVersion) scheduleRefresh()
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') refresh()
    else window.clearTimeout(timerId)
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    refresh()
  })

  onBeforeUnmount(() => {
    disposed = true
    requestVersion += 1
    window.clearTimeout(timerId)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return { ads, refreshIntervalSeconds, lastUpdatedAt, error, refresh }
}