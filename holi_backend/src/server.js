import app from './app.js'
import { initializeDatabase } from './db/database.js'
import { assertAuthConfiguration } from './services/auth.service.js'

const port = Number(process.env.PORT) || 3002

assertAuthConfiguration()
await initializeDatabase()

app.listen(port, () => {
  console.log(`Holi Places API listening on http://localhost:${port}`)
})