import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import Database from 'better-sqlite3'
import { wrapDatabase } from '../server/db/app-database'
import { runMigrations } from '../server/db/migrate'
import { runScraperSource, type ScraperScheduleRow } from '../server/scheduler'
import { RedfinSource } from '../server/scrapers/redfinSource'
import { RssSource } from '../server/scrapers/rssSource'
import { createDefaultSources, setSources } from '../server/scrapers/sourceRegistry'

const repoRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '..')

function openMigratedDb(): { raw: InstanceType<typeof Database>; db: ReturnType<typeof wrapDatabase> } {
  const raw = new Database(':memory:')
  runMigrations(raw, path.join(repoRoot, 'migrations'))
  return { raw, db: wrapDatabase(raw) }
}

function minimalGisCsvRow(link: string, mls: string, address = '1 Test St'): string {
  return `"${address}","Columbus","OH","43215","$100,000",2,1.0,"House","${mls}","${link}"`
}

function buildGisCsv(rows: string[]): string {
  const header =
    'ADDRESS,CITY,STATE OR PROVINCE,ZIP OR POSTAL CODE,PRICE,BEDS,BATHS,PROPERTY TYPE,MLS#,URL'
  return [header, ...rows].join('\n')
}

test.afterEach(() => {
  setSources(createDefaultSources())
})

test.describe('BIZ-137 scrape-time Redfin images', () => {
  test('re-scrape hydrates images for duplicate-link rows that stayed imageless', async () => {
    const { raw, db } = openMigratedDb()
    try {
      const params = { region_id: 4664, region_type: 6, market: 'columbus' }
      raw
        .prepare(`INSERT INTO scraper_sources (kind, url, config_json) VALUES ('redfin', ?, ?)`)
        .run('https://www.redfin.com/city/4664/OH/Columbus', JSON.stringify(params))
      const scraperId = (raw.prepare('SELECT id FROM scraper_sources LIMIT 1').get() as { id: number }).id

      const link = 'https://www.redfin.com/OH/Columbus/home/biz137-dup-test'
      const mls = '226015925'
      const expectedCdn = `https://ssl.cdn-redfin.com/photo/160/bigphoto/925/${mls}_0.jpg`

      raw
        .prepare(
          `INSERT INTO listings (title, link, price_cents, address, beds, baths, preset_id, mls_number, scraper_id, scraped_at)
           VALUES ('seed', ?, 10000, 'x', 2, 1.0, NULL, ?, ?, datetime('now'))`,
        )
        .run(link, mls, scraperId)

      const listingId = (raw.prepare('SELECT id FROM listings WHERE link = ?').get(link) as { id: number }).id

      const fixtureCsv = buildGisCsv([minimalGisCsvRow(link, mls)])

      const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (u.includes('/stingray/api/gis-csv')) {
          return new Response(fixtureCsv, {
            status: 200,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          })
        }
        const method = init?.method ?? 'GET'
        if (method === 'HEAD' && u === expectedCdn) {
          return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } })
        }
        return new Response(`unexpected ${method} ${u}`, { status: 599 })
      }) as typeof fetch

      const prev = globalThis.fetch
      globalThis.fetch = fakeFetch
      setSources([new RedfinSource(fakeFetch), new RssSource()])
      try {
        const row = raw.prepare('SELECT * FROM scraper_sources WHERE id = ?').get(scraperId) as ScraperScheduleRow
        await runScraperSource(db, row)
      } finally {
        globalThis.fetch = prev
      }

      const cnt = raw
        .prepare('SELECT COUNT(*) AS c FROM listing_image_urls WHERE listing_id = ?')
        .get(listingId) as { c: number }
      expect(cnt.c).toBeGreaterThan(0)
    } finally {
      raw.close()
    }
  })

  test('one listing image failure does not abort the rest of the Redfin batch', async () => {
    const { raw, db } = openMigratedDb()
    try {
      const params = { region_id: 4664, region_type: 6, market: 'columbus' }
      raw
        .prepare(`INSERT INTO scraper_sources (kind, url, config_json) VALUES ('redfin', ?, ?)`)
        .run('https://www.redfin.com/city/4664/OH/Columbus', JSON.stringify(params))
      const scraperId = (raw.prepare('SELECT id FROM scraper_sources LIMIT 1').get() as { id: number }).id

      const linkA = 'https://www.redfin.com/OH/Columbus/home/biz137-throw-a'
      const linkB = 'https://www.redfin.com/OH/Columbus/home/biz137-ok-b'
      const mlsA = '226015924'
      const mlsB = '226015925'
      const badCdn = `https://ssl.cdn-redfin.com/photo/160/bigphoto/924/${mlsA}_0.jpg`
      const goodCdn = `https://ssl.cdn-redfin.com/photo/160/bigphoto/925/${mlsB}_0.jpg`

      const fixtureCsv = buildGisCsv([
        minimalGisCsvRow(linkA, mlsA, '1 Throw St'),
        minimalGisCsvRow(linkB, mlsB, '2 Good St'),
      ])

      const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (u.includes('/stingray/api/gis-csv')) {
          return new Response(fixtureCsv, {
            status: 200,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          })
        }
        const method = init?.method ?? 'GET'
        if (method === 'HEAD' && u === badCdn) {
          throw new Error('simulated CDN failure')
        }
        if (method === 'HEAD' && u === goodCdn) {
          return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } })
        }
        return new Response(`unexpected ${method} ${u}`, { status: 599 })
      }) as typeof fetch

      const prev = globalThis.fetch
      globalThis.fetch = fakeFetch
      setSources([new RedfinSource(fakeFetch), new RssSource()])
      try {
        const row = raw.prepare('SELECT * FROM scraper_sources WHERE id = ?').get(scraperId) as ScraperScheduleRow
        await runScraperSource(db, row)
      } finally {
        globalThis.fetch = prev
      }

      const idB = (raw.prepare('SELECT id FROM listings WHERE link = ?').get(linkB) as { id: number }).id
      const cntB = raw
        .prepare('SELECT COUNT(*) AS c FROM listing_image_urls WHERE listing_id = ?')
        .get(idB) as { c: number }
      expect(cntB.c).toBeGreaterThan(0)

      const idA = (raw.prepare('SELECT id FROM listings WHERE link = ?').get(linkA) as { id: number }).id
      const cntA = raw
        .prepare('SELECT COUNT(*) AS c FROM listing_image_urls WHERE listing_id = ?')
        .get(idA) as { c: number }
      expect(cntA.c).toBe(0)
    } finally {
      raw.close()
    }
  })
})
