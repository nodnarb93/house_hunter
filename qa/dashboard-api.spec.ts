import Database from 'better-sqlite3'
import os from 'node:os'
import { test, expect, type APIRequestContext } from '@playwright/test'

type DashboardJson = {
  hunts: { id: number; name: string; listings: { id: number; seen: number }[] }[]
  actionQueue: { id: number; stage: string; stageChangedAt?: string; tourScheduledAt?: string }[]
  health: {
    lastSuccessfulScrapeAt: string | null
    newListingsLast24h: number
    failingScrapers: { id: number; name: string; lastError: string }[]
  }
}

const seeds: { listingIds: number[]; huntIds: number[]; scraperIds: number[] } = {
  listingIds: [],
  huntIds: [],
  scraperIds: [],
}

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

async function createHunt(request: APIRequestContext, name: string) {
  const res = await request.post('/api/house-hunts', { data: { name } })
  expect(res.status()).toBe(201)
  const id = ((await res.json()) as { id: number }).id
  seeds.huntIds.push(id)
  return id
}

async function createScraper(request: APIRequestContext, url: string) {
  const res = await request.post('/api/scrapers', { data: { url } })
  expect(res.status()).toBe(201)
  const id = ((await res.json()) as { id: number }).id
  seeds.scraperIds.push(id)
  return id
}

async function seedListing(
  request: APIRequestContext,
  opts: {
    title: string
    huntId: number
    scraperId: number
    scraped_at?: string
    seen?: 0 | 1
    stage?: string
    tour_scheduled_at?: string
  }
) {
  const res = await request.post('/api/test/seed-listing', {
    data: {
      title: opts.title,
      link: `https://example.invalid/dashboard-${Date.now()}-${Math.random()}`,
      hunt_id: opts.huntId,
      scraper_id: opts.scraperId,
      scraped_at: opts.scraped_at,
    },
  })
  expect(res.status()).toBe(201)
  const { id } = (await res.json()) as { id: number }
  seeds.listingIds.push(id)

  const patchBody: Record<string, unknown> = {}
  if (opts.seen === 0 || opts.seen === 1) patchBody.seen = opts.seen
  if (opts.stage) patchBody.stage = opts.stage
  if (opts.tour_scheduled_at) patchBody.tour_scheduled_at = opts.tour_scheduled_at
  if (Object.keys(patchBody).length > 0) {
    const patch = await request.patch(`/api/listings/${id}`, { data: patchBody })
    expect(patch.status()).toBe(200)
  }

  return id
}

function openTestDb(request: APIRequestContext) {
  return request.get('/api/test/runtime-info').then(async (res) => {
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { database_path: string }
    expect(body.database_path.startsWith(os.tmpdir())).toBe(true)
    return new Database(body.database_path)
  })
}

function insertRun(
  db: Database.Database,
  opts: { feedUrl: string; finishedAt: string; resultSummary: string }
) {
  db.prepare(
    `INSERT INTO runs (started_at, finished_at, feed_url, total_fetched, passed_filter_count, result_summary, preset_id)
     VALUES (?, ?, ?, 0, 0, ?, NULL)`
  ).run(opts.finishedAt, opts.finishedAt, opts.feedUrl, opts.resultSummary)
}

