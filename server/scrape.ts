import { wrapDatabase } from './db/app-database'
import { runMigrations } from './db/migrate'
import { openRawDatabase } from './db/open-database'
import { runAllPresets } from './pipeline'

const raw = openRawDatabase()
runMigrations(raw)
const db = wrapDatabase(raw)

await runAllPresets(db)
console.log('Scrape finished.')
process.exit(0)
