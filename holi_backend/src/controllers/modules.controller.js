import { database } from '../db/database.js'
import {
  assignEventToLocation,
  createLocationReservation,
  createModuleRecord as createRecord,
  createServiceSchedule as createSchedule,
  deleteServiceSchedule as deleteSchedule,
  deleteModuleRecord as deleteRecord,
  getModuleData,
  updateServiceSchedule as updateSchedule,
  updateModuleRecord as updateRecord,
} from '../services/modules.service.js'

export async function readModule(request, response) {
  response.json(await getModuleData(database, request.params.moduleId, request.auth.organizationId))
}

export async function createModuleRecord(request, response) {
  const record = await createRecord(database, request.params.moduleId, request.auth, request.body)
  response.status(201).json({ record })
}

export async function updateModuleRecord(request, response) {
  const record = await updateRecord(database, request.params.moduleId, request.params.recordId, request.auth, request.body)
  response.json({ record })
}

export async function deleteModuleRecord(request, response) {
  await deleteRecord(database, request.params.moduleId, request.params.recordId, request.auth)
  response.status(204).end()
}

export async function reserveLocation(request, response) {
  const reservation = await createLocationReservation(database, request.params.locationId, request.body, request.auth.organizationId)
  response.status(201).json({ reservation })
}

export async function assignEvent(request, response) {
  const event = await assignEventToLocation(database, request.params.eventId, request.body.locationId, request.auth.organizationId)
  response.json({ event })
}

export async function createServiceSchedule(request, response) {
  const schedule = await createSchedule(database, request.auth.organizationId, request.body)
  response.status(201).json({ schedule })
}

export async function updateServiceSchedule(request, response) {
  const schedule = await updateSchedule(database, request.params.scheduleId, request.auth.organizationId, request.body)
  response.json({ schedule })
}

export async function deleteServiceSchedule(request, response) {
  await deleteSchedule(database, request.params.scheduleId, request.auth.organizationId)
  response.status(204).end()
}