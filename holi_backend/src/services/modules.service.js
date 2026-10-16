import { randomUUID } from 'node:crypto'

export const legacyAgendaModuleIds = ['calendar', 'meetings']

export const moduleIds = [
  'events', 'reservations', 'members', 'groups', 'attendance',
  'locations', 'resources', 'communications', 'reports', 'subscription', 'settings',
]

export const moduleApiIds = [...moduleIds, ...legacyAgendaModuleIds]

export const communityPublishableModuleIds = ['groups', 'attendance', 'resources', 'communications', 'reports', 'settings']

function isAgendaModule(moduleId) {
  return moduleId === 'events' || legacyAgendaModuleIds.includes(moduleId)
}

async function eventRecords(database, organizationId) {
  const [events] = await database.execute(`
    SELECT events.id, events.name AS title, events.description, events.status,
      events.starts_at AS recordDate, events.ends_at AS endsAt, events.location_id AS locationId,
      locations.name AS location,
      COUNT(reservations.id) AS reservationCount
    FROM events
    JOIN locations ON locations.id = events.location_id AND locations.organization_id = events.organization_id
    LEFT JOIN reservations ON reservations.event_id = events.id AND reservations.status = 'confirmed'
      AND reservations.organization_id = ?
    WHERE events.organization_id = ?
    GROUP BY events.id, events.name, events.description, events.status, events.starts_at,
      events.ends_at, events.location_id, locations.name
    ORDER BY events.starts_at
  `, [organizationId, organizationId])
  return events.map((event) => ({
    ...event,
    detail: `${event.reservationCount} inscripciones confirmadas · ${event.location}`,
  }))
}

async function locationReservations(database, organizationId) {
  const [reservations] = await database.execute(`
    SELECT space_reservations.id, space_reservations.title, space_reservations.contact_name AS contactName,
      space_reservations.starts_at AS startsAt, space_reservations.ends_at AS endsAt,
      space_reservations.status, space_reservations.notes, locations.id AS locationId,
      locations.name AS location
    FROM space_reservations
    JOIN locations ON locations.id = space_reservations.location_id
      AND locations.organization_id = space_reservations.organization_id
    WHERE space_reservations.organization_id = ? ORDER BY space_reservations.starts_at
  `, [organizationId])
  return reservations
}

export async function getModuleData(database, moduleId, organizationId) {
  if (!moduleApiIds.includes(moduleId)) {
    const error = new Error(`El módulo "${moduleId}" no existe.`)
    error.status = 404
    throw error
  }

  if (isAgendaModule(moduleId)) {
    const [schedules] = await database.execute(`
      SELECT service_schedules.id, service_schedules.title,
        service_schedules.service_type AS serviceType,
        service_schedules.day_of_week AS dayOfWeek,
        service_schedules.starts_at AS startsAt, service_schedules.ends_at AS endsAt,
        service_schedules.description, service_schedules.status,
        service_schedules.is_public AS isPublic,
        service_schedules.location_id AS locationId, locations.name AS location
      FROM service_schedules
      JOIN locations ON locations.id = service_schedules.location_id
        AND locations.organization_id = service_schedules.organization_id
      WHERE service_schedules.organization_id = ?
      ORDER BY service_schedules.day_of_week, service_schedules.starts_at, service_schedules.title
    `, [organizationId])
    return { moduleId, records: await eventRecords(database, organizationId), schedules }
  }

  if (moduleId === 'reservations') {
    const reservations = await locationReservations(database, organizationId)
    const records = reservations.map((reservation) => ({
      id: reservation.id,
      title: reservation.title,
      status: reservation.status,
      description: reservation.notes || `Reserva solicitada por ${reservation.contactName}`,
      detail: `${reservation.location} · ${reservation.contactName}`,
      recordDate: reservation.startsAt,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      contactName: reservation.contactName,
      notes: reservation.notes,
      locationId: reservation.locationId,
    }))
    return { moduleId, records }
  }

  if (moduleId === 'members') {
    const [records] = await database.execute(`
      SELECT id, first_name AS firstName, last_name AS lastName, CONCAT(first_name, ' ', last_name) AS title,
        status, email, email AS detail,
        'Miembro de la comunidad' AS description, '' AS recordDate
      FROM members WHERE organization_id = ? ORDER BY last_name, first_name
    `, [organizationId])
    return { moduleId, records }
  }

  if (moduleId === 'locations') {
    const [records] = await database.execute(`
      SELECT id, name AS title, city, address, 'Activa' AS status, CONCAT(address, ', ', city) AS description,
        city AS detail, '' AS recordDate, latitude, longitude
      FROM locations WHERE organization_id = ? ORDER BY name
    `, [organizationId])
    const events = (await eventRecords(database, organizationId)).map((event) => ({
      id: event.id,
      title: event.title,
      location: event.location,
      startsAt: event.recordDate,
    }))
    return { moduleId, records, events, reservations: await locationReservations(database, organizationId) }
  }

  const [records] = await database.execute(`
    SELECT id, title, status, description, detail, record_date AS recordDate, is_public AS isPublic
    FROM module_records WHERE module_id = ? AND organization_id = ? ORDER BY record_date DESC, title
  `, [moduleId, organizationId])
  return { moduleId, records }
}

