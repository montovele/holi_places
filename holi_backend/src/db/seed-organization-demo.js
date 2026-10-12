import { randomBytes, randomUUID } from 'node:crypto'
import { database, initializeDatabase } from './database.js'
import { hashPassword } from '../services/auth.service.js'
import { moduleIds } from '../services/modules.service.js'

const organizationName = 'Congregación Esperanza Demo'
const organizationSlug = 'comunidad-esperanza-demo'
const adminEmail = process.env.DEMO_ORG_ADMIN_EMAIL?.trim().toLowerCase() || 'admin@comunidad-esperanza-demo.invalid'
const planCode = 'demo-full-access'

function dateFromNow(now, days, hour = 17) {
  const date = new Date(now)
  date.setUTCDate(date.getUTCDate() + days)
  date.setUTCHours(hour, 0, 0, 0)
  return date.toISOString()
}

function createDemoRecords(now) {
  const locations = [
    { id: 'demo-hp-location-norte', name: 'Centro Esperanza Norte', city: 'Tijuana', address: 'Av. Ejemplo 100, Zona Norte', latitude: 32.5149, longitude: -117.0382 },
    { id: 'demo-hp-location-centro', name: 'Comunidad Esperanza Centro', city: 'Tijuana', address: 'Calle Demostración 25, Zona Centro', latitude: 32.5312, longitude: -117.0366 },
  ]
  const events = [
    { id: 'demo-hp-event-1', title: 'Demo · Encuentro de bienvenida', description: 'Actividad ficticia para conocer la agenda de la congregación.', locationId: locations[0].id, days: 2 },
    { id: 'demo-hp-event-2', title: 'Demo · Reunión comunitaria', description: 'Reunión abierta de demostración.', locationId: locations[1].id, days: 4 },
    { id: 'demo-hp-event-3', title: 'Demo · Jornada de servicio', description: 'Ejemplo de actividad comunitaria abierta.', locationId: locations[0].id, days: 7 },
  ].map((event) => {
    const startsAt = dateFromNow(now, event.days)
    return { ...event, startsAt, endsAt: new Date(Date.parse(startsAt) + 90 * 60 * 1000).toISOString() }
  })
  const moduleRecords = [
    { id: 'demo-hp-group', moduleId: 'groups', title: 'Demo · Grupo de acompañamiento', status: 'Activo', description: 'Grupo ficticio de encuentro y apoyo comunitario.', detail: 'Reunión semanal abierta.', days: 0, isPublic: true },
    { id: 'demo-hp-attendance', moduleId: 'attendance', title: 'Demo · Participación semanal', status: 'Realizada', description: 'Resumen agregado de participación, sin datos personales.', detail: '18 asistentes (dato ficticio).', days: -1, isPublic: true },
    { id: 'demo-hp-resource', moduleId: 'resources', title: 'Demo · Biblioteca comunitaria', status: 'Disponible', description: 'Recurso ficticio para actividades y lectura comunitaria.', detail: 'Material de lectura · sede Centro.', days: 0, isPublic: true },
    { id: 'demo-hp-communication', moduleId: 'communications', title: 'Demo · Invitación a la comunidad', status: 'Publicado', description: 'Te invitamos a conocer los próximos encuentros abiertos.', detail: 'Consulta la agenda de esta comunidad.', days: 0, isPublic: true },
    { id: 'demo-hp-report', moduleId: 'reports', title: 'Demo · Resumen mensual de actividades', status: 'Publicado', description: 'Resumen ficticio de actividades comunitarias abiertas.', detail: 'Tres encuentros programados (dato ficticio).', days: 0, isPublic: true },
    { id: 'demo-hp-setting', moduleId: 'settings', title: 'Demo · Horario de atención comunitaria', status: 'Vigente', description: 'Preferencia ficticia para demostrar la vista pública.', detail: 'Lunes a viernes, 10:00 a 16:00 (dato ficticio).', days: 0, isPublic: true },
    { id: 'demo-hp-subscription-record', moduleId: 'subscription', title: 'Demo · Plan de demostración', status: 'Activo', description: 'Registro administrativo de ejemplo; no es un cobro real.', detail: 'Acceso de demostración sin cargo.', days: 0, isPublic: false },
  ]
  return { locations, events, moduleRecords }
}

