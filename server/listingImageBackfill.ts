import type { AppDatabase } from './db/app-database'
import { replaceListingImageUrls } from './listingImageUrls'
import { findSourceForUrl } from './scrapers/sourceRegistry'

export interface RunImageBackfillOptions {
  listingIdFilter?: number
  delayMsBetween?: number
  logger?: (msg: string) => void
}

export async function runImageBackfillForListings(
  db: AppDatabase,
  options?: RunImageBackfillOptions,
): Promise<{ queued: number; succeeded: number; failed: number }> {
  const listingIdFilter = options?.listingIdFilter
  const delayMsBetween = options?.delayMsBetween ?? 200
  const warn = options?.logger ?? console.warn

  let pendingSql = `SELECT id, link, mls_number FROM listings
         WHERE id NOT IN (SELECT DISTINCT listing_id FROM listing_image_urls)`
  const pendingParams: unknown[] = []
  if (listingIdFilter != null) {
    pendingSql += ' AND id = ?'
    pendingParams.push(listingIdFilter)
  }
  const rows = await db
    .prepare(pendingSql)
    .bind(...pendingParams)
    .all<{ id: number; link: string; mls_number: string | null }>()
  const pending = rows.results ?? []
  const queued = pending.length
  let succeeded = 0
  let failed = 0

  for (const row of pending) {
    try {
      const source = findSourceForUrl(row.link)
      if (!source) {
        failed++
        warn(`[backfill] listing ${row.id}: no listing source for URL`)
      } else {
        const urls = await source.extractPhotoUrls(row.link, { mlsNumber: row.mls_number })
        if (urls.length > 0) {
          await replaceListingImageUrls(db, row.id, urls)
          succeeded++
          await new Promise((r) => setTimeout(r, delayMsBetween))
        } else {
          failed++
          warn(`[backfill] listing ${row.id}: image fetch failed — no images retrieved`)
        }
      }
    } catch (err) {
      failed++
      const detail = err instanceof Error ? err.message : String(err)
      warn(`[backfill] listing ${row.id}: image fetch failed — ${detail}`)
    }
  }

  return { queued, succeeded, failed }
}
