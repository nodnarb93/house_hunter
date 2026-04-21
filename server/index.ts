import { serve } from '@hono/node-server'
import { createApp } from './app'
import { wrapDatabase } from './db/d1-shim'
import { runMigrations } from './db/migrate'
import { openRawDatabase } from './db/open-database'

const raw = openRawDatabase()
runMigrations(raw)
const db = wrapDatabase(raw)

const app = createApp(db)

const port = parseInt(process.env.PORT ?? '3001', 10)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`House Hunter server listening on http://localhost:${info.port}`)
})