function invalid(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

const serviceTypes = new Set(['Misa', 'Oración', 'Culto', 'Reunión', 'Otro'])
const serviceTimePattern = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/

function validateServiceSchedule(input = {}) {
  const title = requiredText(input.title, 'El nombre del servicio')
  const serviceType = requiredText(input.serviceType, 'El tipo de actividad', 40)
  if (!serviceTypes.has(serviceType)) throw invalid('Selecciona un tipo de actividad válido.')
  const dayOfWeek = Number(input.dayOfWeek)
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw invalid('Selecciona un día de la semana válido.')
  }
  if (!serviceTimePattern.test(input.startsAt || '') || !serviceTimePattern.test(input.endsAt || '')) {
    throw invalid('Indica una hora de inicio y de fin válidas.')
  }
  if (input.endsAt <= input.startsAt) throw invalid('La hora de fin debe ser posterior a la hora de inicio.')
  if (input.status && !['active', 'inactive'].includes(input.status)) throw invalid('Selecciona un estado válido.')
  if (!input.locationId) throw invalid('Selecciona una sede para el horario.')
  return {
    title,
    serviceType,
    dayOfWeek,
    startsAt: input.startsAt.slice(0, 8),
    endsAt: input.endsAt.slice(0, 8),
    description: typeof input.description === 'string' ? input.description.trim() : '',
    status: input.status || 'active',
    isPublic: Boolean(input.isPublic),
    locationId: input.locationId,
  }
}

async function assertScheduleLocation(database, locationId, organizationId) {
  const [locations] = await database.execute(
    'SELECT id FROM locations WHERE id = ? AND organization_id = ?',
    [locationId, organizationId],
  )
  if (!locations.length) throw invalid('La sede seleccionada no existe en esta organización.', 404)
}