export async function seedOrganizationDemo(databasePool, now = new Date(), configuration = process.env) {
  const [existingOrganizations] = await databasePool.execute(
    'SELECT id, name FROM organizations WHERE slug = ? LIMIT 1',
    [organizationSlug],
  )
  let organization = existingOrganizations[0]
  const createdOrganization = !organization
  if (!organization) organization = { id: `org-${randomUUID()}`, name: organizationName }
  else organization.name = organizationName

  const [existingAdmin] = await databasePool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [adminEmail])
  if (existingAdmin[0]) {
    const [adminOrganization] = await databasePool.execute(
      'SELECT organization_id AS organizationId FROM users WHERE id = ? LIMIT 1',
      [existingAdmin[0].id],
    )
    if (!organization.id || adminOrganization[0]?.organizationId !== organization.id) {
      throw new Error('El correo administrativo demo ya está asociado a otra organización.')
    }
  }

  const initialPassword = existingAdmin.length
    ? null
    : configuration.DEMO_ORG_ADMIN_PASSWORD || randomBytes(18).toString('base64url')
  if (initialPassword && (initialPassword.length < 12 || Buffer.byteLength(initialPassword, 'utf8') > 72)) {
    throw new Error('DEMO_ORG_ADMIN_PASSWORD debe tener entre 12 y 72 bytes UTF-8.')
  }

  const { locations, events, moduleRecords } = createDemoRecords(now)
  const connection = await databasePool.getConnection()
  try {
    await connection.beginTransaction()

    if (createdOrganization) {
      await connection.execute(
        'INSERT INTO organizations (id, name, slug, status) VALUES (?, ?, ?, \'active\')',
        [organization.id, organization.name, organizationSlug],
      )
    } else {
      await connection.execute('UPDATE organizations SET name = ? WHERE id = ?', [organization.name, organization.id])
    }

    if (!existingAdmin.length) {
      await connection.execute(`
        INSERT INTO users (id, organization_id, email, password_hash, role, status)
        VALUES (?, ?, ?, ?, 'admin', 'active')
      `, [`user-${randomUUID()}`, organization.id, adminEmail, await hashPassword(initialPassword)])
    }

    const [existingPlan] = await connection.execute('SELECT id FROM saas_plans WHERE codigo = ? LIMIT 1', [planCode])
    let planId = existingPlan[0]?.id
    if (!planId) {
      const [createdPlan] = await connection.execute(
        'INSERT INTO saas_plans (codigo, nombre, descripcion, estado) VALUES (?, ?, ?, \'active\')',
        [planCode, 'Demo · Acceso completo', 'Plan local de demostración sin integración de cobro.'],
      )
      planId = createdPlan.insertId
    }
    for (const moduleId of moduleIds) {
      await connection.execute(`
        INSERT INTO saas_plan_entitlements (plan_id, feature_key, enabled)
        VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE enabled = 1
      `, [planId, moduleId])
    }
    for (const legacyId of ['calendar', 'meetings']) {
      await connection.execute(`
        INSERT INTO saas_plan_entitlements (plan_id, feature_key, enabled)
        VALUES (?, ?, 0)
        ON DUPLICATE KEY UPDATE enabled = 0
      `, [planId, legacyId])
    }

    await connection.execute(`
      INSERT INTO subscriptions (id, organization_id, provider, status, saas_plan_id, stripe_price_id)
      VALUES ('demo-hp-subscription', ?, 'manual', 'active', ?, NULL)
      ON DUPLICATE KEY UPDATE status = 'active', saas_plan_id = VALUES(saas_plan_id),
        current_period_end = NULL, stripe_price_id = NULL
    `, [organization.id, planId])

    for (const location of locations) {
      await connection.execute(`
        INSERT INTO locations (id, name, city, address, latitude, longitude, organization_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name), city = VALUES(city), address = VALUES(address),
          latitude = VALUES(latitude), longitude = VALUES(longitude), organization_id = VALUES(organization_id)
      `, [location.id, location.name, location.city, location.address, location.latitude, location.longitude, organization.id])
    }

    for (const member of [
      { id: 'demo-hp-member-1', firstName: 'Alex', lastName: 'Ejemplo Uno', email: 'alex.demo.uno@example.invalid' },
      { id: 'demo-hp-member-2', firstName: 'Sam', lastName: 'Ejemplo Dos', email: 'sam.demo.dos@example.invalid' },
    ]) {
      await connection.execute(`
        INSERT INTO members (id, first_name, last_name, email, status, organization_id)
        VALUES (?, ?, ?, ?, 'active', ?)
        ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name),
          status = 'active', organization_id = VALUES(organization_id)
      `, [member.id, member.firstName, member.lastName, member.email, organization.id])
    }

    for (const event of events) {
      await connection.execute(`
        INSERT INTO events (id, name, description, starts_at, ends_at, status, location_id, organization_id)
        VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), starts_at = VALUES(starts_at),
          ends_at = VALUES(ends_at), status = 'scheduled', location_id = VALUES(location_id),
          organization_id = VALUES(organization_id)
      `, [event.id, event.title, event.description, event.startsAt, event.endsAt, event.locationId, organization.id])
    }

    await connection.execute(`
      INSERT INTO reservations (id, event_id, member_id, status, organization_id)
      VALUES ('demo-hp-event-reservation', 'demo-hp-event-3', 'demo-hp-member-1', 'confirmed', ?)
      ON DUPLICATE KEY UPDATE status = 'confirmed', organization_id = VALUES(organization_id)
    `, [organization.id])

    const bookingStartsAt = dateFromNow(now, 9, 16)
    const bookingEndsAt = new Date(Date.parse(bookingStartsAt) + 60 * 60 * 1000).toISOString()
    await connection.execute(`
      INSERT INTO space_reservations (id, location_id, title, contact_name, starts_at, ends_at, status, notes, organization_id)
      VALUES ('demo-hp-space-reservation', ?, 'Demo · Preparación de espacio', 'Equipo ficticio', ?, ?, 'confirmed', 'Reserva interna ficticia para probar el módulo.', ?)
      ON DUPLICATE KEY UPDATE location_id = VALUES(location_id), starts_at = VALUES(starts_at),
        ends_at = VALUES(ends_at), status = 'confirmed', notes = VALUES(notes), organization_id = VALUES(organization_id)
    `, [locations[0].id, bookingStartsAt, bookingEndsAt, organization.id])

    for (const record of moduleRecords) {
      await connection.execute(`
        INSERT INTO module_records (id, module_id, title, status, description, detail, record_date, is_public, organization_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE module_id = VALUES(module_id), title = VALUES(title), status = VALUES(status),
          description = VALUES(description), detail = VALUES(detail), record_date = VALUES(record_date),
          is_public = VALUES(is_public), organization_id = VALUES(organization_id)
      `, [record.id, record.moduleId, record.title, record.status, record.description, record.detail,
        dateFromNow(now, record.days, 12).slice(0, 10), record.isPublic ? 1 : 0, organization.id])
    }

    await connection.execute(`
      INSERT INTO community_posts (id, location_id, type, title, excerpt, body, image_url, status, published_at, organization_id)
      VALUES ('demo-hp-community-post', ?, 'activity', 'Demo · Una comunidad que se encuentra',
        'Publicación ficticia de Comunidad Esperanza Demo.',
        'Este texto es demostrativo y se utiliza para validar la presentación pública de la organización.',
        '', 'published', ?, ?)
      ON DUPLICATE KEY UPDATE location_id = VALUES(location_id), title = VALUES(title), excerpt = VALUES(excerpt),
        body = VALUES(body), status = 'published', published_at = VALUES(published_at),
        organization_id = VALUES(organization_id)
    `, [locations[0].id, dateFromNow(now, 0, 12), organization.id])

    await connection.commit()
    return {
      organization: organization.name,
      organizationId: organization.id,
      adminEmail,
      initialPassword: existingAdmin.length ? null : initialPassword,
      modules: moduleIds.length,
      locations: locations.length,
      events: events.length,
      publicModuleRecords: moduleRecords.filter(({ isPublic }) => isPublic).length,
      privateModuleRecords: moduleRecords.filter(({ isPublic }) => !isPublic).length,
      adminCreated: !existingAdmin.length,
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

await initializeDatabase()
try {
  const summary = await seedOrganizationDemo(database, new Date())
  console.log(JSON.stringify(summary, null, 2))
} finally {
  await database.end()
}