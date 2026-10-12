import { defineStore } from 'pinia'
import { getDashboard } from '../services/dashboardService'
import { getHealth } from '../services/healthService'

export const useSystemStore = defineStore('system', {
  state: () => ({
    apiStatus: 'checking',
    apiCheckedAt: null,
    apiError: null,
    databaseEngine: null,
    events: [],
    dashboardError: null,
  }),
  actions: {
    async checkApi() {
      this.apiStatus = 'checking'
      this.apiError = null

      try {
        const health = await getHealth()
        this.apiStatus = health.status === 'ok' ? 'online' : 'offline'
        this.apiCheckedAt = health.timestamp
        this.databaseEngine = health.database?.engine || null
        this.dashboardError = null

        try {
          const dashboard = await getDashboard()
          this.events = dashboard.events
        } catch (error) {
          this.events = []
          this.dashboardError = error.message
        }
      } catch (error) {
        this.apiStatus = 'offline'
        this.apiError = error.message
        this.databaseEngine = null
        this.events = []
      }
    },
  },
})