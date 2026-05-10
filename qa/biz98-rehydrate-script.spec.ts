import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import Database from 'better-sqlite3'
import {
  biz98BackfillMlsFromActiveRedfinSources,
  biz98DeletePollutedListingImages,
  runBiz98Rehydrate,
  yyyymmdd,
} from '../scripts/biz98-rehydrate-redfin-photos'
import { wrapDatabase } from '../server/db/app-database'
import { runMigrations } from '../server/db/migrate'
import { runImageBackfillForListings } from '../server/listingImageBackfill'
import { parseRedfinCsvListings } from '../server/scrapers/redfinAdapter'
import { RedfinSource } from '../server/scrapers/redfinSource'
import { RssSource } from '../server/scrapers/rssSource'
import { createDefaultSources, setSources } from '../server/scrapers/sourceRegistry'

const repoRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '..')

function openMigratedDb(): { raw: InstanceType<typeof Database>; db: ReturnType<typeof wrapDatabase> } {
  const raw = new Database(':memory:')
  runMigrations(raw, path.join(repoRoot, 'migrations'))
  return { raw, db: wrapDatabase(raw) }
}

function createBiz98TestFetch(fixtureCsv: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('/stingray/api/gis-csv')) {
      return new Response(fixtureCsv, {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }
    const method = init?.method ?? 'GET'
    if (method === 'HEAD' && url.includes('ssl.cdn-redfin.com')) {
      return new Response(null, {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })
    }
    if (method === 'GET' && url.includes('ssl.cdn-redfin.com')) {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })
    }
    return new Response(`unexpected fetch ${url}`, { status: 599 })
  }
}

test.afterEach(() => {
  setSources(createDefaultSources())
})

