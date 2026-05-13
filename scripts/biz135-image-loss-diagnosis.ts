/**
 * BIZ-135: Read-only SQLite diagnostics for hunt-visible listings that lack
 * `listing_image_urls` rows (dashboard gallery uses that table, not `listings.image_url`).
 *
 * Emits a single JSON report to stdout. Opens the DB with better-sqlite3 in readonly mode;
 * does not write or migrate.
 *
 * Run: npm run diag:biz135
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { resolveDatabasePath } from '../server/db/open-database'

export interface Biz135Report {
  totalListings: number
  listingsWithImages: number
  listingsImageless: number
  imagelessByPresetSource: { presetNull: number; presetSet: number }
  imagelessByScraperKind: { rss: number; redfin: number; other: number }
  imagelessByRecency: { last24h: number; last7d: number; older: number }
  perHunt: Array<{
    huntId: number
    huntName: string
    totalResults: number
    imagelessResults: number
    pctImageless: number
  }>
  imagelessSamplesPresetNull: Array<{
    id: number
    title: string
    link: string
    scraperId: number
    scrapedAt: string | null
  }>
  imagelessSamplesPresetSet: Array<{
    id: number
    title: string
    link: string
    presetId: number
    scraperId: number
    scrapedAt: string | null
  }>
  ranAt: string
}

function pct(n: number, d: number): number {
  if (d === 0) return 0
  return Math.round((10000 * n) / d) / 100
}

export function runBiz135Diagnosis(db: Database.Database): Biz135Report {
  const totalListings = db.prepare('SELECT COUNT(*) AS c FROM listings').get() as { c: number }
  const listingsWithImages = db
    .prepare('SELECT COUNT(DISTINCT listing_id) AS c FROM listing_image_urls')
    .get() as { c: number }

  const tw = listingsWithImages.c
  const tt = totalListings.c
  const listingsImageless = Math.max(0, tt - tw)

  const byPreset = db
    .prepare(
      `SELECT
         SUM(CASE WHEN l.preset_id IS NULL THEN 1 ELSE 0 END) AS presetNull,
         SUM(CASE WHEN l.preset_id IS NOT NULL THEN 1 ELSE 0 END) AS presetSet
       FROM listings l
       LEFT JOIN listing_image_urls liu ON liu.listing_id = l.id
       WHERE liu.listing_id IS NULL`,
    )
    .get() as { presetNull: number | null; presetSet: number | null }

  const byKind = db
    .prepare(
      `SELECT
         SUM(CASE WHEN s.kind = 'rss' THEN 1 ELSE 0 END) AS rss,
         SUM(CASE WHEN s.kind = 'redfin' THEN 1 ELSE 0 END) AS redfin,
         SUM(CASE WHEN s.kind IS NOT NULL AND s.kind NOT IN ('rss', 'redfin') THEN 1 ELSE 0 END) AS otherNull,
         SUM(CASE WHEN s.kind IS NULL THEN 1 ELSE 0 END) AS kindNull
       FROM listings l
       LEFT JOIN listing_image_urls liu ON liu.listing_id = l.id
       INNER JOIN scraper_sources s ON s.id = l.scraper_id
       WHERE liu.listing_id IS NULL`,
    )
    .get() as { rss: number | null; redfin: number | null; otherNull: number | null; kindNull: number | null }

  const byRecency = db
    .prepare(
      `SELECT
         SUM(CASE
               WHEN l.scraped_at IS NOT NULL
                 AND datetime(l.scraped_at) >= datetime('now', '-1 day')
               THEN 1 ELSE 0
             END) AS last24h,
         SUM(CASE
               WHEN l.scraped_at IS NOT NULL
                 AND datetime(l.scraped_at) < datetime('now', '-1 day')
                 AND datetime(l.scraped_at) >= datetime('now', '-7 day')
               THEN 1 ELSE 0
             END) AS last7d,
         SUM(CASE
               WHEN l.scraped_at IS NULL
                 OR datetime(l.scraped_at) < datetime('now', '-7 day')
               THEN 1 ELSE 0
             END) AS older
       FROM listings l
       LEFT JOIN listing_image_urls liu ON liu.listing_id = l.id
       WHERE liu.listing_id IS NULL`,
    )
    .get() as { last24h: number | null; last7d: number | null; older: number | null }

  const hunts = db
    .prepare('SELECT id, name FROM house_hunts ORDER BY id')
    .all() as Array<{ id: number; name: string }>

  const totalForHunt = db.prepare(
    `SELECT COUNT(*) AS c
     FROM listings l
     INNER JOIN house_hunt_scrapers hhs
       ON hhs.scraper_id = l.scraper_id AND hhs.hunt_id = ?`,
  )
  const imagelessForHunt = db.prepare(
    `SELECT COUNT(*) AS c
     FROM listings l
     INNER JOIN house_hunt_scrapers hhs
       ON hhs.scraper_id = l.scraper_id AND hhs.hunt_id = ?
     LEFT JOIN listing_image_urls liu ON liu.listing_id = l.id
     WHERE liu.listing_id IS NULL`,
  )

  const perHunt = hunts.map((h) => {
    const t = (totalForHunt.get(h.id) as { c: number }).c
    const i = (imagelessForHunt.get(h.id) as { c: number }).c
    return {
      huntId: h.id,
      huntName: h.name,
      totalResults: t,
      imagelessResults: i,
      pctImageless: pct(i, t),
    }
  })

  const imagelessSamplesPresetNull = db
    .prepare(
      `SELECT l.id, l.title, l.link, l.scraper_id AS scraperId, l.scraped_at AS scrapedAt
       FROM listings l
       LEFT JOIN listing_image_urls liu ON liu.listing_id = l.id
       WHERE liu.listing_id IS NULL AND l.preset_id IS NULL
       ORDER BY l.id
       LIMIT 5`,
    )
    .all() as Biz135Report['imagelessSamplesPresetNull']

  const imagelessSamplesPresetSet = db
    .prepare(
      `SELECT l.id, l.title, l.link, l.preset_id AS presetId, l.scraper_id AS scraperId, l.scraped_at AS scrapedAt
       FROM listings l
       LEFT JOIN listing_image_urls liu ON liu.listing_id = l.id
       WHERE liu.listing_id IS NULL AND l.preset_id IS NOT NULL
       ORDER BY l.id
       LIMIT 5`,
    )
    .all() as Biz135Report['imagelessSamplesPresetSet']

  const other =
    (byKind.otherNull ?? 0) + (byKind.kindNull ?? 0)

  return {
    totalListings: tt,
    listingsWithImages: tw,
    listingsImageless,
    imagelessByPresetSource: {
      presetNull: byPreset.presetNull ?? 0,
      presetSet: byPreset.presetSet ?? 0,
    },
    imagelessByScraperKind: {
      rss: byKind.rss ?? 0,
      redfin: byKind.redfin ?? 0,
      other,
    },
    imagelessByRecency: {
      last24h: byRecency.last24h ?? 0,
      last7d: byRecency.last7d ?? 0,
      older: byRecency.older ?? 0,
    },
    perHunt,
    imagelessSamplesPresetNull,
    imagelessSamplesPresetSet,
    ranAt: new Date().toISOString(),
  }
}

function isCliMain(): boolean {
  const a = process.argv[1]
  if (!a) return false
  try {
    return import.meta.url === pathToFileURL(path.resolve(a)).href
  } catch {
    return false
  }
}

function cliMain(): void {
  const dbPath = resolveDatabasePath()
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at ${dbPath} (set DATABASE_PATH to override)`)
    process.exit(1)
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const report = runBiz135Diagnosis(db)
    console.log(JSON.stringify(report, null, 2))
  } finally {
    db.close()
  }
}

if (isCliMain()) {
  try {
    cliMain()
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
