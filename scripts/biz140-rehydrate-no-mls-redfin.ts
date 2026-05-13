/**
 * BIZ-140 / BIZ-141: rehydrate Redfin listing photos for rows with no MLS and no
 * `listing_image_urls`, using HTML `extractPhotoUrls` (no MLS API required).
 *
 * Run: `npm run restore:biz140`
 *
 * Hermetic mode: `BIZ140_SKIP_NETWORK=1` — counts candidates only, no HTTP.
 */

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { wrapDatabase, type AppDatabase } from '../server/db/app-database'
import { resolveDatabasePath } from '../server/db/open-database'
import {
  extractPhotoUrls,
  isWafChallengeBody,
  REDFIN_FETCH_HEADERS,
} from '../server/scrapers/redfinAdapter'
import { replaceListingImageUrls } from '../server/listingImageUrls'

const PACE_MS = 200

const CANDIDATE_SQL = `SELECT id, link, mls_number FROM listings
WHERE id NOT IN (SELECT DISTINCT listing_id FROM listing_image_urls)
  AND link LIKE '%redfin.com%'
ORDER BY id`

async function pace(): Promise<void> {
  await new Promise((r) => setTimeout(r, PACE_MS))
}

export interface Biz140Report {
  totalCandidates: number
  succeeded: number
  failed: number
  skippedWaf: number
  mlsBackfilled: number
  ranAt: string
}

const MLS_ID_RE = /"mlsId"\s*:\s*"([^"]+)"/
const MLS_NUMBER_RE = /"mlsNumber"\s*:\s*"([^"]+)"/

function isMlsEmpty(mls: string | null | undefined): boolean {
  return mls == null || String(mls).trim() === ''
}

async function tryBackfillMlsFromHtml(
  db: AppDatabase,
  listingId: number,
  currentMls: string | null,
  html: string,
): Promise<number> {
  if (!isMlsEmpty(currentMls)) return 0
  const fromId = html.match(MLS_ID_RE)?.[1]
  const fromNum = fromId ?? html.match(MLS_NUMBER_RE)?.[1]
  if (!fromNum) return 0
  const r = await db
    .prepare(
      "UPDATE listings SET mls_number = ? WHERE id = ? AND (mls_number IS NULL OR TRIM(COALESCE(mls_number, '')) = '')",
    )
    .bind(fromNum, listingId)
    .run()
  return r.meta.changes > 0 ? 1 : 0
}

export async function runBiz140Rehydrate(
  db: AppDatabase,
  deps: { fetchImpl: typeof fetch; skipNetwork: boolean; logger?: (msg: string) => void },
): Promise<Biz140Report> {
  const log = deps.logger ?? ((msg: string) => console.warn(msg))
  const { results: rows } = await db
    .prepare(CANDIDATE_SQL)
    .all<{ id: number; link: string; mls_number: string | null }>()

  const totalCandidates = rows.length
  let succeeded = 0
  let failed = 0
  let skippedWaf = 0
  let mlsBackfilled = 0

  for (let i = 0; i < rows.length; i++) {
    if (i > 0) await pace()
    const row = rows[i]!

    if (deps.skipNetwork) {
      continue
    }

    const res = await deps.fetchImpl(row.link, { headers: { ...REDFIN_FETCH_HEADERS } })
    if (!res.ok) {
      failed += 1
      log(`fetch ${res.status} ${row.link}`)
      continue
    }

    const html = await res.text()

    if (isWafChallengeBody(html)) {
      skippedWaf += 1
      continue
    }

    const urls = extractPhotoUrls(html)
    if (urls.length > 0) {
      await replaceListingImageUrls(db, row.id, urls)
      succeeded += 1
    } else {
      failed += 1
    }

    mlsBackfilled += await tryBackfillMlsFromHtml(db, row.id, row.mls_number, html)
  }

  return {
    totalCandidates,
    succeeded,
    failed,
    skippedWaf,
    mlsBackfilled,
    ranAt: new Date().toISOString(),
  }
}

async function cliMain(): Promise<void> {
  const skipNetwork = process.env.BIZ140_SKIP_NETWORK === '1'
  const raw = new Database(resolveDatabasePath())
  const db = wrapDatabase(raw)
  try {
    const report = await runBiz140Rehydrate(db, {
      fetchImpl: globalThis.fetch,
      skipNetwork,
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
