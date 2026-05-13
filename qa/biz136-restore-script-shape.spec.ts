import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import Database from 'better-sqlite3'
import { runMigrations } from '../server/db/migrate'

const repoRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '..')

function runBiz136Script(dbPath: string): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync('npx', ['tsx', 'scripts/biz136-restore-hunt-images.ts'], {
    cwd: repoRoot,
    encoding: 'utf-8',
    env: {
      ...process.env,
      DATABASE_PATH: dbPath,
      BIZ136_SKIP_NETWORK: '1',
    },
  })
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

test('BIZ-136 restore script JSON shape and idempotency (hermetic)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biz136-'))
  const dbPath = path.join(tmpDir, 't.sqlite')
  const raw = new Database(dbPath)
  runMigrations(raw, path.join(repoRoot, 'migrations'))

  raw.prepare(`INSERT INTO house_hunts (name) VALUES ('h')`).run()
  const huntId = (raw.prepare('SELECT id FROM house_hunts LIMIT 1').get() as { id: number }).id

  const params = { region_id: 43215, region_type: 2, market: 'zip-43215' }
  raw
    .prepare(`INSERT INTO scraper_sources (kind, url, config_json) VALUES ('redfin', ?, ?)`)
    .run('https://www.redfin.com/zip/43215', JSON.stringify(params))
  const scraperId = (raw.prepare('SELECT id FROM scraper_sources LIMIT 1').get() as { id: number }).id

  raw.prepare(`INSERT INTO house_hunt_scrapers (hunt_id, scraper_id) VALUES (?, ?)`).run(huntId, scraperId)

  const linkWithMls = 'https://www.redfin.com/OH/Columbus/3583-Dresden-St-43224/home/75629611'
  const linkWithoutMls = 'https://www.redfin.com/OH/Columbus/9999-No-Mls-St-43224/home/199999999'

  raw
    .prepare(
      `INSERT INTO listings (title, link, price_cents, address, beds, baths, preset_id, mls_number, scraper_id)
       VALUES ('a', ?, 1, 'x', 2, 1, NULL, '226015925', ?), ('b', ?, 1, 'y', 2, 1, NULL, NULL, ?)`,
    )
    .run(linkWithMls, scraperId, linkWithoutMls, scraperId)

  raw.close()

  const topKeys = [
    'before',
    'extractorProbe',
    'mlsBackfilled',
    'mlsBackfillSkipped',
    'imageBackfill',
    'after',
    'ranAt',
  ] as const

  const first = runBiz136Script(dbPath)
  expect(first.status, `${first.stderr}\n${first.stdout}`).toBe(0)
  const r1 = JSON.parse(first.stdout.trim()) as Record<string, unknown>
  for (const k of topKeys) {
    expect(r1).toHaveProperty(k)
  }
  expect((r1.before as { imagelessTotal: number }).imagelessTotal).toBe(2)

  const second = runBiz136Script(dbPath)
  expect(second.status, `${second.stderr}\n${second.stdout}`).toBe(0)
  const r2 = JSON.parse(second.stdout.trim()) as Record<string, unknown>
  expect((r2.before as { imagelessTotal: number }).imagelessTotal).toBe(2)
  expect(r2.mlsBackfilled).toBe(0)
  expect(r2.imageBackfill).toEqual({ queued: 0, succeeded: 0, failed: 0 })
})
