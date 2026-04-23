import fs from 'node:fs'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import type { RawSqliteDatabase } from './app-database'

const DEFAULT_PATH = path.join('data', 'house_hunter.sqlite')

export function resolveDatabasePath(): string {
  const override = process.env.DATABASE_PATH?.trim()
  if (override) return path.resolve(override)
  return path.resolve(process.cwd(), DEFAULT_PATH)
}

export function openRawDatabase(): RawSqliteDatabase {
  const filePath = resolveDatabasePath()
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  return new BetterSqlite3(filePath)
}
