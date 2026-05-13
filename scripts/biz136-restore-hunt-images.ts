/**
 * BIZ-136 remediation: measure imageless hunt-attached Redfin listings, probe the
 * photo extractor, backfill MLS numbers from stingray gis-csv (same flow as
 * `biz98BackfillMlsFromActiveRedfinSources`), then run `runImageBackfillForListings`.
 *
 * Run: `npm run restore:biz136`
 *
 * Hermetic mode (no live Redfin / CDN): `BIZ136_SKIP_NETWORK=1` — skips Phase B
 * extractor calls, Phase C gis-csv fetches, and Phase D image backfill while still
 * emitting the full JSON report.
 */

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { wrapDatabase, type AppDatabase } from '../server/db/app-database'
import { resolveDatabasePath } from '../server/db/open-database'
import {
  buildStingrayGisCsvUrl,
  parseRedfinCsvListings,
  REDFIN_FETCH_HEADERS,
} from '../server/scrapers/redfinAdapter'
import { resolveRedfinParamsFromSource } from './biz98-rehydrate-redfin-photos'
import { findSourceForUrl } from '../server/scrapers/sourceRegistry'
import { runImageBackfillForListings } from '../server/listingImageBackfill'

const PACE_MS = 200

async function pace(): Promise<void> {
  await new Promise((r) => setTimeout(r, PACE_MS))
}

export interface Biz136PhaseA {
  totalListings: number
  imagelessTotal: number
  imagelessByMls: { mlsNull: number; mlsSet: number }
  huntAttachedRedfinImageless: number
}

export interface Biz136ProbeSide {
  listingId: number | null
  urlCount: number
  firstUrl: string | null
  error: string | null
}

export interface Biz136Report {
  before: Biz136PhaseA
  extractorProbe: { withMls: Biz136ProbeSide; withoutMls: Biz136ProbeSide }
  mlsBackfilled: number
  mlsBackfillSkipped: number
  imageBackfill: { queued: number; succeeded: number; failed: number }
  after: Biz136PhaseA
  ranAt: string
}

async function queryPhaseA(db: AppDatabase): Promise<Biz136PhaseA> {
  const totalRow = await db.prepare('SELECT COUNT(*) AS c FROM listings').first<{ c: number }>()
  const totalListings = totalRow?.c ?? 0

  const imagelessTotalRow = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM listings l
       LEFT JOIN listing_image_urls liu ON liu.listing_id = l.id
       WHERE liu.listing_id IS NULL`,
    )
    .first<{ c: number }>()
  const imagelessTotal = imagelessTotalRow?.c ?? 0

  const byMls = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN l.mls_number IS NULL OR TRIM(COALESCE(l.mls_number, '')) = '' THEN 1 ELSE 0 END) AS mlsNull,
         SUM(CASE WHEN l.mls_number IS NOT NULL AND TRIM(l.mls_number) != '' THEN 1 ELSE 0 END) AS mlsSet
       FROM listings l
       LEFT JOIN listing_image_urls liu ON liu.listing_id = l.id
       WHERE liu.listing_id IS NULL`,
    )
    .first<{ mlsNull: number | null; mlsSet: number | null }>()

  const huntRow = await db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM listings l
       INNER JOIN scraper_sources s ON s.id = l.scraper_id AND s.kind = 'redfin'
       LEFT JOIN listing_image_urls liu ON liu.listing_id = l.id
       WHERE liu.listing_id IS NULL
         AND EXISTS (SELECT 1 FROM house_hunt_scrapers hhs WHERE hhs.scraper_id = l.scraper_id)`,
    )
    .first<{ c: number }>()

  return {
    totalListings,
    imagelessTotal,
    imagelessByMls: {
      mlsNull: byMls?.mlsNull ?? 0,
      mlsSet: byMls?.mlsSet ?? 0,
    },
    huntAttachedRedfinImageless: huntRow?.c ?? 0,
  }
}

async function countMlsBackfillTargets(db: AppDatabase): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM listings l
       INNER JOIN scraper_sources s ON s.id = l.scraper_id AND s.kind = 'redfin'
       LEFT JOIN listing_image_urls liu ON liu.listing_id = l.id
       WHERE liu.listing_id IS NULL
         AND (l.mls_number IS NULL OR TRIM(COALESCE(l.mls_number, '')) = '')
         AND EXISTS (SELECT 1 FROM house_hunt_scrapers hhs WHERE hhs.scraper_id = l.scraper_id)`,
    )
    .first<{ c: number }>()
  return row?.c ?? 0
}

