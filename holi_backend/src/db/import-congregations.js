import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import { database, initializeDatabase } from './database.js'

function parseDirectoryCsv(csvText) {
  const rows = parse(csvText, { bom: true, columns: true, skip_empty_lines: true, trim: true })
  const seenMapsUrls = new Set()
  return rows.map((row, index) => {
    const name = row.nombre?.trim()
    const mapsUrl = row.url_google_maps?.trim()
    const latitude = Number(row.latitud)
    const longitude = Number(row.longitud)
    if (!name || !mapsUrl || !/^https:\/\/www\.google\.com\/maps\//.test(mapsUrl)) {
      throw new Error(`La fila ${index + 2} debe incluir nombre y una URL válida de Google Maps.`)
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error(`La fila ${index + 2} tiene coordenadas inválidas.`)
    }
    if (seenMapsUrls.has(mapsUrl)) throw new Error(`La fila ${index + 2} repite una ficha de Google Maps.`)
    seenMapsUrls.add(mapsUrl)

    return {
      id: `directory-${createHash('sha256').update(mapsUrl).digest('hex').slice(0, 32)}`,
      name,
      type: row.tipo || '',
      address: row.direccion || '',
      phone: row.telefono || '',
      website: row.sitio_web || '',
      rating: row.calificacion ? Number(row.calificacion) : null,
      reviewCount: row.numero_resenas ? Number(row.numero_resenas) : null,
      latitude,
      longitude,
      distanceKm: row.distancia_recta_km ? Number(row.distancia_recta_km) : null,
      searchQuery: row.consulta_maps || '',
      verifiedAt: row.fecha_consulta || null,
      mapsUrl,
    }
  })
}

const csvPath = process.argv[2]
  ? fileURLToPath(new URL(`file:///${process.argv[2].replaceAll('\\', '/')}`))
  : fileURLToPath(new URL('../../../congregaciones_religiosas_tijuana.csv', import.meta.url))

await initializeDatabase()
const connection = await database.getConnection()
try {
  const records = parseDirectoryCsv(await readFile(csvPath, 'utf8'))
  await connection.beginTransaction()
  await connection.execute('DELETE FROM public_congregation_directory')
  for (const record of records) {
    await connection.execute(`
      INSERT INTO public_congregation_directory (
        id, name, type, address, phone, website, rating, review_count,
        latitude, longitude, distance_km, search_query, verified_at, maps_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [record.id, record.name, record.type, record.address, record.phone, record.website,
      record.rating, record.reviewCount, record.latitude, record.longitude, record.distanceKm,
      record.searchQuery, record.verifiedAt, record.mapsUrl])
  }
  await connection.commit()
  console.log(JSON.stringify({ imported: records.length, source: csvPath }, null, 2))
} catch (error) {
  await connection.rollback()
  throw error
} finally {
  connection.release()
  await database.end()
}