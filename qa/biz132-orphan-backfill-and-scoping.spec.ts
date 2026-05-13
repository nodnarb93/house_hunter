import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type APIRequestContext } from '@playwright/test'
import Database from 'better-sqlite3'
import { runMigrations } from '../server/db/migrate'

const repoRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '..')

function openMigratedDbThrough0012Then0013(seedBefore0013: (db: Database.Database) => void): Database.Database {
  const migs = path.join(repoRoot, 'migrations')
  const names = fs.readdirSync(migs).filter((f) => f.endsWith('.sql')).sort()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'biz132-mig-'))
  try {
    for (const name of names) {
      if (name.startsWith('0013_')) break
      fs.copyFileSync(path.join(migs, name), path.join(tmp, name))
    }
    const raw = new Database(':memory:')
    runMigrations(raw, tmp)
    seedBefore0013(raw)
    fs.copyFileSync(path.join(migs, '0013_backfill_listings_scraper_id.sql'), path.join(tmp, '0013_backfill_listings_scraper_id.sql'))
    runMigrations(raw, tmp)
    return raw
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

test('0013 migration: backfill orphans, diagnostics, NOT NULL', () => {
  const raw = openMigratedDbThrough0012Then0013((db) => {
    db.prepare(
      `INSERT INTO scraper_sources (kind, url, config_json) VALUES ('redfin', 'https://www.redfin.com/zip/43215', '{}')`,
    ).run()
    db.prepare(`INSERT INTO scraper_sources (kind, url, config_json) VALUES ('rss', 'https://example.invalid/feed.xml', NULL)`).run()
    db.prepare(
      `INSERT INTO listings (title, link, scraper_id) VALUES ('orph rf', 'https://www.redfin.com/OH/test/home/1', NULL)`,
    ).run()
    db.prepare(
      `INSERT INTO listings (title, link, scraper_id) VALUES ('orph rss', 'https://example.invalid/item-2', NULL)`,
    ).run()
  })
  try {
    const before = raw
      .prepare(
        `SELECT value FROM migration_diagnostics WHERE migration = ? AND metric = 'orphans_before'`,
      )
      .get('0013_backfill_listings_scraper_id') as { value: number } | undefined
    expect(before?.value).toBe(2)

    const nulls = raw.prepare(`SELECT COUNT(*) as c FROM listings WHERE scraper_id IS NULL`).get() as { c: number }
    expect(nulls.c).toBe(0)

    const ins = raw.prepare(`INSERT INTO listings (title, link, scraper_id) VALUES ('bad', 'https://example.invalid/bad-null', NULL)`)
    expect(() => ins.run()).toThrow(/NOT NULL/)
  } finally {
    raw.close()
  }
})

async function createRssScraper(request: APIRequestContext, suffix: string) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/feed-${suffix}-${Date.now()}.xml` },
  })
  expect(res.status()).toBe(201)
  return (await res.json()) as { id: number }
}

test('GET hunt results: rows include scraper_id scoped to attached scraper', async ({ request }) => {
  let huntId: number | undefined
  let scraperA: number | undefined
  let scraperB: number | undefined
  let listingA: number | undefined
  let listingB: number | undefined
  try {
    const a = await createRssScraper(request, 'biz132-a')
    const b = await createRssScraper(request, 'biz132-b')
    scraperA = a.id
    scraperB = b.id

    const post = await request.post('/api/house-hunts', { data: { name: `BIZ132 scope ${Date.now()}` } })
    expect(post.status()).toBe(201)
    huntId = ((await post.json()) as { id: number }).id

    const put = await request.put(`/api/house-hunts/${huntId}`, {
      data: { scraper_ids: [scraperA] },
    })
    expect(put.status()).toBe(200)

    const linkA = `https://example.invalid/biz132-a-${Date.now()}`
    const linkB = `https://example.invalid/biz132-b-${Date.now()}`

    const seedA = await request.post('/api/test/seed-listing', {
      data: { title: 'A row', link: linkA, scraper_id: scraperA },
    })
    const seedB = await request.post('/api/test/seed-listing', {
      data: { title: 'B row', link: linkB, scraper_id: scraperB },
    })
    expect(seedA.status()).toBe(201)
    expect(seedB.status()).toBe(201)
    listingA = ((await seedA.json()) as { id: number }).id
    listingB = ((await seedB.json()) as { id: number }).id

    const results = await request.get(`/api/house-hunts/${huntId}/results`)
    expect(results.status()).toBe(200)
    const rows = (await results.json()) as Array<{ id: number; link: string; scraper_id: number }>
    expect(rows).toHaveLength(1)
    expect(rows[0].link).toBe(linkA)
    expect(rows[0].scraper_id).toBe(scraperA)
  } finally {
    if (huntId !== undefined) await request.delete(`/api/house-hunts/${huntId}`).catch(() => {})
    if (listingA !== undefined) await request.delete(`/api/test/listings/${listingA}`).catch(() => {})
    if (listingB !== undefined) await request.delete(`/api/test/listings/${listingB}`).catch(() => {})
    if (scraperA !== undefined) await request.delete(`/api/scrapers/${scraperA}`).catch(() => {})
    if (scraperB !== undefined) await request.delete(`/api/scrapers/${scraperB}`).catch(() => {})
  }
})