export async function createServiceSchedule(database, organizationId, input = {}) {
  const schedule = validateServiceSchedule(input)
  await assertScheduleLocation(database, schedule.locationId, organizationId)
  const id = `schedule-${randomUUID()}`
  await database.execute(`
    INSERT INTO service_schedules
      (id, organization_id, location_id, title, service_type, day_of_week, starts_at, ends_at, description, status, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, organizationId, schedule.locationId, schedule.title, schedule.serviceType,
    schedule.dayOfWeek, schedule.startsAt, schedule.endsAt, schedule.description,
    schedule.status, schedule.isPublic ? 1 : 0,
  ])
  return { id, ...schedule, organizationId, isPublic: schedule.isPublic }
}

export async function updateServiceSchedule(database, scheduleId, organizationId, input = {}) {
  const schedule = validateServiceSchedule(input)
  await assertScheduleLocation(database, schedule.locationId, organizationId)
  const [result] = await database.execute(`
    UPDATE service_schedules
    SET location_id = ?, title = ?, service_type = ?, day_of_week = ?,
      starts_at = ?, ends_at = ?, description = ?, status = ?, is_public = ?
    WHERE id = ? AND organization_id = ?
  `, [
    schedule.locationId, schedule.title, schedule.serviceType, schedule.dayOfWeek,
    schedule.startsAt, schedule.endsAt, schedule.description, schedule.status,
    schedule.isPublic ? 1 : 0, scheduleId, organizationId,
  ])
  if (!result.affectedRows) throw invalid('El horario no existe en esta organización.', 404)
  return { id: scheduleId, ...schedule, organizationId }
}

export async function deleteServiceSchedule(database, scheduleId, organizationId) {
  const [result] = await database.execute(
    'DELETE FROM service_schedules WHERE id = ? AND organization_id = ?',
    [scheduleId, organizationId],
  )
  if (!result.affectedRows) throw invalid('El horario no existe en esta organización.', 404)
}

function validateDateRange(startsAt, endsAt) {
  if (!startsAt || !endsAt || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt))) {
    throw invalid('Indica una fecha de inicio y de fin válidas.')
  }
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw invalid('La fecha de fin debe ser posterior al inicio.')
  }
}

export async function createLocationReservation(database, locationId, input = {}, organizationId) {
  const { title, contactName, startsAt, endsAt, notes = '' } = input
  if (!title?.trim() || !contactName?.trim()) throw invalid('El título y la persona responsable son obligatorios.')
  validateDateRange(startsAt, endsAt)

  const connection = await database.getConnection()
  let transactionStarted = false
  try {
    await connection.beginTransaction()
    transactionStarted = true

    const [locations] = await connection.execute('SELECT id FROM locations WHERE id = ? AND organization_id = ? FOR UPDATE', [locationId, organizationId])
    if (!locations.length) throw invalid('La sede seleccionada no existe.', 404)

    const [conflicts] = await connection.execute(`
      SELECT id FROM space_reservations
      WHERE location_id = ? AND organization_id = ? AND status != 'cancelled' AND starts_at < ? AND ends_at > ?
      LIMIT 1
    `, [locationId, organizationId, endsAt, startsAt])
    if (conflicts.length) throw invalid('La sede ya tiene una reserva en ese horario.', 409)

    const id = `space-${randomUUID()}`
    await connection.execute(`
      INSERT INTO space_reservations (id, location_id, title, contact_name, starts_at, ends_at, notes, organization_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, locationId, title.trim(), contactName.trim(), new Date(startsAt).toISOString(), new Date(endsAt).toISOString(), notes.trim(), organizationId])

    const [reservations] = await connection.execute(`
      SELECT space_reservations.id, space_reservations.title, space_reservations.contact_name AS contactName,
        space_reservations.starts_at AS startsAt, space_reservations.ends_at AS endsAt,
        space_reservations.status, space_reservations.notes, locations.id AS locationId,
        locations.name AS location
      FROM space_reservations JOIN locations ON locations.id = space_reservations.location_id
        AND locations.organization_id = space_reservations.organization_id
      WHERE space_reservations.id = ? AND space_reservations.organization_id = ?
    `, [id, organizationId])
    await connection.commit()
    transactionStarted = false
    return reservations[0]
  } catch (error) {
    if (transactionStarted) await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function updateLocationReservation(database, reservationId, input = {}, organizationId) {
  const { locationId, title, contactName, startsAt, endsAt, notes = '' } = input
  if (!locationId || !title?.trim() || !contactName?.trim()) throw invalid('La sede, el título y la persona responsable son obligatorios.')
  validateDateRange(startsAt, endsAt)
  const connection = await database.getConnection()
  let transactionStarted = false
  try {
    await connection.beginTransaction()
    transactionStarted = true
    const [locations] = await connection.execute('SELECT id FROM locations WHERE id = ? AND organization_id = ? FOR UPDATE', [locationId, organizationId])
    if (!locations.length) throw invalid('La sede seleccionada no existe en esta organización.', 404)
    const [current] = await connection.execute(
      'SELECT id FROM space_reservations WHERE id = ? AND organization_id = ? FOR UPDATE',
      [reservationId, organizationId],
    )
    if (!current.length) throw invalid('La reserva no existe en esta organización.', 404)
    const [conflicts] = await connection.execute(`
      SELECT id FROM space_reservations
      WHERE location_id = ? AND organization_id = ? AND id != ? AND status != 'cancelled'
        AND starts_at < ? AND ends_at > ? LIMIT 1
    `, [locationId, organizationId, reservationId, endsAt, startsAt])
    if (conflicts.length) throw invalid('La sede ya tiene una reserva en ese horario.', 409)
    await connection.execute(`
      UPDATE space_reservations
      SET location_id = ?, title = ?, contact_name = ?, starts_at = ?, ends_at = ?, notes = ?
      WHERE id = ? AND organization_id = ?
    `, [locationId, title.trim(), contactName.trim(), new Date(startsAt).toISOString(), new Date(endsAt).toISOString(), notes.trim(), reservationId, organizationId])
    const [reservations] = await connection.execute(`
      SELECT space_reservations.id, space_reservations.title, space_reservations.contact_name AS contactName,
        space_reservations.starts_at AS startsAt, space_reservations.ends_at AS endsAt,
        space_reservations.status, space_reservations.notes, locations.id AS locationId, locations.name AS location
      FROM space_reservations JOIN locations ON locations.id = space_reservations.location_id
        AND locations.organization_id = space_reservations.organization_id
      WHERE space_reservations.id = ? AND space_reservations.organization_id = ?
    `, [reservationId, organizationId])
    await connection.commit()
    transactionStarted = false
    return reservations[0]
  } catch (error) {
    if (transactionStarted) await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function assignEventToLocation(database, eventId, locationId, organizationId) {
  if (!locationId) throw invalid('Selecciona una sede para el evento.')

  const [events] = await database.execute('SELECT id FROM events WHERE id = ? AND organization_id = ?', [eventId, organizationId])
  if (!events.length) throw invalid('El evento seleccionado no existe.', 404)

  const [locations] = await database.execute('SELECT id FROM locations WHERE id = ? AND organization_id = ?', [locationId, organizationId])
  if (!locations.length) throw invalid('La sede seleccionada no existe.', 404)

  await database.execute('UPDATE events SET location_id = ? WHERE id = ? AND organization_id = ?', [locationId, eventId, organizationId])
  const [updatedEvents] = await database.execute(`
    SELECT events.id, events.name AS title, events.location_id AS locationId, locations.name AS location,
      events.starts_at AS startsAt
    FROM events JOIN locations ON locations.id = events.location_id
      AND locations.organization_id = events.organization_id
    WHERE events.id = ? AND events.organization_id = ?
  `, [eventId, organizationId])
  return updatedEvents[0]
}

const genericRecordModules = new Set([
  'groups', 'attendance', 'resources', 'communications', 'reports', 'subscription', 'settings',
])

function requiredText(value, label, maxLength = 255) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw invalid(`${label} es obligatorio y no puede exceder ${maxLength} caracteres.`)
  }
  return value.trim()
}

function moduleNotFound(moduleId) {
  if (!moduleApiIds.includes(moduleId)) throw invalid(`El módulo "${moduleId}" no existe.`, 404)
}

async function saveGenericRecord(database, moduleId, recordId, input, organizationId) {
  const title = requiredText(input.title, 'El título')
  const status = requiredText(input.status, 'El estado', 100)
  const description = typeof input.description === 'string' ? input.description.trim() : ''
  const detail = typeof input.detail === 'string' ? input.detail.trim() : ''
  const recordDate = typeof input.recordDate === 'string' ? input.recordDate.trim() : ''
  const isPublic = communityPublishableModuleIds.includes(moduleId) && Boolean(input.isPublic)

  if (!recordId) {
    const id = randomUUID()
    await database.execute(`
      INSERT INTO module_records (id, module_id, title, status, description, detail, record_date, is_public, organization_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, moduleId, title, status, description, detail, recordDate, isPublic ? 1 : 0, organizationId])
    return { id, moduleId, title, status, description, detail, recordDate, isPublic }
  }

  const [result] = await database.execute(`
    UPDATE module_records
    SET title = ?, status = ?, description = ?, detail = ?, record_date = ?, is_public = ?
    WHERE id = ? AND module_id = ? AND organization_id = ?
  `, [title, status, description, detail, recordDate, isPublic ? 1 : 0, recordId, moduleId, organizationId])
  if (!result.affectedRows) throw invalid('El registro no existe en esta organización.', 404)
  return { id: recordId, moduleId, title, status, description, detail, recordDate, isPublic }
}

async function saveEventRecord(database, recordId, input, organizationId) {
  const title = requiredText(input.title, 'El título del evento')
  const description = typeof input.description === 'string' ? input.description.trim() : ''
  const startsAt = input.startsAt || input.recordDate
  const endsAt = input.endsAt
  validateDateRange(startsAt, endsAt)

  if (!recordId) {
    if (!input.locationId) throw invalid('Selecciona una sede para el evento.')
    const [locations] = await database.execute('SELECT id FROM locations WHERE id = ? AND organization_id = ?', [input.locationId, organizationId])
    if (!locations.length) throw invalid('La sede seleccionada no existe en esta organización.', 404)
    const id = `evt-${randomUUID()}`
    await database.execute(`
      INSERT INTO events (id, name, description, starts_at, ends_at, status, location_id, organization_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, title, description, new Date(startsAt).toISOString(), new Date(endsAt).toISOString(), input.status || 'scheduled', input.locationId, organizationId])
    return { id, title, description, startsAt, endsAt, status: input.status || 'scheduled', locationId: input.locationId }
  }

  const [locations] = await database.execute('SELECT id FROM locations WHERE id = ? AND organization_id = ?', [input.locationId, organizationId])
  if (!locations.length) throw invalid('La sede seleccionada no existe en esta organización.', 404)
  const [result] = await database.execute(`
    UPDATE events SET name = ?, description = ?, starts_at = ?, ends_at = ?, status = ?, location_id = ?
    WHERE id = ? AND organization_id = ?
  `, [title, description, new Date(startsAt).toISOString(), new Date(endsAt).toISOString(), input.status || 'scheduled', input.locationId, recordId, organizationId])
  if (!result.affectedRows) throw invalid('El evento no existe en esta organización.', 404)
  return { id: recordId, title, description, startsAt, endsAt, status: input.status || 'scheduled', locationId: input.locationId }
}

async function saveMemberRecord(database, recordId, input, organizationId) {
  const firstName = requiredText(input.firstName, 'El nombre', 150)
  const lastName = requiredText(input.lastName, 'El apellido', 150)
  const email = requiredText(input.email, 'El correo', 320).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid('El correo no es válido.')
  const status = input.status || 'active'

  if (!recordId) {
    const id = `mem-${randomUUID()}`
    await database.execute(`
      INSERT INTO members (id, first_name, last_name, email, status, organization_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, firstName, lastName, email, status, organizationId])
    return { id, firstName, lastName, email, status }
  }

  const [result] = await database.execute(`
    UPDATE members SET first_name = ?, last_name = ?, email = ?, status = ?
    WHERE id = ? AND organization_id = ?
  `, [firstName, lastName, email, status, recordId, organizationId])
  if (!result.affectedRows) throw invalid('El miembro no existe en esta organización.', 404)
  return { id: recordId, firstName, lastName, email, status }
}

async function saveLocationRecord(database, recordId, input, organizationId) {
  const name = requiredText(input.title || input.name, 'El nombre de la sede')
  const city = requiredText(input.city, 'La ciudad')
  const address = requiredText(input.address, 'La dirección', 500)
  const latitude = Number(input.latitude)
  const longitude = Number(input.longitude)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw invalid('Las coordenadas deben estar dentro de los límites geográficos.')
  }

  if (!recordId) {
    const id = `loc-${randomUUID()}`
    await database.execute(`
      INSERT INTO locations (id, name, city, address, latitude, longitude, organization_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, name, city, address, latitude, longitude, organizationId])
    return { id, title: name, city, address, latitude, longitude }
  }

  const [result] = await database.execute(`
    UPDATE locations SET name = ?, city = ?, address = ?, latitude = ?, longitude = ?
    WHERE id = ? AND organization_id = ?
  `, [name, city, address, latitude, longitude, recordId, organizationId])
  if (!result.affectedRows) throw invalid('La sede no existe en esta organización.', 404)
  return { id: recordId, title: name, city, address, latitude, longitude }
}

function recordTable(moduleId) {
  if (isAgendaModule(moduleId)) return 'events'
  if (moduleId === 'members') return 'members'
  if (moduleId === 'locations') return 'locations'
  if (moduleId === 'reservations') return 'space_reservations'
  if (genericRecordModules.has(moduleId)) return 'module_records'
  throw invalid(`El módulo "${moduleId}" no tiene una entidad CRUD definida.`, 400)
}

export async function createModuleRecord(database, moduleId, auth, input = {}) {
  moduleNotFound(moduleId)
  if (isAgendaModule(moduleId)) return saveEventRecord(database, null, input, auth.organizationId)
  if (moduleId === 'members') return saveMemberRecord(database, null, input, auth.organizationId)
  if (moduleId === 'locations') return saveLocationRecord(database, null, input, auth.organizationId)
  if (moduleId === 'reservations') {
    return createLocationReservation(database, input.locationId, input, auth.organizationId)
  }
  return saveGenericRecord(database, moduleId, null, input, auth.organizationId)
}

export async function updateModuleRecord(database, moduleId, recordId, auth, input = {}) {
  moduleNotFound(moduleId)
  if (isAgendaModule(moduleId)) return saveEventRecord(database, recordId, input, auth.organizationId)
  if (moduleId === 'members') return saveMemberRecord(database, recordId, input, auth.organizationId)
  if (moduleId === 'locations') return saveLocationRecord(database, recordId, input, auth.organizationId)
  if (moduleId === 'reservations') return updateLocationReservation(database, recordId, input, auth.organizationId)
  return saveGenericRecord(database, moduleId, recordId, input, auth.organizationId)
}

export async function deleteModuleRecord(database, moduleId, recordId, auth) {
  moduleNotFound(moduleId)
  const table = recordTable(moduleId)
  const idColumn = 'id'
  const moduleCondition = table === 'module_records' ? ' AND module_id = ?' : ''
  const parameters = table === 'module_records'
    ? [recordId, auth.organizationId, moduleId]
    : [recordId, auth.organizationId]
  const [result] = await database.execute(`DELETE FROM ${table} WHERE ${idColumn} = ? AND organization_id = ?${moduleCondition}`, parameters)
  if (!result.affectedRows) throw invalid('El registro no existe en esta organización.', 404)
}