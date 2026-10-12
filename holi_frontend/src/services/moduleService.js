import http from './http'

export const getModuleData = async (moduleId) => {
  const { data } = await http.get(`/modules/${moduleId}`)
  return data
}

export const reserveLocation = async (locationId, reservation) => {
  const { data } = await http.post(`/modules/locations/${locationId}/reservations`, reservation)
  return data.reservation
}

export const assignEventToLocation = async (eventId, locationId) => {
  const { data } = await http.patch(`/modules/events/${eventId}/location`, { locationId })
  return data.event
}

export const createModuleRecord = async (moduleId, record) => {
  const { data } = await http.post(`/modules/${moduleId}`, record)
  return data.record
}

export const updateModuleRecord = async (moduleId, recordId, record) => {
  const { data } = await http.put(`/modules/${moduleId}/${recordId}`, record)
  return data.record
}

export const deleteModuleRecord = async (moduleId, recordId) => {
  await http.delete(`/modules/${moduleId}/${recordId}`)
}