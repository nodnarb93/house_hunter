import { test, expect, type APIRequestContext } from '@playwright/test'

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

const seeds: { listingId: number; huntId: number; scraperId: number }[] = []

async function createRssScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz158-glyph-feed-${Date.now()}.xml` },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

async function seedBookmarkedListing(
  request: APIRequestContext,
  title: string,
  extra?: Record<string, unknown>,
) {
  const scraperId = await createRssScraper(request)
  const huntRes = await request.post('/api/house-hunts', { data: { name: `BIZ158 glyph hunt ${Date.now()}` } })
  expect(huntRes.status()).toBe(201)
  const huntId = ((await huntRes.json()) as { id: number }).id

  const seed = await request.post('/api/test/seed-listing', {
    data: {
      title,
      link: `https://example.invalid/biz158-glyph-${Date.now()}`,
      hunt_id: huntId,
      scraper_id: scraperId,
      price_cents: 250_000_00,
      interested_notes: null,
      contacted_notes: null,
      tour_scheduled_at: null,
      tour_notes: null,
      walkthrough_notes: null,
      rejection_reason: null,
      ...extra,
    },
  })
  expect(seed.status()).toBe(201)
  const { id } = (await seed.json()) as { id: number }
  const patch = await request.patch(`/api/listings/${id}`, { data: { bookmarked: 1 } })
  expect(patch.status()).toBe(200)
  seeds.push({ listingId: id, huntId, scraperId })
  return { id }
}

test.describe('BIZ-158 / BIZ-163 triage has-notes glyph', () => {
  test.beforeEach(async ({ request }) => {
    await wipeListings(request)
  })

  test.afterEach(async ({ request }) => {
    while (seeds.length > 0) {
      const { listingId, huntId, scraperId } = seeds.pop()!
      await request.delete(`/api/test/listings/${listingId}`).catch(() => {})
      await request.delete(`/api/house-hunts/${huntId}`).catch(() => {})
      await request.delete(`/api/scrapers/${scraperId}`).catch(() => {})
    }
  })

  test('glyph absent when all six fields are empty', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Clean ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')
    await expect(desk.getByTestId(`triage-tile-has-notes-${id}`)).toHaveCount(0)
  })

  test('glyph appears after interested_notes is set', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Note glyph ${Date.now()}`)
    const p = await request.patch(`/api/listings/${id}`, { data: { interested_notes: 'test' } })
    expect(p.status()).toBe(200)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await expect(page.getByTestId('triage-desktop-kanban').getByTestId(`triage-tile-has-notes-${id}`)).toBeVisible()
  })

  test('glyph remains when switching from notes to tour_scheduled_at only', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Tour glyph ${Date.now()}`)
    await request.patch(`/api/listings/${id}`, { data: { interested_notes: 'x' } })
    await request.patch(`/api/listings/${id}`, { data: { interested_notes: '' } })
    await request.patch(`/api/listings/${id}`, { data: { tour_scheduled_at: '2026-06-01T14:30' } })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await expect(page.getByTestId('triage-desktop-kanban').getByTestId(`triage-tile-has-notes-${id}`)).toBeVisible()
  })

  test('glyph disappears when all six fields cleared', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Clear all ${Date.now()}`)
    await request.patch(`/api/listings/${id}`, {
      data: {
        interested_notes: 'a',
        contacted_notes: 'b',
        tour_scheduled_at: '2026-01-01T12:00',
        tour_notes: 'c',
        walkthrough_notes: 'd',
        rejection_reason: 'e',
      },
    })
    await request.patch(`/api/listings/${id}`, {
      data: {
        interested_notes: '',
        contacted_notes: '',
        tour_scheduled_at: '',
        tour_notes: '',
        walkthrough_notes: '',
        rejection_reason: '',
      },
    })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await expect(page.getByTestId('triage-desktop-kanban').getByTestId(`triage-tile-has-notes-${id}`)).toHaveCount(0)
  })

  test('glyph exposes aria-label and role', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `A11y ${Date.now()}`)
    await request.patch(`/api/listings/${id}`, { data: { tour_notes: 'n' } })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const glyph = page.getByTestId('triage-desktop-kanban').getByTestId(`triage-tile-has-notes-${id}`)
    await expect(glyph).toHaveAttribute('aria-label', 'Has notes')
    await expect(glyph).toHaveAttribute('role', 'img')
  })
})
