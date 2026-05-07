import cron from 'node-cron'
import type { AppDatabase } from './db/app-database'
import { getListingIdsByScrapedAt, notifyHuntsForNewListings } from './huntNotifications'
import type { FeedEntry } from './types'
import { replaceListingImageUrls } from './listingImageUrls'
import { replaceListingImages } from './listingImages'
import { fetchUrlsAsWebpBuffers } from './scrapers/imageUtils'
import { extractRssImageUrls, fetchAndParse } from './scrapers/rssAdapter'
import { findSourceForUrl } from './scrapers/sourceRegistry'
import { fetchRedfinGisCsvListings, type RedfinParams } from './scrapers/redfinAdapter'

export interface ScraperScheduleRow {
  id: number
  kind: string
  url: string
  config_json: string | null
  schedule_slots: string | null
  last_run_at: string | null
}

function parseScheduleSlots(raw: string | null): string[] {
  if (raw == null || raw === '') return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((v) => String(v))
  } catch {
    return []
  }
}

function currentLocalHHMM(): string {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function extractFirstPriceCents(entry: FeedEntry): number | null {
  const text = `${entry.title} ${entry.description}`.toLowerCase()
  const priceRe = /\$?\s*([\d,]+)/
  const match = priceRe.exec(text)
  if (!match) return null
  const n = parseInt(match[1].replace(/,/g, ''), 10)
  if (isNaN(n)) return null
  return n * 100
}

const DEBOUNCE_MS = 25 * 60 * 1000

function shouldRunNow(lastRunAt: string | null): boolean {
  if (lastRunAt == null || lastRunAt === '') return true
  const t = new Date(lastRunAt).getTime()
  if (isNaN(t)) return true
  return Date.now() - t >= DEBOUNCE_MS
}

/**
 * Runs a single scraper source: RSS or Redfin ingests into `listings` with preset_id=null.
 */
export async function runScraperSource(
  db: AppDatabase,
  row: ScraperScheduleRow
): Promise<{ fetched: number; inserted: number }> {
  if (row.kind === 'rss') {
    const entries = await fetchAndParse(row.url)
    const finishedAt = new Date().toISOString()
    const listingInsert = db.prepare(
      'INSERT OR IGNORE INTO listings (preset_id, run_id, title, link, price_cents, address, beds, baths, scraped_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const e of entries) {
      const priceCents = extractFirstPriceCents(e)
      const ins = await listingInsert.bind(null, null, e.title, e.link, priceCents, null, null, null, finishedAt).run()
      if (ins.meta.changes > 0) {
        const newId = ins.meta.last_row_id
        if (process.env.PLAYWRIGHT_TEST !== '1') {
          const urls = extractRssImageUrls(e)
          const buffers = await fetchUrlsAsWebpBuffers(urls, 5, 200)
          await replaceListingImages(db, newId, buffers)
        }
      }
    }
    const newListingIds = await getListingIdsByScrapedAt(db, finishedAt, null)
    await notifyHuntsForNewListings(db, newListingIds)
    return { fetched: entries.length, inserted: newListingIds.length }
  }

  if (row.kind === 'redfin') {
    let params: RedfinParams
    try {
      params = JSON.parse(row.config_json ?? '{}') as RedfinParams
    } catch {
      console.error(`Scheduled Redfin scrape ${row.id}: invalid config_json (not JSON)`)
      return { fetched: 0, inserted: 0 }
    }
    if (
      typeof params.region_id !== 'number' ||
      typeof params.region_type !== 'number' ||
      typeof params.market !== 'string' ||
      !params.market
    ) {
      console.error(`Scheduled Redfin scrape ${row.id}: missing region_id, region_type, or market in config`)
      return { fetched: 0, inserted: 0 }
    }

    const listings = await fetchRedfinGisCsvListings(params)
    const finishedAt = new Date().toISOString()
    const listingInsert = db.prepare(
      'INSERT OR IGNORE INTO listings (preset_id, run_id, title, link, price_cents, address, beds, baths, scraped_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const listing of listings) {
      const ins = await listingInsert
        .bind(
          null,
          null,
          listing.title,
          listing.link,
          listing.price_cents,
          listing.address,
          listing.beds,
          listing.baths,
          finishedAt
        )
        .run()
      if (ins.meta.changes > 0) {
        const newId = ins.meta.last_row_id
        if (process.env.PLAYWRIGHT_TEST !== '1') {
          const source = findSourceForUrl(listing.link)
          if (source) {
            const urls = await source.extractPhotoUrls(listing.link)
            await replaceListingImageUrls(db, newId, urls)
            await new Promise((r) => setTimeout(r, 200))
          }
        }
      }
    }
    const newListingIds = await getListingIdsByScrapedAt(db, finishedAt, null)
    await notifyHuntsForNewListings(db, newListingIds)
    return { fetched: listings.length, inserted: newListingIds.length }
  }

  return { fetched: 0, inserted: 0 }
}

/**
 * Per-scraper slot cron: every minute, runs scrapers whose `schedule_slots` contain
 * the current local HH:MM, respecting a 25-minute debounce via `last_run_at`.
 */
export function startScheduledScrapes(db: AppDatabase): void {
  const tick = async () => {
    const hhmm = currentLocalHHMM()
    const rows = await db
      .prepare(
        'SELECT id, kind, url, config_json, schedule_slots, last_run_at FROM scraper_sources'
      )
      .all<ScraperScheduleRow>()
    for (const row of rows.results ?? []) {
      const slots = parseScheduleSlots(row.schedule_slots)
      if (!slots.includes(hhmm)) continue
      if (!shouldRunNow(row.last_run_at)) continue
      try {
        await runScraperSource(db, row)
      } catch (err) {
        console.error(`runScraperSource failed for scraper ${row.id}:`, err)
      }
      const nowIso = new Date().toISOString()
      await db.prepare('UPDATE scraper_sources SET last_run_at = ? WHERE id = ?').bind(nowIso, row.id).run()
    }
  }

  cron.schedule('* * * * *', () => {
    void tick().catch((err) => console.error('Scheduled scrape tick failed:', err))
  })
  console.log('Scheduled scrapes enabled (node-cron; per-scraper schedule_slots).')
}