/** Stingray gis-csv MLS updates for hunt-linked Redfin sources; 200ms between sources. */
async function biz136BackfillMlsFromActiveRedfinSources(
  db: AppDatabase,
  fetchImpl: typeof fetch,
  log: (msg: string) => void,
): Promise<number> {
  const redfinSources = await db
    .prepare(
      `SELECT DISTINCT s.id, s.url, s.config_json
       FROM scraper_sources s
       INNER JOIN house_hunt_scrapers hs ON hs.scraper_id = s.id
       WHERE s.kind = 'redfin'`,
    )
    .all<{ id: number; url: string; config_json: string | null }>()

  const rows = redfinSources.results ?? []
  let mls_backfilled = 0
  for (let idx = 0; idx < rows.length; idx++) {
    const src = rows[idx]!
    const params = resolveRedfinParamsFromSource(src)
    if (!params) {
      log(`skip source ${src.id}: cannot parse Redfin params from ${src.url}`)
    } else {
      const gisUrl = buildStingrayGisCsvUrl(params)
      const res = await fetchImpl(gisUrl, { headers: { ...REDFIN_FETCH_HEADERS } })
      if (!res.ok) {
        log(`source ${src.id}: gis-csv ${res.status}`)
      } else {
        const text = await res.text()
        const parsed = parseRedfinCsvListings(text)
        const updateStmt = db.prepare(
          'UPDATE listings SET mls_number = ? WHERE link = ? AND (mls_number IS NULL OR mls_number != ?)',
        )
        for (const row of parsed) {
          if (row.mls_number == null) continue
          const r = await updateStmt.bind(row.mls_number, row.link, row.mls_number).run()
          mls_backfilled += r.meta.changes
        }
      }
    }
    if (idx < rows.length - 1) await pace()
  }
  return mls_backfilled
}

const SQL_IMAGELESS_WITH_MLS = `SELECT l.id, l.link, l.mls_number
  FROM listings l
  LEFT JOIN listing_image_urls liu ON liu.listing_id = l.id
  WHERE liu.listing_id IS NULL
    AND l.mls_number IS NOT NULL AND TRIM(l.mls_number) != ''
  ORDER BY l.id LIMIT 1`

const SQL_IMAGELESS_WITHOUT_MLS = `SELECT l.id, l.link, l.mls_number
  FROM listings l
  LEFT JOIN listing_image_urls liu ON liu.listing_id = l.id
  WHERE liu.listing_id IS NULL
    AND (l.mls_number IS NULL OR TRIM(COALESCE(l.mls_number, '')) = '')
  ORDER BY l.id LIMIT 1`

async function probeExtractorSide(
  db: AppDatabase,
  sql: string,
  skipNetwork: boolean,
): Promise<Biz136ProbeSide> {
  if (skipNetwork) {
    return {
      listingId: null,
      urlCount: 0,
      firstUrl: null,
      error: 'skipped (BIZ136_SKIP_NETWORK=1)',
    }
  }
  const row = await db
    .prepare(sql)
    .first<{ id: number; link: string; mls_number: string | null }>()
  if (!row) {
    return { listingId: null, urlCount: 0, firstUrl: null, error: 'no candidate listing' }
  }
  try {
    const source = findSourceForUrl(row.link)
    if (!source) {
      return {
        listingId: row.id,
        urlCount: 0,
        firstUrl: null,
        error: 'no listing source for URL',
      }
    }
    const urls = await source.extractPhotoUrls(row.link, {
      mlsNumber: row.mls_number ?? undefined,
    })
    return {
      listingId: row.id,
      urlCount: urls.length,
      firstUrl: urls[0] ?? null,
      error: null,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { listingId: row.id, urlCount: 0, firstUrl: null, error: msg }
  }
}

export async function runBiz136Restore(
  db: AppDatabase,
  deps: { fetchImpl: typeof fetch; skipNetwork: boolean; logger?: (msg: string) => void },
): Promise<Biz136Report> {
  const warn = deps.logger ?? console.warn
  const before = await queryPhaseA(db)
  await pace()

  const skip = deps.skipNetwork
  const withMls = await probeExtractorSide(db, SQL_IMAGELESS_WITH_MLS, skip)
  await pace()
  const withoutMls = await probeExtractorSide(db, SQL_IMAGELESS_WITHOUT_MLS, skip)
  await pace()

  let mlsBackfilled = 0
  let mlsBackfillSkipped: number
  if (skip) {
    mlsBackfillSkipped = await countMlsBackfillTargets(db)
  } else {
    mlsBackfilled = await biz136BackfillMlsFromActiveRedfinSources(db, deps.fetchImpl, warn)
    mlsBackfillSkipped = await countMlsBackfillTargets(db)
  }
  await pace()

  let imageBackfill = { queued: 0, succeeded: 0, failed: 0 }
  if (!skip) {
    imageBackfill = await runImageBackfillForListings(db, { logger: warn })
  }
  await pace()

  const after = await queryPhaseA(db)
  return {
    before,
    extractorProbe: { withMls, withoutMls },
    mlsBackfilled,
    mlsBackfillSkipped,
    imageBackfill,
    after,
    ranAt: new Date().toISOString(),
  }
}

async function cliMain(): Promise<void> {
  const skipNetwork = process.env.BIZ136_SKIP_NETWORK === '1'
  const raw = new Database(resolveDatabasePath())
  const db = wrapDatabase(raw)
  try {
    const report = await runBiz136Restore(db, {
      fetchImpl: globalThis.fetch,
      skipNetwork: skipNetwork,
    })
    console.log(JSON.stringify(report))
  } finally {
    raw.close()
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

if (isCliMain()) {
  cliMain().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
