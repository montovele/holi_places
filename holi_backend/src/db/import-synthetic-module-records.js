import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { database, initializeDatabase } from './database.js'

const fixtureId = 'synthetic-tijuana-directory-v1'
const fixturePath = process.argv[2]
  ? fileURLToPath(new URL(`file:///${process.argv[2].replaceAll('\\', '/')}`))
  : fileURLToPath(new URL('../../data/synthetic-module-records.json', import.meta.url))

function validateFixture(fixture) {
  if (fixture.datasetType !== 'synthetic-fixture' || fixture.synthetic !== true || fixture.public !== false) {
    throw new Error('El archivo no está marcado como fixture sintético privado.')
  }
  if (!Array.isArray(fixture.congregations) || fixture.congregations.length !== 12) {
    throw new Error('El fixture debe contener exactamente 12 fichas de congregación.')
  }
  const seenCongregations = new Set()
  let totalRecords = 0
  for (const congregation of fixture.congregations) {
    if (!congregation.id || seenCongregations.has(congregation.id)) {
      throw new Error('El fixture contiene una ficha sin ID o con ID duplicado.')
    }
    seenCongregations.add(congregation.id)
    if (congregation.syntheticRecords !== true || !congregation.modules) {
      throw new Error(`La ficha ${congregation.id} no tiene módulos sintéticos.`)
    }
    for (const [moduleId, records] of Object.entries(congregation.modules)) {
      if (!Array.isArray(records)) throw new Error(`El módulo ${moduleId} debe ser una lista.`)
      if (moduleId === 'subscription' && records.length) {
        throw new Error('El fixture no puede incluir suscripciones ni datos de pago.')
      }
      totalRecords += records.length
      for (const record of records) {
        if (record.public !== false || record.visibility !== 'private') {
          throw new Error(`El registro ${record.id} debe ser privado y no publicable.`)
        }
      }
    }
  }
  if (totalRecords !== 156) throw new Error(`Se esperaban 156 registros y se encontraron ${totalRecords}.`)
  return { congregationIds: seenCongregations, totalRecords }
}

await initializeDatabase()
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
const { congregationIds, totalRecords } = validateFixture(fixture)
const connection = await database.getConnection()
try {
  const [directoryRows] = await connection.execute(`
    SELECT id, name, maps_url AS mapsUrl FROM public_congregation_directory
  `)
  const directoryById = new Map(directoryRows.map((row) => [row.id, row]))
  if (directoryById.size !== 12 || directoryRows.some(({ id }) => !congregationIds.has(id))) {
    throw new Error('Las 12 fichas del fixture no coinciden con el directorio público actual.')
  }
  for (const congregation of fixture.congregations) {
    const directoryRow = directoryById.get(congregation.id)
    if (directoryRow.name !== congregation.name || directoryRow.mapsUrl !== congregation.mapsUrl) {
      throw new Error(`La ficha ${congregation.id} cambió desde que se generó el fixture; vuelve a generarlo.`)
    }
  }

  await connection.beginTransaction()
  await connection.execute('DELETE FROM synthetic_module_fixtures WHERE fixture_id = ?', [fixtureId])
  for (const congregation of fixture.congregations) {
    for (const [moduleId, records] of Object.entries(congregation.modules)) {
      for (const record of records) {
        await connection.execute(`
          INSERT INTO synthetic_module_fixtures (
            record_id, fixture_id, congregation_id, module_id,
            synthetic, visibility, is_public, record_data
          ) VALUES (?, ?, ?, ?, ?, 'private', 0, ?)
        `, [record.id, fixtureId, congregation.id, moduleId, record.synthetic === true ? 1 : 0,
          JSON.stringify(record)])
      }
    }
  }
  await connection.commit()
  console.log(JSON.stringify({ fixtureId, congregations: congregationIds.size, records: totalRecords, publicRecords: 0, table: 'synthetic_module_fixtures' }, null, 2))
} catch (error) {
  await connection.rollback()
  throw error
} finally {
  connection.release()
  await database.end()
}