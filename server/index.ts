import { serve } from '@hono/node-server'
import { createApp } from './app'
import { wrapDatabase } from './db/app-database'
import { runMigrations } from './db/migrate'
import { openRawDatabase } from './db/open-database'
import { createDefaultSources, setSources } from './scrapers/sourceRegistry'
import { startScheduledScrapes } from './scheduler'

const raw = openRawDatabase()
runMigrations(raw)
const db = wrapDatabase(raw)

if (process.env.HOUSE_HUNTER_TEST_MODE === '1') {
  const { createRedfinFixtureFetch } = await import('./scrapers/fixtureFetch')
  setSources(createDefaultSources({ redfinFetch: createRedfinFixtureFetch() }))
}

const app = createApp(db)

const port = parseInt(process.env.PORT ?? '3001', 10)

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`House Hunter server listening on http://localhost:${info.port}`)
})

if (process.env.DISABLE_SCHEDULED_SCRAPES !== '1') {
  startScheduledScrapes(db)
}
