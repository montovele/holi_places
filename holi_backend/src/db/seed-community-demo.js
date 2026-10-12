import { database, initializeDatabase } from './database.js'

function dateFromNow(now, days, hour = 17) {
  const date = new Date(now)
  date.setUTCDate(date.getUTCDate() + days)
  date.setUTCHours(hour, 0, 0, 0)
  return date.toISOString()
}

export async function seedCommunityDemoData(databasePool, now = new Date()) {
  const [organizations] = await databasePool.execute(
    'SELECT id, name FROM organizations WHERE name = ? LIMIT 2',
    ['Congregacion Religiosa'],
  )
  if (organizations.length !== 1) {
    throw new Error('Se esperaba encontrar exactamente una organización llamada Congregacion Religiosa.')
  }

  const organization = organizations[0]
  const [subscriptions] = await databasePool.execute(`
    SELECT id FROM subscriptions
    WHERE organization_id = ? AND status = 'active'
      AND (current_period_end IS NULL OR current_period_end > UTC_TIMESTAMP())
    LIMIT 1
  `, [organization.id])
  if (!subscriptions.length) {
    throw new Error('La organización no tiene una suscripción activa; los datos no se verían en Comunidad.')
  }

  const [locations] = await databasePool.execute(
    'SELECT id, name FROM locations WHERE organization_id = ? ORDER BY name LIMIT 2',
    [organization.id],
  )
  if (!locations.length) throw new Error('La organización necesita al menos una sede para publicar datos de comunidad.')

  const secondLocationId = locations[1]?.id || locations[0].id
  const eventDefinitions = [
    { id: 'demo-cr-calendar', title: 'Demo · Encuentro de bienvenida', description: 'Actividad de demostración para presentar la agenda comunitaria.', locationId: locations[0].id, days: 2 },
    { id: 'demo-cr-meeting', title: 'Demo · Reunión abierta de comunidad', description: 'Ejemplo público de reunión semanal.', locationId: secondLocationId, days: 4 },
    { id: 'demo-cr-event', title: 'Demo · Jornada de servicio comunitario', description: 'Ejemplo de actividad abierta a la comunidad.', locationId: locations[0].id, days: 7 },
  ]

  const moduleDefinitions = [
    { id: 'demo-cr-groups', moduleId: 'groups', title: 'Demo · Grupo de acompañamiento', status: 'Activo', description: 'Espacio demostrativo de encuentro y apoyo comunitario.', detail: 'Reunión semanal abierta a visitantes.', days: 0 },
    { id: 'demo-cr-attendance', moduleId: 'attendance', title: 'Demo · Participación en encuentro', status: 'Realizada', description: 'Resumen agregado de asistencia para mostrar el módulo.', detail: '18 asistentes (dato de demostración).', days: -1 },
    { id: 'demo-cr-resources', moduleId: 'resources', title: 'Demo · Biblioteca comunitaria', status: 'Disponible', description: 'Ejemplo de recurso comunitario disponible para actividades abiertas.', detail: 'Material de lectura · sede principal.', days: 0 },
    { id: 'demo-cr-communications', moduleId: 'communications', title: 'Demo · Invitación a la comunidad', status: 'Publicado', description: 'Te invitamos a conocer las próximas actividades abiertas.', detail: 'Consulta la agenda para ver fechas y sedes.', days: 0 },
    { id: 'demo-cr-reports', moduleId: 'reports', title: 'Demo · Resumen de actividades abiertas', status: 'Publicado', description: 'Resumen demostrativo de las actividades disponibles para la comunidad.', detail: 'Tres encuentros programados (dato de demostración).', days: 0 },
    { id: 'demo-cr-settings', moduleId: 'settings', title: 'Demo · Horario de atención comunitaria', status: 'Vigente', description: 'Preferencia pública de ejemplo; no representa un horario operativo confirmado.', detail: 'Lunes a viernes, 10:00 a 16:00 (dato de demostración).', days: 0 },
  ]

  const connection = await databasePool.getConnection()
  try {
    await connection.beginTransaction()

    for (const member of [
      { id: 'demo-cr-member-1', firstName: 'Persona', lastName: 'Demostración Uno', email: 'persona.demo.uno@example.invalid' },
      { id: 'demo-cr-member-2', firstName: 'Persona', lastName: 'Demostración Dos', email: 'persona.demo.dos@example.invalid' },
    ]) {
      await connection.execute(`
        INSERT INTO members (id, first_name, last_name, email, status, organization_id)
        VALUES (?, ?, ?, ?, 'active', ?)
        ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), status = 'active'
      `, [member.id, member.firstName, member.lastName, member.email, organization.id])
    }

    for (const event of eventDefinitions) {
      const startsAt = dateFromNow(now, event.days)
      const endsAt = new Date(Date.parse(startsAt) + 90 * 60 * 1000).toISOString()
      await connection.execute(`
        INSERT INTO events (id, name, description, starts_at, ends_at, status, location_id, organization_id)
        VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), starts_at = VALUES(starts_at),
          ends_at = VALUES(ends_at), status = 'scheduled', location_id = VALUES(location_id), organization_id = VALUES(organization_id)
      `, [event.id, event.title, event.description, startsAt, endsAt, event.locationId, organization.id])
    }

    await connection.execute(`
      INSERT INTO reservations (id, event_id, member_id, status, organization_id)
      VALUES ('demo-cr-reservation', 'demo-cr-event', 'demo-cr-member-1', 'confirmed', ?)
      ON DUPLICATE KEY UPDATE status = 'confirmed', organization_id = VALUES(organization_id)
    `, [organization.id])

    const roomStartsAt = dateFromNow(now, 8, 16)
    const roomEndsAt = new Date(Date.parse(roomStartsAt) + 60 * 60 * 1000).toISOString()
    await connection.execute(`
      INSERT INTO space_reservations (id, location_id, title, contact_name, starts_at, ends_at, status, notes, organization_id)
      VALUES ('demo-cr-space-reservation', ?, 'Demo · Preparación de sala', 'Equipo de demostración', ?, ?, 'confirmed', 'Reserva interna ficticia.', ?)
      ON DUPLICATE KEY UPDATE location_id = VALUES(location_id), starts_at = VALUES(starts_at), ends_at = VALUES(ends_at),
        status = 'confirmed', notes = VALUES(notes), organization_id = VALUES(organization_id)
    `, [locations[0].id, roomStartsAt, roomEndsAt, organization.id])

    for (const record of moduleDefinitions) {
      await connection.execute(`
        INSERT INTO module_records (id, module_id, title, status, description, detail, record_date, is_public, organization_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON DUPLICATE KEY UPDATE module_id = VALUES(module_id), title = VALUES(title), status = VALUES(status),
          description = VALUES(description), detail = VALUES(detail), record_date = VALUES(record_date),
          is_public = 1, organization_id = VALUES(organization_id)
      `, [record.id, record.moduleId, record.title, record.status, record.description, record.detail, dateFromNow(now, record.days, 12).slice(0, 10), organization.id])
    }

    await connection.execute(`
      INSERT INTO community_posts (id, location_id, type, title, excerpt, body, image_url, status, published_at, organization_id)
      VALUES ('demo-cr-community-post', ?, 'activity', 'Demo · Una comunidad que se encuentra',
        'Publicación demostrativa de Congregacion Religiosa.',
        'Este contenido es ficticio y se creó para validar la presentación pública de la comunidad.',
        '', 'published', ?, ?)
      ON DUPLICATE KEY UPDATE location_id = VALUES(location_id), title = VALUES(title), excerpt = VALUES(excerpt),
        body = VALUES(body), status = 'published', published_at = VALUES(published_at), organization_id = VALUES(organization_id)
    `, [locations[0].id, dateFromNow(now, 0, 12), organization.id])

    await connection.commit()
    return { organization: organization.name, locations: locations.length, events: eventDefinitions.length, publicModules: moduleDefinitions.length }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

await initializeDatabase()
try {
  const summary = await seedCommunityDemoData(database)
  console.log(`Datos demo aplicados: ${JSON.stringify(summary)}`)
} finally {
  await database.end()
}