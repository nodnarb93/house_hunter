import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import Database from 'better-sqlite3'
import { runMigrations } from '../server/db/migrate'
import { wrapDatabase } from '../server/db/app-database'
import { runBiz140Rehydrate } from '../scripts/biz140-rehydrate-no-mls-redfin'

const repoRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '..')

const REPORT_KEYS = [
  'totalCandidates',
  'succeeded',
  'failed',
  'skippedWaf',
  'mlsBackfilled',
  'ranAt',
] as const

function seedRedfinListingWithoutImages(raw: Database.Database, mls: string | null): number {
  raw.prepare(`INSERT INTO house_hunts (name) VALUES ('h')`).run()
  raw
    .prepare(`INSERT INTO scraper_sources (kind, url, config_json) VALUES ('redfin', ?, '{}')`)
    .run('https://www.redfin.com/zip/43215')
  const scraperId = (raw.prepare('SELECT id FROM scraper_sources LIMIT 1').get() as { id: number }).id

  const link = 'https://www.redfin.com/OH/Columbus/1470-London-Dr-43221/home/79580551'
  raw
    .prepare(
      `INSERT INTO listings (title, link, price_cents, address, beds, baths, preset_id, mls_number, scraper_id)
       VALUES ('t', ?, 1, 'x', 2, 1, NULL, ?, ?)`,
    )
    .run(link, mls, scraperId)

  return (raw.prepare('SELECT id FROM listings LIMIT 1').get() as { id: number }).id
}

test('BIZ-140 hydrates MLS-null imageless Redfin listing via HTML extractor', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biz140-'))
  const dbPath = path.join(tmpDir, 't.sqlite')
  const raw = new Database(dbPath)
  runMigrations(raw, path.join(repoRoot, 'migrations'))

  const listingId = seedRedfinListingWithoutImages(raw, null)
  raw.close()

  const fixtureHtml = `<!DOCTYPE html><html><head>
<meta property="og:image" content="https://ssl.cdn-redfin.com/photo/1/og/test/primary.jpg">
</head><body>
<script type="application/json">{"photoUrl":"https://ssl.cdn-redfin.com/photo/1/bigphoto/test/second.jpg"}</script>
</body></html>`

  const raw2 = new Database(dbPath)
  const db = wrapDatabase(raw2)
  try {
    const fetchImpl = async () =>
      new Response(fixtureHtml, { status: 200, headers: { 'Content-Type': 'text/html' } })

    const report = await runBiz140Rehydrate(db, {
      fetchImpl,
      skipNetwork: false,
    })

    for (const k of REPORT_KEYS) {
      expect(report).toHaveProperty(k)
    }
    expect(report.totalCandidates).toBe(1)
    expect(report.succeeded).toBe(1)
    expect(report.failed).toBe(0)
    expect(report.skippedWaf).toBe(0)

    const n = raw2
      .prepare('SELECT COUNT(*) AS c FROM listing_image_urls WHERE listing_id = ?')
      .get(listingId) as { c: number }
    expect(n.c).toBeGreaterThanOrEqual(1)
  } finally {
    raw2.close()
  }
})

test('BIZ-140 WAF challenge body is skipped, not failed', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biz140-waf-'))
  const dbPath = path.join(tmpDir, 't.sqlite')
  const raw = new Database(dbPath)
  runMigrations(raw, path.join(repoRoot, 'migrations'))

  const listingId = seedRedfinListingWithoutImages(raw, null)
  raw.close()

  const wafHtml = `<html><head></head><body><script>AwsWafIntegration.getToken()</script></body></html>`

  const raw2 = new Database(dbPath)
  const db = wrapDatabase(raw2)
  try {
    const fetchImpl = async () =>
      new Response(wafHtml, { status: 200, headers: { 'Content-Type': 'text/html' } })

    const report = await runBiz140Rehydrate(db, {
      fetchImpl,
      skipNetwork: false,
    })

    expect(report.succeeded).toBe(0)
    expect(report.skippedWaf).toBe(1)
    expect(report.failed).toBe(0)

    const n = raw2
      .prepare('SELECT COUNT(*) AS c FROM listing_image_urls WHERE listing_id = ?')
      .get(listingId) as { c: number }
    expect(n.c).toBe(0)
  } finally {
    raw2.close()
  }
})

test('BIZ-140 skipNetwork counts candidates without network or writes', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biz140-skip-'))
  const dbPath = path.join(tmpDir, 't.sqlite')
  const raw = new Database(dbPath)
  runMigrations(raw, path.join(repoRoot, 'migrations'))

  seedRedfinListingWithoutImages(raw, null)
  raw.close()

  const raw2 = new Database(dbPath)
  const db = wrapDatabase(raw2)
  try {
    const report = await runBiz140Rehydrate(db, {
      fetchImpl: globalThis.fetch,
      skipNetwork: true,
    })

    for (const k of REPORT_KEYS) {
      expect(report).toHaveProperty(k)
    }
    expect(report.totalCandidates).toBe(1)
    expect(report.succeeded).toBe(0)
    expect(report.failed).toBe(0)
    expect(report.skippedWaf).toBe(0)
  } finally {
    raw2.close()
  }
})
