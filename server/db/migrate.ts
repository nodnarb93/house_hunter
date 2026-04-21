import fs from 'node:fs'
import path from 'node:path'
import type { RawSqliteDatabase } from './d1-shim'

const LEDGER = `CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);`

export function runMigrations(db: RawSqliteDatabase, migrationsDir = path.join(process.cwd(), 'migrations')): void {
  db.exec(LEDGER)

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const rows = db.prepare('SELECT filename FROM schema_migrations').all() as { filename: string }[]
  const applied = new Set(rows.map((r) => r.filename))

  for (const filename of files) {
    if (applied.has(filename)) continue

    const fullPath = path.join(migrationsDir, filename)
    const sqlFileContents = fs.readFileSync(fullPath, 'utf8')
    const appliedAt = new Date().toISOString()

    const run = db.transaction(() => {
      db.exec(sqlFileContents)
      db.prepare('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)').run(filename, appliedAt)
    })
    run()

    console.log(`Applied migration: ${filename}`)
  }
}
