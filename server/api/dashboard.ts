import type { Env } from '../types'

export const STALE_INTERESTED_DAYS = 7
export const UPCOMING_TOUR_DAYS = 7

const LISTING_LIMIT_PER_HUNT = 10
const ACTION_QUEUE_LIMIT = 10
const FAILING_SCRAPER_ERROR_MAX_LEN = 200

interface HuntRow {
  id: number
  name: string
}

interface ListingRow {
  id: number
  link: string
  title: string
  address: string | null
  price_cents: number | null
  beds: number | null
  baths: number | null
  image_url: string | null
  scraped_at: string
  seen: number
}

interface ActionInterestedRow {
  id: number
  stage: string
  title: string
  address: string | null
  scraped_at: string
}

interface ActionTourRow {
  id: number
  stage: string
  title: string
  address: string | null
  tour_scheduled_at: string
}

interface ScraperRow {
  id: number
  url: string
}

interface RunRow {
  result_summary: string | null
}

function runSummaryHasError(summary: string | null): boolean {
  if (summary == null || summary === '') return false
  try {
    const parsed = JSON.parse(summary) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && 'error' in parsed
  } catch {
    return false
  }
}

function parseRunError(summary: string | null): string | null {
  if (summary == null) return null
  try {
    const parsed = JSON.parse(summary) as { error?: unknown }
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      const err = String(parsed.error ?? 'unknown error')
      return err.length > FAILING_SCRAPER_ERROR_MAX_LEN ? err.slice(0, FAILING_SCRAPER_ERROR_MAX_LEN) : err
    }
  } catch {
    /* not an error payload */
  }
  return null
}

function serializeListing(row: ListingRow) {
  return {
    id: row.id,
    link: row.link,
    title: row.title,
    address: row.address,
    price_cents: row.price_cents,
    beds: row.beds,
    baths: row.baths,
    image_url: row.image_url,
    scraped_at: row.scraped_at,
    seen: row.seen,
  }
}

async function loadHunts(env: Env) {
  const huntRows = await env.DB.prepare('SELECT id, name FROM house_hunts ORDER BY id ASC').all<HuntRow>()
  const hunts: { id: number; name: string; listings: ReturnType<typeof serializeListing>[] }[] = []

  for (const hunt of huntRows.results ?? []) {
    // Listings belong to a hunt via listings.hunt_id (migration 0006).
    const listingRows = await env.DB
      .prepare(
        `SELECT id, link, title, address, price_cents, beds, baths, image_url, scraped_at, seen
         FROM listings
         WHERE hunt_id = ?
         ORDER BY seen ASC, scraped_at DESC
         LIMIT ?`
      )
      .bind(hunt.id, LISTING_LIMIT_PER_HUNT)
      .all<ListingRow>()

    hunts.push({
      id: hunt.id,
      name: hunt.name,
      listings: (listingRows.results ?? []).map(serializeListing),
    })
  }

  return hunts
}

async function loadActionQueue(env: Env) {
  // No stage_changed_at on listings; scraped_at proxies time-in-stage for default-interested rows.
  const interestedRows = await env.DB
    .prepare(
      `SELECT id, stage, title, address, scraped_at
       FROM listings
       WHERE stage = 'interested'
         AND datetime(scraped_at) <= datetime('now', ?)
       ORDER BY scraped_at ASC
       LIMIT ?`
    )
    .bind(`-${STALE_INTERESTED_DAYS} days`, ACTION_QUEUE_LIMIT)
    .all<ActionInterestedRow>()

  const tourRows = await env.DB
    .prepare(
      `SELECT id, stage, title, address, tour_scheduled_at
       FROM listings
       WHERE stage = 'tour_scheduled'
         AND tour_scheduled_at IS NOT NULL
         AND datetime(tour_scheduled_at) >= datetime('now')
         AND datetime(tour_scheduled_at) <= datetime('now', ?)
       ORDER BY tour_scheduled_at ASC
       LIMIT ?`
    )
    .bind(`+${UPCOMING_TOUR_DAYS} days`, ACTION_QUEUE_LIMIT)
    .all<ActionTourRow>()

  type QueueEntry = { sortAt: string; item: Record<string, unknown> }

  const combined: QueueEntry[] = []

  for (const row of interestedRows.results ?? []) {
    combined.push({
      sortAt: row.scraped_at,
      item: {
        id: row.id,
        stage: row.stage,
        title: row.title,
        address: row.address,
        stageChangedAt: row.scraped_at,
      },
    })
  }

  for (const row of tourRows.results ?? []) {
    combined.push({
      sortAt: row.tour_scheduled_at,
      item: {
        id: row.id,
        stage: row.stage,
        title: row.title,
        address: row.address,
        tourScheduledAt: row.tour_scheduled_at,
      },
    })
  }

  combined.sort((a, b) => a.sortAt.localeCompare(b.sortAt))
  return combined.slice(0, ACTION_QUEUE_LIMIT).map((e) => e.item)
}

async function loadHealth(env: Env) {
  const runRows = await env.DB
    .prepare(
      `SELECT finished_at, result_summary
       FROM runs
       WHERE finished_at IS NOT NULL
       ORDER BY finished_at DESC`
    )
    .all<{ finished_at: string; result_summary: string | null }>()

  let lastSuccessfulScrapeAt: string | null = null
  for (const row of runRows.results ?? []) {
    if (!runSummaryHasError(row.result_summary)) {
      lastSuccessfulScrapeAt = row.finished_at
      break
    }
  }

  const newCountRow = await env.DB
    .prepare(`SELECT COUNT(*) as c FROM listings WHERE datetime(scraped_at) >= datetime('now', '-1 day')`)
    .first<{ c: number }>()
  const newListingsLast24h = newCountRow?.c ?? 0

  const scrapers = await env.DB.prepare('SELECT id, url FROM scraper_sources ORDER BY id').all<ScraperRow>()
  const failingScrapers: { id: number; name: string; lastError: string }[] = []

  for (const scraper of scrapers.results ?? []) {
    const latestRun = await env.DB
      .prepare(
        `SELECT result_summary FROM runs
         WHERE feed_url = ?
         ORDER BY finished_at DESC
         LIMIT 1`
      )
      .bind(scraper.url)
      .first<RunRow>()

    const lastError = parseRunError(latestRun?.result_summary ?? null)
    if (lastError != null) {
      failingScrapers.push({
        id: scraper.id,
        name: scraper.url,
        lastError,
      })
    }
  }

  return {
    lastSuccessfulScrapeAt,
    newListingsLast24h,
    failingScrapers,
  }
}

export async function handleDashboard(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })

  const [hunts, actionQueue, health] = await Promise.all([loadHunts(env), loadActionQueue(env), loadHealth(env)])

  return Response.json({ hunts, actionQueue, health })
}
