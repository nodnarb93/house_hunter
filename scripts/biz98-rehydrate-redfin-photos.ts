/**
 * BIZ-98 remediation script (BIZ-99 implementation): surgical cleanup of polluted
 * Redfin CDN URLs, MLS# backfill from stingray gis-csv for Redfin sources attached
 * to hunts, then Redfin-only image backfill via the shared helper.
 *
 * Idempotent on a clean DB:
 * - Cleanup DELETE matches no rows.
 * - MLS UPDATE uses (mls_number IS NULL OR mls_number != ?) so correct rows unchanged.
 * - Image helper skips listings that already have listing_image_urls rows.
 *
 * Run: npx tsx scripts/biz98-rehydrate-redfin-photos.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { wrapDatabase, type AppDatabase } from '../server/db/app-database'
import { resolveDatabasePath } from '../server/db/open-database'
import {
  buildStingrayGisCsvUrl,
  parseRedfinUrl,
  REDFIN_FETCH_HEADERS,
  parseRedfinCsvListings,
  type RedfinParams,
} from '../server/scrapers/redfinAdapter'
import { runImageBackfillForListings } from '../server/listingImageBackfill'

export interface Biz98Report {
  polluted_rows_deleted: number
  mls_backfilled: number
  image_fetches_succeeded: number
  image_fetches_failed: number
  redfin_listings_skipped_no_mls: number
  non_redfin_listings_skipped: number
  ranAt: string
}

export function yyyymmdd(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export function resolveRedfinParamsFromSource(src: {
  url: string
  config_json: string | null
}): RedfinParams | null {
  if (src.config_json) {
    try {
      const parsed = JSON.parse(src.config_json) as Partial<RedfinParams>
      if (
        parsed &&
        typeof parsed.region_id === 'number' &&
        typeof parsed.region_type === 'number' &&
        typeof parsed.market === 'string'
      ) {
        return parsed as RedfinParams
      }
    } catch {
      /* fall through */
    }
  }
  return parseRedfinUrl(src.url)
}

/** Deletes known fixture-pattern polluted CDN URLs (narrow LIKE). */
export async function biz98DeletePollutedListingImages(db: AppDatabase): Promise<number> {
  const del = await db
    .prepare(
      `DELETE FROM listing_image_urls WHERE url LIKE 'https://ssl.cdn-redfin.com/photo/1/mbphotowidth/79708871_%'`,
    )
    .run()
  return del.meta.changes
}

export async function biz98BackfillMlsFromActiveRedfinSources(
  db: AppDatabase,
  fetchImpl: typeof fetch,
  log: (msg: string) => void = () => {},
): Promise<number> {
  const redfinSources = await db
    .prepare(
      `SELECT DISTINCT s.id, s.url, s.config_json
       FROM scraper_sources s
       INNER JOIN house_hunt_scrapers hs ON hs.scraper_id = s.id
       WHERE s.kind = 'redfin'`,
    )
    .all<{ id: number; url: string; config_json: string | null }>()

  let mls_backfilled = 0
  for (const src of redfinSources.results ?? []) {
    const params = resolveRedfinParamsFromSource(src)
    if (!params) {
      log(`skip source ${src.id}: cannot parse Redfin params from ${src.url}`)
      continue
    }
    const gisUrl = buildStingrayGisCsvUrl(params)
    const res = await fetchImpl(gisUrl, { headers: { ...REDFIN_FETCH_HEADERS } })
    if (!res.ok) {
      log(`source ${src.id}: gis-csv ${res.status}`)
      continue
    }
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
    await new Promise((r) => setTimeout(r, 1000))
  }
  return mls_backfilled
}

export async function runBiz98Rehydrate(
  db: AppDatabase,
  deps: {
    fetchImpl: typeof fetch
    logger?: (msg: string) => void
    /** When set, writes `script-report.json` under this directory. */
    reportDir?: string
  },
): Promise<Biz98Report> {
  const log = deps.logger ?? console.warn

  const polluted_rows_deleted = await biz98DeletePollutedListingImages(db)
  const mls_backfilled = await biz98BackfillMlsFromActiveRedfinSources(db, deps.fetchImpl, log)

  const redfinPending = await db
    .prepare(
      `SELECT id FROM listings
       WHERE link LIKE '%redfin.com%'
         AND mls_number IS NOT NULL
         AND id NOT IN (SELECT DISTINCT listing_id FROM listing_image_urls)`,
    )
    .all<{ id: number }>()

  let image_fetches_succeeded = 0
  let image_fetches_failed = 0
  for (const row of redfinPending.results ?? []) {
    const out = await runImageBackfillForListings(db, {
      listingIdFilter: row.id,
      logger: log,
    })
    image_fetches_succeeded += out.succeeded
    image_fetches_failed += out.failed
  }

  const skipNoMls =
    (
      await db
        .prepare(`SELECT COUNT(*) as c FROM listings WHERE link LIKE '%redfin.com%' AND mls_number IS NULL`)
        .first<{ c: number }>()
    )?.c ?? 0
  const skipNonRedfin =
    (
      await db
        .prepare(`SELECT COUNT(*) as c FROM listings WHERE link NOT LIKE '%redfin.com%'`)
        .first<{ c: number }>()
    )?.c ?? 0

  const report: Biz98Report = {
    polluted_rows_deleted,
    mls_backfilled,
    image_fetches_succeeded,
    image_fetches_failed,
    redfin_listings_skipped_no_mls: skipNoMls,
    non_redfin_listings_skipped: skipNonRedfin,
    ranAt: new Date().toISOString(),
  }

  if (deps.reportDir) {
    fs.mkdirSync(deps.reportDir, { recursive: true })
    fs.writeFileSync(path.join(deps.reportDir, 'script-report.json'), JSON.stringify(report, null, 2))
  }

  console.log('BIZ-98 rehydrate complete:', report)
  return report
}

async function cliMain(): Promise<void> {
  const raw = new Database(resolveDatabasePath())
  const db = wrapDatabase(raw)
  try {
    const dateDir = path.join(process.cwd(), `qa/captures/biz98-dashboard-success-${yyyymmdd()}`)
    await runBiz98Rehydrate(db, { fetchImpl: globalThis.fetch, reportDir: dateDir })
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
