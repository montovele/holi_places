import { database, initializeDatabase } from './database.js'

await initializeDatabase()

try {
  const tables = ['locations', 'members', 'events', 'reservations']
  const counts = await Promise.all(tables.map(async (table) => {
    const [rows] = await database.query(`SELECT COUNT(*) AS count FROM ${table}`)
    return `${table}: ${rows[0].count}`
  }))
  console.log(`MySQL inicializada (${counts.join(', ')})`)
} finally {
  await database.end()
}