test.describe('BIZ-191 GET /api/dashboard', () => {
  test.beforeEach(async ({ request }) => {
    seeds.listingIds = []
    seeds.huntIds = []
    seeds.scraperIds = []
    await wipeListings(request)
  })

  test.afterEach(async ({ request }) => {
    while (seeds.listingIds.length > 0) {
      const id = seeds.listingIds.pop()!
      await request.delete(`/api/test/listings/${id}`).catch(() => {})
    }
    while (seeds.huntIds.length > 0) {
      const id = seeds.huntIds.pop()!
      await request.delete(`/api/house-hunts/${id}`).catch(() => {})
    }
    while (seeds.scraperIds.length > 0) {
      const id = seeds.scraperIds.pop()!
      await request.delete(`/api/scrapers/${id}`).catch(() => {})
    }
  })

  test('returns hunts, action queue, and health aggregates', async ({ request }) => {
    const scraperOk = await createScraper(request, `https://example.invalid/dashboard-ok-${Date.now()}.xml`)
    const scraperFail = await createScraper(request, `https://example.invalid/dashboard-fail-${Date.now()}.xml`)

    const huntUnseen = await createHunt(request, `BIZ191 unseen ${Date.now()}`)
    const huntSeenOnly = await createHunt(request, `BIZ191 seen ${Date.now()}`)
    const huntEmpty = await createHunt(request, `BIZ191 empty ${Date.now()}`)

    const now = Date.now()
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString()
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString()
    const tourInThreeDays = new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)

    const unseenNew = await seedListing(request, {
      title: 'BIZ191 unseen new',
      huntId: huntUnseen,
      scraperId: scraperOk,
      scraped_at: twoHoursAgo,
      seen: 0,
    })
    const unseenOld = await seedListing(request, {
      title: 'BIZ191 unseen old',
      huntId: huntUnseen,
      scraperId: scraperOk,
      scraped_at: eightDaysAgo,
      seen: 0,
    })
    await seedListing(request, {
      title: 'BIZ191 seen only',
      huntId: huntSeenOnly,
      scraperId: scraperOk,
      scraped_at: twoHoursAgo,
      seen: 1,
    })

    const staleInterestedId = await seedListing(request, {
      title: 'BIZ191 stale interested',
      huntId: huntUnseen,
      scraperId: scraperOk,
      scraped_at: eightDaysAgo,
      stage: 'interested',
    })

    const upcomingTourId = await seedListing(request, {
      title: 'BIZ191 upcoming tour',
      huntId: huntSeenOnly,
      scraperId: scraperOk,
      scraped_at: twoHoursAgo,
      stage: 'tour_scheduled',
      tour_scheduled_at: tourInThreeDays,
    })

    const db = await openTestDb(request)
    try {
      const okRow = db.prepare('SELECT url FROM scraper_sources WHERE id = ?').get(scraperOk) as { url: string }
      const failRow = db.prepare('SELECT url FROM scraper_sources WHERE id = ?').get(scraperFail) as { url: string }

      insertRun(db, {
        feedUrl: okRow.url,
        finishedAt: new Date(now - 60 * 60 * 1000).toISOString(),
        resultSummary: JSON.stringify([{ title: 'ok', link: 'https://example.invalid/x' }]),
      })
      insertRun(db, {
        feedUrl: failRow.url,
        finishedAt: new Date(now - 30 * 60 * 1000).toISOString(),
        resultSummary: JSON.stringify({ error: 'fetch timeout after 30s' }),
      })
    } finally {
      db.close()
    }

    const res = await request.get('/api/dashboard')
    expect(res.status()).toBe(200)
    const body = (await res.json()) as DashboardJson

    const returnedIds = new Set(body.hunts.map((h) => h.id))
    for (const id of [huntUnseen, huntSeenOnly, huntEmpty]) {
      expect(returnedIds.has(id)).toBe(true)
    }

    const unseenHunt = body.hunts.find((h) => h.id === huntUnseen)!
    expect(unseenHunt.listings.length).toBe(3)
    expect(unseenHunt.listings[0].seen).toBe(0)
    expect(unseenHunt.listings[1].seen).toBe(0)
    expect(unseenHunt.listings.every((l) => l.seen === 0 || l.seen === 1)).toBe(true)
    const unseenIds = unseenHunt.listings.map((l) => l.id)
    expect(unseenIds.indexOf(unseenNew)).toBeLessThan(unseenIds.indexOf(unseenOld))

    const seenHunt = body.hunts.find((h) => h.id === huntSeenOnly)!
    expect(seenHunt.listings.length).toBe(2)
    expect(seenHunt.listings.some((l) => l.seen === 1)).toBe(true)

    const emptyHunt = body.hunts.find((h) => h.id === huntEmpty)!
    expect(emptyHunt.listings).toEqual([])

    const queueIds = body.actionQueue.map((q) => q.id)
    expect(queueIds).toContain(staleInterestedId)
    expect(queueIds).toContain(upcomingTourId)

    expect(body.health.newListingsLast24h).toBeGreaterThanOrEqual(1)
    expect(body.health.lastSuccessfulScrapeAt).not.toBeNull()

    const failScraper = body.health.failingScrapers.find((s) => s.id === scraperFail)
    expect(failScraper).toBeTruthy()
    expect(failScraper!.lastError).toContain('fetch timeout')
  })
})
