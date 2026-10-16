import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignEventToLocation,
  createLocationReservation,
  createModuleRecord,
  createServiceSchedule,
  deleteModuleRecord,
  deleteServiceSchedule,
  getModuleData,
  moduleIds,
  updateServiceSchedule,
  updateModuleRecord,
} from './modules.service.js'

const event = {
  id: 'evt-community',
  title: 'Encuentro comunitario',
  description: 'Reunión de la comunidad.',
  status: 'scheduled',
  recordDate: '2026-10-02T18:00:00.000Z',
  location: 'Sede Central',
  reservationCount: 3,
}
const savedReservation = {
  id: 'space-test',
  title: 'Reunión de equipo',
  contactName: 'Luis Prueba',
  startsAt: '2026-10-20T15:00:00.000Z',
  endsAt: '2026-10-20T17:00:00.000Z',
  status: 'confirmed',
  notes: 'Sala principal',
  locationId: 'loc-central',
  location: 'Sede Central',
}

function createReadPool() {
  return {
    async execute(sql) {
      if (sql.includes('COUNT(reservations.id)')) return [[event]]
      if (sql.includes('FROM service_schedules')) return [[{
        id: 'schedule-sunday', title: 'Misa dominical', dayOfWeek: 0, startsAt: '09:00:00',
      }]]
      if (sql.includes('FROM space_reservations')) return [[savedReservation]]
      if (sql.includes('FROM members')) return [[{ id: 'mem-ana', title: 'Ana Ejemplo' }]]
      if (sql.includes('FROM locations')) return [[{ id: 'loc-central', title: 'Sede Central' }]]
      if (sql.includes('FROM module_records')) return [[{ id: 'record-demo', title: 'Registro demo' }]]
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
}

test('all 11 canonical modules return records using the MySQL query interface', async () => {
  const database = createReadPool()

  assert.equal(moduleIds.length, 11)
  for (const moduleId of moduleIds) {
    const result = await getModuleData(database, moduleId, 'org-demo')
    assert.ok(result.records.length > 0, `${moduleId} should return records`)
    assert.ok(result.records.every(({ id, title }) => id && title))
  }
})

test('calendar and meetings remain aliases of the canonical events data', async () => {
  const database = createReadPool()
  const canonical = await getModuleData(database, 'events', 'org-demo')

  assert.equal(moduleIds.includes('calendar'), false)
  assert.equal(moduleIds.includes('meetings'), false)
  for (const alias of ['calendar', 'meetings']) {
    const result = await getModuleData(database, alias, 'org-demo')
    assert.deepEqual(result.records, canonical.records)
  }
})

test('weekly service schedules validate and persist within the selected tenant', async () => {
  const calls = []
  const database = {
    async execute(sql, parameters) {
      calls.push({ sql, parameters })
      if (sql.includes('SELECT id FROM locations')) return [[{ id: 'location-one' }]]
      if (sql.includes('INSERT INTO service_schedules')) return [{ affectedRows: 1 }]
      if (sql.includes('UPDATE service_schedules')) return [{ affectedRows: 1 }]
      if (sql.includes('DELETE FROM service_schedules')) return [{ affectedRows: 1 }]
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
  const input = {
    title: 'Misa dominical',
    serviceType: 'Misa',
    dayOfWeek: 0,
    startsAt: '09:00',
    endsAt: '10:00',
    locationId: 'location-one',
    description: 'Celebración semanal.',
    status: 'active',
    isPublic: true,
  }

  const created = await createServiceSchedule(database, 'org-one', input)
  assert.equal(created.title, input.title)
  assert.equal(created.isPublic, true)
  assert.equal(calls[1].parameters[1], 'org-one')
  assert.equal(calls[1].parameters[6], '09:00')
  assert.equal(calls[1].parameters[10], 1)

  await updateServiceSchedule(database, created.id, 'org-one', { ...input, title: 'Misa de domingo' })
  assert.equal(calls[3].parameters.at(-1), 'org-one')
  await deleteServiceSchedule(database, created.id, 'org-one')
  assert.deepEqual(calls[4].parameters, [created.id, 'org-one'])
})

test('weekly service schedule rejects invalid time ranges and locations outside the tenant', async () => {
  const database = {
    async execute(sql) {
      if (sql.includes('SELECT id FROM locations')) return [[]]
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
  const input = {
    title: 'Oración semanal', serviceType: 'Oración', dayOfWeek: 2,
    startsAt: '18:00', endsAt: '17:00', locationId: 'location-other',
  }
  await assert.rejects(createServiceSchedule(database, 'org-one', input), { status: 400 })
  await assert.rejects(createServiceSchedule(database, 'org-one', { ...input, endsAt: '19:00' }), { status: 404 })
})

test('unknown modules are rejected with a not found status', async () => {
  await assert.rejects(getModuleData(createReadPool(), 'not-a-module', 'org-demo'), { status: 404 })
})

test('location reservation is persisted and overlapping bookings are rejected', async () => {
  const reservations = []
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async execute(sql, parameters = []) {
      if (sql.includes('FOR UPDATE')) return [[{ id: parameters[0] }]]
      if (sql.includes("status != 'cancelled'")) {
        const [locationId, , endsAt, startsAt] = parameters
        return [reservations.filter((reservation) => reservation.locationId === locationId
          && reservation.startsAt < endsAt && reservation.endsAt > startsAt).map(({ id }) => ({ id }))]
      }
      if (sql.includes('INSERT INTO space_reservations')) {
        const [id, locationId, title, contactName, startsAt, endsAt, notes] = parameters
        reservations.push({ id, locationId, title, contactName, startsAt, endsAt, notes })
        return [{ affectedRows: 1 }]
      }
      if (sql.includes('WHERE space_reservations.id = ?')) {
        const created = reservations.find(({ id }) => id === parameters[0])
        return [[{ ...created, status: 'confirmed', location: 'Sede Central', locationId: 'loc-central' }]]
      }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
  const database = { async getConnection() { return connection } }
  const input = {
    title: 'Reunión de equipo',
    contactName: 'Luis Prueba',
    startsAt: '2026-10-20T15:00:00.000Z',
    endsAt: '2026-10-20T17:00:00.000Z',
    notes: 'Sala principal',
  }

  const reservation = await createLocationReservation(database, 'loc-central', input, 'org-demo')
  assert.equal(reservation.title, input.title)
  assert.equal(reservations.length, 1)
  await assert.rejects(createLocationReservation(database, 'loc-central', input, 'org-demo'), { status: 409 })
  assert.equal(reservations.length, 1)
})

test('invalid reservation dates are rejected before acquiring a connection', async () => {
  const database = { async getConnection() { throw new Error('Connection should not be acquired') } }
  await assert.rejects(createLocationReservation(database, 'loc-central', {
    title: 'Reserva inválida',
    contactName: 'Ana Ejemplo',
    startsAt: '2026-10-20T17:00:00.000Z',
    endsAt: '2026-10-20T15:00:00.000Z',
  }, 'org-demo'), { status: 400 })
})

test('event assignment validates and returns the persisted MySQL row', async () => {
  const assigned = { id: 'evt-community', title: 'Encuentro comunitario', locationId: 'loc-north', location: 'Centro Comunitario Norte' }
  const database = {
    async execute(sql) {
      if (sql.startsWith('SELECT id FROM events')) return [[{ id: 'evt-community' }]]
      if (sql.startsWith('SELECT id FROM locations')) return [[{ id: 'loc-north' }]]
      if (sql.startsWith('UPDATE events')) return [{ affectedRows: 1 }]
      if (sql.includes('FROM events JOIN locations')) return [[assigned]]
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  assert.deepEqual(await assignEventToLocation(database, 'evt-community', 'loc-north', 'org-demo'), assigned)
})

test('generic module create and update always bind writes to the authenticated tenant', async () => {
  const calls = []
  const database = { async execute(sql, parameters) { calls.push({ sql, parameters }); return [{ affectedRows: 1 }] } }
  const auth = { id: 'user-1', role: 'admin', organizationId: 'org-one' }
  const input = { title: 'Nuevo grupo', status: 'Activo', description: 'Equipo local', detail: '8 personas', recordDate: '2026-10-09', isPublic: true }
  const created = await createModuleRecord(database, 'groups', auth, input)
  assert.equal(created.title, input.title)
  assert.equal(calls[0].parameters[7], 1)
  assert.match(calls[0].sql, /is_public/)
  assert.equal(calls[0].parameters.at(-1), 'org-one')

  await updateModuleRecord(database, 'groups', created.id, auth, input)
  assert.match(calls[1].sql, /is_public = \?/)
  assert.equal(calls[1].parameters[5], 1)
  assert.equal(calls[1].parameters.at(-1), 'org-one')

  await deleteModuleRecord(database, 'groups', created.id, auth)
  assert.match(calls[2].sql, /organization_id = \?/)
  assert.equal(calls[2].parameters[1], 'org-one')
})

test('subscription records cannot be made public through the generic write contract', async () => {
  let savedParameters
  const database = { async execute(sql, parameters) { savedParameters = parameters; return [{ affectedRows: 1 }] } }
  const auth = { id: 'admin-1', role: 'admin', organizationId: 'org-one' }
  await createModuleRecord(database, 'subscription', auth, {
    title: 'Plan contratado', status: 'Activo', isPublic: true,
  })
  assert.equal(savedParameters[7], 0)
})

test('reservation updates lock tenant-owned rows and return the updated record', async () => {
  const updated = { ...savedReservation, title: 'Reunión actualizada' }
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async execute(sql) {
      if (sql.includes('FROM locations') && sql.includes('FOR UPDATE')) return [[{ id: 'loc-central' }]]
      if (sql.includes('FROM space_reservations') && sql.includes('FOR UPDATE')) return [[{ id: savedReservation.id }]]
      if (sql.includes('id != ?')) return [[]]
      if (sql.includes('UPDATE space_reservations')) return [{ affectedRows: 1 }]
      if (sql.includes('JOIN locations')) return [[updated]]
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
  const database = { async getConnection() { return connection } }
  const auth = { id: 'admin-1', role: 'admin', organizationId: 'org-demo' }
  const result = await updateModuleRecord(database, 'reservations', savedReservation.id, auth, {
    title: 'Reunión actualizada', contactName: savedReservation.contactName,
    locationId: savedReservation.locationId, startsAt: savedReservation.startsAt,
    endsAt: savedReservation.endsAt, notes: savedReservation.notes,
  })
  assert.equal(result.title, updated.title)
})