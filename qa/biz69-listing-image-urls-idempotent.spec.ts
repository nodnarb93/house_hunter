import Database from 'better-sqlite3'
import { unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { runMigrations } from '../server/db/migrate'

test.describe('BIZ-69 listing_image_urls UNIQUE constraint', () => {
  test('duplicate (listing_id, url) insert fails at SQLite layer', () => {
    const tmp = path.join(
      os.tmpdir(),
      `hh-biz69-uniq-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
    )
    const db = new Database(tmp)
    try {
      runMigrations(db)
      db.prepare('INSERT INTO listings (title, link) VALUES (?, ?)').run('t', 'https://example.com/a')
      const row = db.prepare('SELECT id FROM listings LIMIT 1').get() as { id: number }
      db.prepare('INSERT INTO listing_image_urls (listing_id, url) VALUES (?, ?)').run(row.id, 'https://img.example/u')

      let caught: unknown
      try {
        db.prepare('INSERT INTO listing_image_urls (listing_id, url) VALUES (?, ?)').run(row.id, 'https://img.example/u')
      } catch (e) {
        caught = e
      }

      expect(caught).toBeInstanceOf(Error)
      const err = caught as Error & { code?: string }
      const blob = `${err.message} ${String(err.code ?? '')}`.toUpperCase()
      expect(blob.includes('UNIQUE') || blob.includes('SQLITE_CONSTRAINT_UNIQUE')).toBeTruthy()
    } finally {
      db.close()
      unlinkSync(tmp)
    }
  })
})
