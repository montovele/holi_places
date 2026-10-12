import Stripe from 'stripe'
import { database } from '../db/database.js'
import { archivePlan, createPlan, createPlanPrice, getPlan, listPlanPrices, listPlans, planModuleIds, publicPlans, updatePlan } from '../services/plans.service.js'

function environment() {
  return process.env.STRIPE_ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'live' : 'test')
}

function stripeClient() {
  return process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
}

function publicPlan(plan) {
  return {
    id: plan.id,
    codigo: plan.codigo,
    nombre: plan.nombre,
    descripcion: plan.descripcion,
    precio: Number(plan.amount),
    moneda: plan.currency,
    intervalo: plan.intervalUnit,
    intervalo_cantidad: plan.intervalCount,
    modulos: Object.entries(plan.entitlements || {}).filter(([, enabled]) => enabled).map(([moduleId]) => moduleId),
  }
}

export async function readPlans(request, response) {
  response.json({ data: await listPlans(database, { environment: environment(), estado: request.query.estado || null }) })
}

export async function readPlan(request, response) {
  const plan = await getPlan(database, request.params.planId, environment())
  if (!plan) return response.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'El plan solicitado no existe.' } })
  response.json({ data: plan })
}

export async function addPlan(request, response) {
  response.status(201).json({ data: await createPlan(database, request.body) })
}

export async function editPlan(request, response) {
  response.json({ data: await updatePlan(database, request.params.planId, request.body) })
}

export async function removePlan(request, response) {
  response.json({ data: await archivePlan(database, request.params.planId) })
}

export async function readPlanPrices(request, response) {
  response.json({ data: await listPlanPrices(database, request.params.planId, environment()) })
}

export async function addPlanPrice(request, response) {
  const price = await createPlanPrice(database, request.params.planId, request.body, stripeClient(), environment())
  response.status(201).json({ data: price })
}

export async function readPublicPlans(request, response) {
  const plans = await publicPlans(database, environment())
  response.json({ data: plans.map(publicPlan), modules: planModuleIds })
}