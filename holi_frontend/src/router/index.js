import { createRouter, createWebHistory } from 'vue-router'
import AdminLayout from '../layouts/AdminLayout.vue'
import DashboardView from '../views/DashboardView.vue'
import CommunityView from '../views/CommunityView.vue'
import CommunitySocialView from '../views/CommunitySocialView.vue'
import CongregationProfileView from '../views/CongregationProfileView.vue'
import ModuleView from '../views/ModuleView.vue'
import LoginView from '../views/LoginView.vue'
import OrganizationsView from '../views/OrganizationsView.vue'
import TeamView from '../views/TeamView.vue'
import RegistrationView from '../views/RegistrationView.vue'
import BillingView from '../views/BillingView.vue'
import PlansView from '../views/PlansView.vue'
import modules from '../modules/registry'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: CommunityView,
      meta: { title: 'Comunidad', public: true },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { public: true },
    },
    {
      path: '/registrarse',
      name: 'register',
      component: RegistrationView,
      meta: { public: true },
    },
    {
      path: '/billing',
      name: 'billing',
      component: BillingView,
      meta: { title: 'Suscripción', subtitle: 'Estado de pago' },
    },
    {
      path: '/comunidad',
      name: 'community',
      component: CommunityView,
      meta: { title: 'Blog y actividades', public: true },
    },
    {
      path: '/comunidad/social',
      name: 'community-social',
      component: CommunitySocialView,
      meta: { title: 'Comunidad Social', public: true },
    },
    {
      path: '/comunidad/congregacion/:congregationId',
      name: 'congregation-profile',
      component: CongregationProfileView,
      meta: { title: 'Perfil de congregación', public: true },
    },
    {
      path: '/admin/organizations',
      name: 'organizations',
      component: OrganizationsView,
      meta: { title: 'Organizaciones', subtitle: 'Administración SaaS', roles: ['superadmin'] },
    },
    {
      path: '/admin/team',
      name: 'team',
      component: TeamView,
      meta: { title: 'Equipo', subtitle: 'Usuarios y roles', roles: ['superadmin', 'admin'] },
    },
    {
      path: '/admin/plans',
      name: 'plans',
      component: PlansView,
      meta: { title: 'Planes SaaS', subtitle: 'Catalogo y módulos', roles: ['superadmin'] },
    },
    {
      path: '/admin',
      component: AdminLayout,
      redirect: { name: 'dashboard' },
      children: [
        { path: '/calendar', redirect: { name: 'events' } },
        { path: '/meetings', redirect: { name: 'events' } },
        {
          path: '/dashboard',
          name: 'dashboard',
          component: DashboardView,
          meta: { title: 'Panel general', subtitle: 'Estado de la plataforma' },
        },
        {
          path: '/admin/appearance',
          name: 'appearance',
          component: () => import('../views/AppearanceView.vue'),
          meta: { title: 'Identidad visual', subtitle: 'Marca global y comunidad', roles: ['superadmin'] },
        },
        ...modules.map((module) => ({
          path: `/${module.path}`,
          name: module.id,
          component: ModuleView,
          props: { module },
          meta: { title: module.label, subtitle: module.description, requiresSubscription: module.id !== 'subscription' },
        })),
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.public && to.name !== 'login') return true
  const auth = useAuthStore()
  const user = await auth.checkSession()
  if (to.name === 'login' && user) return { name: 'dashboard' }
  if (!to.meta.public && !user) return { name: 'login', query: { redirect: to.fullPath } }
  if (!user) return true
  if (to.meta.roles && !to.meta.roles.includes(user.role)) return { name: 'dashboard' }
  if (user.role !== 'superadmin' && (to.name === 'dashboard' || to.meta.requiresSubscription)) {
    try {
      await auth.loadSubscription()
    } catch {
      auth.subscription = null
    }
  }
  if (to.meta.requiresSubscription && user.role !== 'superadmin' && auth.subscription?.status !== 'active') return { name: 'dashboard' }
  if (to.name === 'billing' && user.role !== 'superadmin' && auth.subscription?.status === 'active') return { name: 'dashboard' }
  return true
})

export default router