test.describe('BIZ-98 rehydrate script', () => {
  test('cleanup deletes only fixture rows', async () => {
    const { raw, db } = openMigratedDb()
    try {
      raw
        .prepare(
          `INSERT INTO listings (title, link, price_cents, address, beds, baths, preset_id)
           VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        )
        .run('L', 'https://www.redfin.com/OH/foo/home/1', 1, 'a', 2, 1)
      const listingId = (raw.prepare('SELECT id FROM listings LIMIT 1').get() as { id: number }).id

      const fixtureUrl = 'https://ssl.cdn-redfin.com/photo/1/mbphotowidth/79708871_0.jpg'
      const realUrl = 'https://ssl.cdn-redfin.com/photo/160/bigphoto/925/226015925_0.jpg'
      raw
        .prepare(
          `INSERT INTO listing_image_urls (listing_id, url, display_order) VALUES (?, ?, 0), (?, ?, 1)`,
        )
        .run(listingId, fixtureUrl, listingId, realUrl)

      const deleted = await biz98DeletePollutedListingImages(db)
      expect(deleted).toBe(1)

      const rows = raw
        .prepare('SELECT url FROM listing_image_urls ORDER BY display_order ASC')
        .all() as { url: string }[]
      expect(rows).toHaveLength(1)
      expect(rows[0].url).toBe(realUrl)
    } finally {
      raw.close()
    }
  })

  test('MLS# parse from captured gis-csv body', () => {
    const csvPath = path.join(
      repoRoot,
      'qa/captures/redfin-giscsv-investigation-20260508/body.csv',
    )
    const csvText = fs.readFileSync(csvPath, 'utf8')
    const parsed = parseRedfinCsvListings(csvText)
    const byLink = new Map(parsed.map((r) => [r.link, r.mls_number]))

    const expectations: Array<[string, string]> = [
      [
        'https://www.redfin.com/OH/Columbus/1380-Stanwix-Ct-43223/home/79708871',
        '226013015',
      ],
      [
        'https://www.redfin.com/OH/Dublin/6841-Riverside-Glen-Ct-43017/home/100777905',
        '226012189',
      ],
      [
        'https://www.redfin.com/OH/Columbus/1190-N-Grant-Ave-43201/unit-A/home/169640058',
        '226010487',
      ],
      [
        'https://www.redfin.com/OH/Columbus/1230-Gilbert-St-43206/unit-2/home/200741702',
        '226005936',
      ],
      [
        'https://www.redfin.com/OH/Columbus/5644-Linworth-Rd-43235/home/79577150',
        '226004191',
      ],
    ]

    for (const [link, mls] of expectations) {
      expect(byLink.get(link)).toBe(mls)
    }
  })

  test('MLS update step is targeted and idempotent', async () => {
    const fixtureCsv = fs.readFileSync(
      path.join(repoRoot, 'qa/captures/redfin-giscsv-investigation-20260508/body.csv'),
      'utf8',
    )
    const { raw, db } = openMigratedDb()
    try {
      raw.prepare(`INSERT INTO house_hunts (name) VALUES ('h1')`).run()
      const huntId = (raw.prepare('SELECT id FROM house_hunts LIMIT 1').get() as { id: number }).id

      const params = {
        region_id: 43215,
        region_type: 2,
        market: 'zip-43215',
        num_homes: 350,
        page_number: 1,
        status: 9,
        v: 8,
      }
      raw
        .prepare(
          `INSERT INTO scraper_sources (kind, url, config_json) VALUES ('redfin', ?, ?)`,
        )
        .run('https://www.redfin.com/zip/43215', JSON.stringify(params))
      const scraperId = (raw.prepare('SELECT id FROM scraper_sources LIMIT 1').get() as { id: number })
        .id
      raw
        .prepare(`INSERT INTO house_hunt_scrapers (hunt_id, scraper_id) VALUES (?, ?)`)
        .run(huntId, scraperId)

      const linkNeedsUpdate =
        'https://www.redfin.com/OH/Columbus/3583-Dresden-St-43224/home/75629611'
      const linkAlreadyOk =
        'https://www.redfin.com/OH/Columbus/1380-Stanwix-Ct-43223/home/79708871'
      const linkNotInCsv = 'https://example.com/rss/item-not-in-csv'

      raw
        .prepare(
          `INSERT INTO listings (title, link, price_cents, address, beds, baths, preset_id, mls_number)
           VALUES (?, ?, 1, 'a', 2, 1, NULL, NULL),
                  (?, ?, 1, 'b', 2, 1, NULL, ?),
                  (?, ?, 1, 'c', 2, 1, NULL, NULL)`,
        )
        .run('a', linkNeedsUpdate, 'b', linkAlreadyOk, '226013015', 'c', linkNotInCsv)

      const fetchImpl = createBiz98TestFetch(fixtureCsv)

      const first = await biz98BackfillMlsFromActiveRedfinSources(db, fetchImpl, () => {})
      expect(first).toBe(1)

      const rows = raw
        .prepare('SELECT link, mls_number FROM listings ORDER BY title ASC')
        .all() as { link: string; mls_number: string | null }[]

      const need = rows.find((r) => r.link === linkNeedsUpdate)
      const ok = rows.find((r) => r.link === linkAlreadyOk)
      const rss = rows.find((r) => r.link === linkNotInCsv)
      expect(need?.mls_number).toBe('226015925')
      expect(ok?.mls_number).toBe('226013015')
      expect(rss?.mls_number).toBeNull()

      const second = await biz98BackfillMlsFromActiveRedfinSources(db, fetchImpl, () => {})
      expect(second).toBe(0)
    } finally {
      raw.close()
    }
  })

  test('image backfill helper preserves API behavior', async () => {
    const { raw, db } = openMigratedDb()
    try {
      const link = 'https://www.redfin.com/OH/Columbus/3583-Dresden-St-43224/home/75629611'
      raw
        .prepare(
          `INSERT INTO listings (title, link, price_cents, address, beds, baths, preset_id, mls_number)
           VALUES (?, ?, 1, 'addr', 3, 2, NULL, ?)`,
        )
        .run('biz98-img', link, '226015925')

      const fakeFetch: typeof fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        const method = init?.method ?? 'GET'
        if (method === 'HEAD' && url.includes('ssl.cdn-redfin.com')) {
          return new Response(null, {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          })
        }
        return new Response('nope', { status: 404 })
      }

      setSources([new RedfinSource(fakeFetch), new RssSource()])

      const out = await runImageBackfillForListings(db, { logger: () => {} })
      expect(out).toEqual({ queued: 1, succeeded: 1, failed: 0 })

      const listingId = (raw.prepare('SELECT id FROM listings WHERE link = ?').get(link) as { id: number })
        .id
      const cnt = raw
        .prepare('SELECT COUNT(*) as c FROM listing_image_urls WHERE listing_id = ?')
        .get(listingId) as { c: number }
      expect(cnt.c).toBe(1)
    } finally {
      raw.close()
    }
  })

  test('script idempotent end-to-end; Redfin-only scope for MLS and images', async () => {
    const fixtureCsv = fs.readFileSync(
      path.join(repoRoot, 'qa/captures/redfin-giscsv-investigation-20260508/body.csv'),
      'utf8',
    )
    const fetchImpl = createBiz98TestFetch(fixtureCsv)

    const { raw, db } = openMigratedDb()
    try {
      raw.prepare(`INSERT INTO house_hunts (name) VALUES ('h1')`).run()
      const huntId = (raw.prepare('SELECT id FROM house_hunts LIMIT 1').get() as { id: number }).id

      const params = {
        region_id: 43215,
        region_type: 2,
        market: 'zip-43215',
        num_homes: 350,
        page_number: 1,
        status: 9,
        v: 8,
      }
      raw
        .prepare(
          `INSERT INTO scraper_sources (kind, url, config_json) VALUES ('redfin', ?, ?)`,
        )
        .run('https://www.redfin.com/zip/43215', JSON.stringify(params))
      const scraperId = (raw.prepare('SELECT id FROM scraper_sources LIMIT 1').get() as { id: number })
        .id
      raw
        .prepare(`INSERT INTO house_hunt_scrapers (hunt_id, scraper_id) VALUES (?, ?)`)
        .run(huntId, scraperId)

      const redfinLink =
        'https://www.redfin.com/OH/Columbus/3583-Dresden-St-43224/home/75629611'
      const pollutedUrl = 'https://ssl.cdn-redfin.com/photo/1/mbphotowidth/79708871_0.jpg'

      raw
        .prepare(
          `INSERT INTO listings (title, link, price_cents, address, beds, baths, preset_id, mls_number)
           VALUES (?, ?, 1, 'r', 3, 2, NULL, NULL),
                  (?, ?, 1, 'x', 1, 1, NULL, NULL)`,
        )
        .run('redfin seed', redfinLink, 'rss seed', 'https://example.com/rss-only-item')

      const redfinId = (raw.prepare('SELECT id FROM listings WHERE link = ?').get(redfinLink) as {
        id: number
      }).id
      raw
        .prepare(`INSERT INTO listing_image_urls (listing_id, url, display_order) VALUES (?, ?, 0)`)
        .run(redfinId, pollutedUrl)

      setSources([new RedfinSource(fetchImpl), new RssSource()])

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biz98-e2e-'))

      const run1 = await runBiz98Rehydrate(db, { fetchImpl, reportDir: tmpDir })
      expect(run1.polluted_rows_deleted).toBeGreaterThanOrEqual(1)
      expect(run1.mls_backfilled).toBeGreaterThanOrEqual(1)
      expect(run1.image_fetches_succeeded).toBeGreaterThanOrEqual(1)

      const run2 = await runBiz98Rehydrate(db, { fetchImpl, reportDir: tmpDir })
      expect(run2.polluted_rows_deleted).toBe(0)
      expect(run2.mls_backfilled).toBe(0)
      expect(run2.image_fetches_succeeded).toBe(0)
      expect(run2.image_fetches_failed).toBe(0)
      expect(run2.redfin_listings_skipped_no_mls).toBe(run1.redfin_listings_skipped_no_mls)
      expect(run2.non_redfin_listings_skipped).toBe(run1.non_redfin_listings_skipped)

      const rssRow = raw
        .prepare(`SELECT mls_number FROM listings WHERE link = ?`)
        .get('https://example.com/rss-only-item') as { mls_number: string | null }
      expect(rssRow.mls_number).toBeNull()

      const rssId = (raw
        .prepare(`SELECT id FROM listings WHERE link = ?`)
        .get('https://example.com/rss-only-item') as { id: number }).id
      const rssImgCount = raw
        .prepare(`SELECT COUNT(*) as c FROM listing_image_urls WHERE listing_id = ?`)
        .get(rssId) as { c: number }
      expect(rssImgCount.c).toBe(0)
    } finally {
      raw.close()
    }
  })

  test('script writes structured JSON report with all six counts', async () => {
    const { raw, db } = openMigratedDb()
    try {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biz98-report-'))
      await runBiz98Rehydrate(db, {
        fetchImpl: async () => new Response('', { status: 500 }),
        reportDir: tmpDir,
      })
      const reportPath = path.join(tmpDir, 'script-report.json')
      const rawJson = fs.readFileSync(reportPath, 'utf8')
      const body = JSON.parse(rawJson) as Record<string, unknown>
      expect(typeof body.polluted_rows_deleted).toBe('number')
      expect(typeof body.mls_backfilled).toBe('number')
      expect(typeof body.image_fetches_succeeded).toBe('number')
      expect(typeof body.image_fetches_failed).toBe('number')
      expect(typeof body.redfin_listings_skipped_no_mls).toBe('number')
      expect(typeof body.non_redfin_listings_skipped).toBe('number')
      expect(typeof body.ranAt).toBe('string')
    } finally {
      raw.close()
    }
  })

  test('yyyymmdd helper formats local calendar date', () => {
    const d = new Date(2026, 4, 9)
    expect(yyyymmdd(d)).toBe('20260509')
  })
})
