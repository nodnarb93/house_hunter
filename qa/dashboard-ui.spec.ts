import Database from 'better-sqlite3'
import os from 'node:os'
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

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
    bookmarked?: 0 | 1
  },
) {
  const res = await request.post('/api/test/seed-listing', {
    data: {
      title: opts.title,
      link: `https://example.invalid/dashboard-ui-${Date.now()}-${Math.random()}`,
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
  if (opts.bookmarked === 0 || opts.bookmarked === 1) patchBody.bookmarked = opts.bookmarked
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
  opts: { feedUrl: string; finishedAt: string; resultSummary: string },
) {
  db.prepare(
    `INSERT INTO runs (started_at, finished_at, feed_url, total_fetched, passed_filter_count, result_summary, preset_id)
     VALUES (?, ?, ?, 0, 0, ?, NULL)`,
  ).run(opts.finishedAt, opts.finishedAt, opts.feedUrl, opts.resultSummary)
}

async function waitForDashboard(page: Page) {
  await expect(page.getByTestId('dashboard-loading')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByTestId('dashboard-page')).toBeVisible()
}

test.describe('BIZ-276 dashboard UI', () => {
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

  test('smoke: / redirects to dashboard', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/dashboard$/)
    await waitForDashboard(page)
    await expect(page.getByTestId('schedule-overview')).toHaveCount(0)
  })

  test('per-hunt strip renders listing cards', async ({ page, request }) => {
    const scraperId = await createScraper(request, `https://example.invalid/biz276-strip-${Date.now()}.xml`)
    const huntId = await createHunt(request, `BIZ276 strip ${Date.now()}`)
    const now = Date.now()
    const scraped = new Date(now - 2 * 60 * 60 * 1000).toISOString()
    for (let i = 0; i < 3; i++) {
      await seedListing(request, {
        title: `BIZ276 card ${i}`,
        huntId,
        scraperId,
        scraped_at: scraped,
        seen: 0,
      })
    }

    await page.goto('/dashboard')
    await waitForDashboard(page)
    const strip = page.getByTestId(`dashboard-hunt-strip-${huntId}`)
    await expect(strip).toBeVisible()
    await expect(strip.getByTestId(/dashboard-listing-card-/)).not.toHaveCount(0)
  })

  test('empty hunt shows placeholder', async ({ page, request }) => {
    const huntId = await createHunt(request, `BIZ276 empty ${Date.now()}`)
    await page.goto('/dashboard')
    await waitForDashboard(page)
    await expect(page.getByTestId(`dashboard-hunt-empty-${huntId}`)).toBeVisible()
  })

  test('action queue row opens triage listing modal', async ({ page, request }) => {
    const scraperId = await createScraper(request, `https://example.invalid/biz276-tour-${Date.now()}.xml`)
    const huntId = await createHunt(request, `BIZ276 tour ${Date.now()}`)
    const tourInThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
    const listingId = await seedListing(request, {
      title: 'BIZ276 upcoming tour',
      huntId,
      scraperId,
      stage: 'tour_scheduled',
      tour_scheduled_at: tourInThreeDays,
      bookmarked: 1,
    })

    await page.goto('/dashboard')
    await waitForDashboard(page)
    await page.getByTestId(`dashboard-action-row-${listingId}`).click()
    await expect(page).toHaveURL(new RegExp(`/triage\\?listing=${listingId}`))
    await expect(page.getByTestId('triage-listing-modal')).toBeVisible()
  })

  test('health strip navigates to runs', async ({ page, request }) => {
    const scraperId = await createScraper(request, `https://example.invalid/biz276-health-${Date.now()}.xml`)
    const db = await openTestDb(request)
    try {
      const row = db.prepare('SELECT url FROM scraper_sources WHERE id = ?').get(scraperId) as { url: string }
      insertRun(db, {
        feedUrl: row.url,
        finishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        resultSummary: JSON.stringify([{ title: 'ok', link: 'https://example.invalid/x' }]),
      })
    } finally {
      db.close()
    }

    await page.goto('/dashboard')
    await waitForDashboard(page)
    await page.getByTestId('dashboard-health-strip').click()
    await expect(page).toHaveURL(/\/runs$/)
  })

  test('mobile viewport: hunt strip is horizontally scrollable', async ({ page, request }) => {
    const scraperId = await createScraper(request, `https://example.invalid/biz276-mobile-${Date.now()}.xml`)
    const huntId = await createHunt(request, `BIZ276 mobile ${Date.now()}`)
    const scraped = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    for (let i = 0; i < 4; i++) {
      await seedListing(request, {
        title: `BIZ276 mobile card ${i}`,
        huntId,
        scraperId,
        scraped_at: scraped,
        seen: 0,
      })
    }

    await page.setViewportSize({ width: 375, height: 720 })
    await page.goto('/dashboard')
    await waitForDashboard(page)

    const scrollable = await page.getByTestId(`dashboard-hunt-strip-${huntId}`).evaluate((el) => {
      return el.scrollWidth > el.clientWidth
    })
    expect(scrollable).toBe(true)
  })

  test('action row shows thumbnail and hunt badge', async ({ page, request }) => {
    const scraperId = await createScraper(request, `https://example.invalid/biz286b-thumb-${Date.now()}.xml`)
    const huntName = `BIZ286b hunt ${Date.now()}`
    const huntId = await createHunt(request, huntName)
    const tourInThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
    const listingId = await seedListing(request, {
      title: 'BIZ286b tour with hunt',
      huntId,
      scraperId,
      stage: 'tour_scheduled',
      tour_scheduled_at: tourInThreeDays,
    })

    await page.goto('/dashboard')
    await waitForDashboard(page)

    const row = page.getByTestId(`dashboard-action-row-${listingId}`)
    await expect(row).toBeVisible()
    const thumb = row.locator('img, [data-testid="triage-tile-thumb-placeholder"]')
    await expect(thumb.first()).toBeVisible()
    await expect(row.getByTestId('hunt-name-badge')).toHaveText(huntName)
  })

  test('action row omits hunt badge when hunt_name is null', async ({ page, request }) => {
    const scraperId = await createScraper(request, `https://example.invalid/biz286b-nobadge-${Date.now()}.xml`)
    const huntId = await createHunt(request, `BIZ286b unused hunt ${Date.now()}`)
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const listingId = await seedListing(request, {
      title: 'BIZ286b stale no hunt',
      huntId,
      scraperId,
      scraped_at: eightDaysAgo,
      stage: 'interested',
    })

    const db = await openTestDb(request)
    try {
      db.prepare('UPDATE listings SET hunt_id = NULL WHERE id = ?').run(listingId)
    } finally {
      db.close()
    }

    await page.goto('/dashboard')
    await waitForDashboard(page)

    const row = page.getByTestId(`dashboard-action-row-${listingId}`)
    await expect(row).toBeVisible()
    await expect(row.getByTestId('hunt-name-badge')).toHaveCount(0)
  })

  test('action row labels use reach-out and tour wording', async ({ page, request }) => {
    const scraperId = await createScraper(request, `https://example.invalid/biz286b-labels-${Date.now()}.xml`)
    const huntId = await createHunt(request, `BIZ286b labels ${Date.now()}`)
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const tourInThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)

    const staleId = await seedListing(request, {
      title: 'BIZ286b stale interested',
      huntId,
      scraperId,
      scraped_at: eightDaysAgo,
      stage: 'interested',
    })
    const tourId = await seedListing(request, {
      title: 'BIZ286b upcoming tour',
      huntId,
      scraperId,
      stage: 'tour_scheduled',
      tour_scheduled_at: tourInThreeDays,
    })

    await page.goto('/dashboard')
    await waitForDashboard(page)

    const staleRow = page.getByTestId(`dashboard-action-row-${staleId}`)
    await expect(staleRow).toContainText(/Reach out — (saved \d+d ago|saved today)/)

    const tourRow = page.getByTestId(`dashboard-action-row-${tourId}`)
    await expect(tourRow.locator('.text-zinc-500')).toContainText(/^Tour /)
  })

  test('visibilitychange refetch removes resolved action rows', async ({ page, request }) => {
    const scraperId = await createScraper(request, `https://example.invalid/biz286b-refetch-${Date.now()}.xml`)
    const huntId = await createHunt(request, `BIZ286b refetch ${Date.now()}`)
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const listingId = await seedListing(request, {
      title: 'BIZ286b stale for refetch',
      huntId,
      scraperId,
      scraped_at: eightDaysAgo,
      stage: 'interested',
    })

    await page.goto('/dashboard')
    await waitForDashboard(page)
    await expect(page.getByTestId(`dashboard-action-row-${listingId}`)).toBeVisible()

    const patch = await request.patch(`/api/listings/${listingId}`, { data: { stage: 'rejected' } })
    expect(patch.status()).toBe(200)

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await expect(page.getByTestId(`dashboard-action-row-${listingId}`)).toHaveCount(0, {
      timeout: 10_000,
    })
  })
})
