import { defineStore } from 'pinia'
import { createOrganization, getCurrentUser, getOrganizations, login, logout } from '../services/authService'
import { getSubscriptionStatus } from '../services/billingService'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    checked: false,
    organizations: [],
    selectedOrganizationId: globalThis.sessionStorage?.getItem('holi_organization_id') || '',
    subscription: null,
  }),
  actions: {
    async loadOrganizations() {
      const previousId = this.selectedOrganizationId
      this.selectOrganization('')
      this.organizations = await getOrganizations()
      const selected = this.organizations.find(({ id }) => id === previousId) || this.organizations[0]
      this.selectOrganization(selected?.id || '')
      return this.organizations
    },
    selectOrganization(organizationId) {
      this.selectedOrganizationId = organizationId
      if (organizationId) globalThis.sessionStorage?.setItem('holi_organization_id', organizationId)
      else globalThis.sessionStorage?.removeItem('holi_organization_id')
    },
    async addOrganization(input) {
      const organization = await createOrganization(input)
      this.organizations = [...this.organizations, organization].sort((left, right) => left.name.localeCompare(right.name))
      this.selectOrganization(organization.id)
      return organization
    },
    async loadSubscription() {
      this.subscription = await getSubscriptionStatus()
      return this.subscription
    },
    async checkSession() {
      if (this.checked) return this.user
      try {
        this.user = await getCurrentUser()
      } catch {
        this.user = null
      } finally {
        this.checked = true
      }
      if (this.user?.role === 'superadmin') {
        try {
          await this.loadOrganizations()
        } catch {
          this.organizations = []
        }
      } else {
        this.organizations = []
        this.selectOrganization('')
        if (this.user) {
          try {
            await this.loadSubscription()
          } catch {
            this.subscription = null
          }
        }
      }
      return this.user
    },
    async signIn(credentials) {
      this.user = await login(credentials)
      this.checked = true
      if (this.user.role === 'superadmin') await this.loadOrganizations()
      else {
        try {
          await this.loadSubscription()
        } catch {
          this.subscription = null
        }
      }
      return this.user
    },
    async signOut() {
      try {
        await logout()
      } finally {
        this.user = null
        this.organizations = []
        this.subscription = null
        this.selectOrganization('')
        this.checked = true
      }
    },
  },
})