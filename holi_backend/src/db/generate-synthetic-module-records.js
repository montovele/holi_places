import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'

const backendRoot = fileURLToPath(new URL('../../', import.meta.url))
const workspaceRoot = resolve(backendRoot, '..')
const inputPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(workspaceRoot, 'congregaciones_religiosas_tijuana.csv')
const outputPath = process.argv[3]
  ? resolve(process.argv[3])
  : resolve(backendRoot, 'data/synthetic-module-records.json')

const syntheticModuleIds = [
  'events', 'reservations', 'members', 'groups', 'attendance', 'locations',
  'resources', 'communications', 'reports', 'subscription', 'settings',
]

function stableId(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

function addDays(date, days) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function record(congregationId, moduleId, suffix, fields) {
  return {
    id: `synthetic-${stableId(`${congregationId}:${moduleId}:${suffix}`)}`,
    moduleId,
    synthetic: true,
    visibility: 'private',
    public: false,
    ...fields,
  }
}

function mapCsvRow(row, index, seenMapsUrls) {
  const name = row.nombre?.trim()
  const mapsUrl = row.url_google_maps?.trim()
  const latitude = Number(row.latitud)
  const longitude = Number(row.longitud)
  if (!name || !mapsUrl || !/^https:\/\/www\.google\.com\/maps\//.test(mapsUrl)) {
    throw new Error(`Fila ${index + 2}: nombre o enlace de Google Maps inválido.`)
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error(`Fila ${index + 2}: coordenadas inválidas.`)
  }
  if (seenMapsUrls.has(mapsUrl)) throw new Error(`Fila ${index + 2}: enlace de Maps duplicado.`)
  seenMapsUrls.add(mapsUrl)
  return {
    id: `directory-${stableId(mapsUrl)}`,
    name,
    type: row.tipo || '',
    address: row.direccion || '',
    city: 'Tijuana',
    phone: row.telefono || '',
    website: row.sitio_web || '',
    rating: row.calificacion ? Number(row.calificacion) : null,
    reviewCount: row.numero_resenas ? Number(row.numero_resenas) : null,
    latitude,
    longitude,
    mapsUrl,
    verifiedAt: row.fecha_consulta || null,
  }
}

function buildModules(congregation, index, referenceDate) {
  const firstStart = addDays(referenceDate, 5 + (index % 4))
  firstStart.setUTCHours(18, 0, 0, 0)
  const firstEnd = new Date(firstStart.getTime() + 90 * 60 * 1000)
  const secondStart = addDays(referenceDate, 12 + (index % 5))
  secondStart.setUTCHours(10, 0, 0, 0)
  const secondEnd = new Date(secondStart.getTime() + 2 * 60 * 60 * 1000)
  const eventId = `synthetic-${stableId(`${congregation.id}:events:weekly-meeting`)}`
  const attendanceCount = 12 + ((index * 7) % 24)
  const groupName = index % 2 === 0 ? 'Grupo de bienvenida' : 'Círculo de convivencia'
  const locationRecord = {
    id: `directory-location-${stableId(congregation.mapsUrl)}`,
    moduleId: 'locations',
    synthetic: false,
    visibility: 'private',
    public: false,
    title: congregation.name,
    status: 'Ficha importada; confirmar con la organización',
    description: [congregation.type, congregation.address, congregation.city].filter(Boolean).join(' · '),
    detail: `${congregation.latitude}, ${congregation.longitude}`,
    latitude: congregation.latitude,
    longitude: congregation.longitude,
    address: congregation.address,
    city: congregation.city,
    source: congregation.mapsUrl,
    verifiedAt: congregation.verifiedAt,
  }

  return {
    events: [
      record(congregation.id, 'events', 'weekly-meeting', {
        title: 'Encuentro comunitario · registro sintético',
        status: 'Borrador sintético',
        description: 'Horario ilustrativo generado para validar agenda y presentación; no confirmado por la congregación.',
        startsAt: firstStart.toISOString(),
        endsAt: firstEnd.toISOString(),
        locationId: locationRecord.id,
      }),
      record(congregation.id, 'events', 'community-activity', {
        title: 'Actividad comunitaria · registro sintético',
        status: 'Borrador sintético',
        description: 'Actividad ilustrativa sin publicación ni convocatoria real.',
        startsAt: secondStart.toISOString(),
        endsAt: secondEnd.toISOString(),
        locationId: locationRecord.id,
      }),
    ],
    reservations: [record(congregation.id, 'reservations', 'room-booking', {
      title: 'Uso de espacio · registro sintético',
      status: 'Pendiente de confirmación',
      description: 'Reserva ilustrativa para probar el flujo; no bloquea un espacio real.',
      detail: congregation.name,
      contactName: 'Responsable de prueba',
      startsAt: firstStart.toISOString(),
      endsAt: firstEnd.toISOString(),
      locationId: locationRecord.id,
    })],
    members: [1, 2, 3].map((number) => record(congregation.id, 'members', `member-${number}`, {
      title: `Participante sintético ${String(number).padStart(2, '0')}`,
      firstName: 'Participante sintético',
      lastName: String(number).padStart(2, '0'),
      email: `persona-${number}-${stableId(congregation.id)}@example.invalid`,
      status: 'Registro sintético',
      description: 'Identidad ficticia para pruebas; no representa a una persona real.',
      recordDate: '',
    })),
    groups: [record(congregation.id, 'groups', 'welcome-group', {
      title: groupName,
      status: 'Propuesta sintética',
      description: 'Grupo ilustrativo para probar el módulo; composición y horario sin confirmar.',
      detail: 'Sin integrantes ni calendario reales.',
      recordDate: referenceDate.toISOString().slice(0, 10),
    })],
    attendance: [record(congregation.id, 'attendance', 'attendance-session', {
      title: 'Control de asistencia · registro sintético',
      status: 'Borrador sintético',
      description: 'Conteo generado para probar filtros e indicadores. No es un dato de asistencia real.',
      detail: `${attendanceCount} participantes sintéticos`,
      attendeeCount: attendanceCount,
      eventId,
      recordDate: addDays(referenceDate, -2 - (index % 6)).toISOString().slice(0, 10),
    })],
    locations: [locationRecord],
    resources: [record(congregation.id, 'resources', 'resource-inventory', {
      title: 'Inventario de mobiliario · registro sintético',
      status: 'Pendiente de inventario',
      description: 'Artículo y cantidad ilustrativos; verificar físicamente antes de usar.',
      detail: `Cantidad ilustrativa: ${20 + (index % 6) * 5} sillas`,
      quantity: 20 + (index % 6) * 5,
      recordDate: referenceDate.toISOString().slice(0, 10),
    })],
    communications: [record(congregation.id, 'communications', 'community-notice', {
      title: 'Aviso comunitario · contenido sintético',
      status: 'Borrador privado',
      description: 'Texto generado únicamente para revisar la composición del módulo. No enviar ni publicar.',
      detail: 'La organización debe redactar y aprobar cualquier aviso real.',
      recordDate: referenceDate.toISOString().slice(0, 10),
    })],
    reports: [record(congregation.id, 'reports', 'monthly-summary', {
      title: 'Resumen de actividad · datos sintéticos',
      status: 'No validado',
      description: 'Informe de ejemplo calculado con los registros sintéticos de este conjunto.',
      detail: `2 eventos ilustrativos · ${attendanceCount} asistentes sintéticos`,
      recordDate: referenceDate.toISOString().slice(0, 10),
    })],
    subscription: [],
    settings: [record(congregation.id, 'settings', 'meeting-hours', {
      title: 'Horario de reunión · sin confirmar',
      status: 'Valor sintético; requiere confirmación',
      description: 'Preferencia generada solo para probar el formulario. No representa el horario de esta congregación.',
      detail: 'Sábado, 10:00 a 12:00 (ilustrativo)',
      recordDate: referenceDate.toISOString().slice(0, 10),
    })],
  }
}

const csvText = await readFile(inputPath, 'utf8')
const rows = parse(csvText, { bom: true, columns: true, skip_empty_lines: true, trim: true })
const seenMapsUrls = new Set()
const congregations = rows.map((row, index) => mapCsvRow(row, index, seenMapsUrls))
if (congregations.length !== 12) throw new Error(`Se esperaban 12 congregaciones y se encontraron ${congregations.length}.`)

const referenceDate = process.env.SYNTHETIC_REFERENCE_DATE
  ? new Date(`${process.env.SYNTHETIC_REFERENCE_DATE}T12:00:00.000Z`)
  : new Date()
if (!Number.isFinite(referenceDate.getTime())) throw new Error('SYNTHETIC_REFERENCE_DATE debe usar YYYY-MM-DD.')
referenceDate.setUTCHours(12, 0, 0, 0)

const dataset = {
  schemaVersion: 1,
  datasetType: 'synthetic-fixture',
  synthetic: true,
  visibility: 'private',
  public: false,
  generatedAt: new Date().toISOString(),
  referenceDate: referenceDate.toISOString().slice(0, 10),
  sourceCsv: inputPath,
  notice: 'Registros generados para pruebas. No importar en producción ni presentar como información real.',
  modules: syntheticModuleIds,
  billingDataGenerated: false,
  congregations: congregations.map((congregation, index) => ({
    ...congregation,
    syntheticRecords: true,
    modules: buildModules(congregation, index, referenceDate),
  })),
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
const recordCount = dataset.congregations.reduce((total, congregation) => total
  + Object.values(congregation.modules).reduce((moduleTotal, records) => moduleTotal + records.length, 0), 0)
console.log(JSON.stringify({ congregations: dataset.congregations.length, modules: syntheticModuleIds.length, records: recordCount, output: outputPath }, null, 2))