import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

const seeds: { listingId: number; huntId: number; scraperId: number }[] = []

async function createRssScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz158-detail-modal-feed-${Date.now()}.xml` },
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
  const huntRes = await request.post('/api/house-hunts', { data: { name: `BIZ158 detail hunt ${Date.now()}` } })
  expect(huntRes.status()).toBe(201)
  const huntId = ((await huntRes.json()) as { id: number }).id

  const seed = await request.post('/api/test/seed-listing', {
    data: {
      title,
      link: `https://example.invalid/biz158-detail-${Date.now()}`,
      hunt_id: huntId,
      scraper_id: scraperId,
      price_cents: 250_000_00,
      ...extra,
    },
  })
  expect(seed.status()).toBe(201)
  const { id } = (await seed.json()) as { id: number }
  const patch = await request.patch(`/api/listings/${id}`, { data: { bookmarked: 1 } })
  expect(patch.status()).toBe(200)
  seeds.push({ listingId: id, huntId, scraperId })
  return { id, title, huntId }
}

type ListingApiRow = {
  id: number
  stage: string
  rejection_reason: string | null
  walkthrough_notes: string | null
  tour_scheduled_at: string | null
}

async function getBookmarkedListing(request: APIRequestContext, id: number): Promise<ListingApiRow | undefined> {
  const listRes = await request.get('/api/listings?bookmarked=1')
  expect(listRes.status()).toBe(200)
  const data = (await listRes.json()) as { listings: ListingApiRow[] }
  return data.listings.find((l) => l.id === id)
}

function deskTile(page: Page, listingId: number) {
  return page.getByTestId('triage-desktop-kanban').getByTestId(`triage-tile-${listingId}`)
}

test.describe('BIZ-158 / BIZ-163 listing detail modal', () => {
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

  test('modal opens on tile body click; not on displayName or pencil', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Modal targets ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')

    await desk.getByTestId(`triage-tile-secondary-${id}`).click()
    await expect(page.getByTestId('triage-listing-modal')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('triage-listing-modal')).toHaveCount(0)

    await desk.getByTestId(`triage-tile-displayname-${id}`).click()
    await expect(page.getByTestId('triage-listing-modal')).toHaveCount(0)

    await desk.getByTestId(`triage-tile-nickname-edit-${id}`).click()
    await expect(desk.getByTestId(`triage-tile-nickname-input-${id}`)).toBeVisible()
    await expect(page.getByTestId('triage-listing-modal')).toHaveCount(0)
  })

  test('current-stage section expanded by default; toggling opens other bodies', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Sections ${Date.now()}`)
    const st = await request.patch(`/api/listings/${id}`, { data: { stage: 'tour_scheduled' } })
    expect(st.status()).toBe(200)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await deskTile(page, id).getByTestId(`triage-tile-secondary-${id}`).click()

    await expect(page.getByTestId('triage-detail-section-header-tour_scheduled')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('triage-detail-section-body-tour_scheduled')).toBeVisible()
    for (const k of ['interested', 'contacted', 'walkthrough', 'rejected'] as const) {
      await expect(page.getByTestId(`triage-detail-section-body-${k}`)).toHaveCount(0)
    }

    await page.getByTestId('triage-detail-section-header-walkthrough').click()
    await expect(page.getByTestId('triage-detail-section-body-walkthrough')).toBeVisible()
  })

  test('rejection_reason persists after reload and reopen', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Reject persist ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await deskTile(page, id).getByTestId(`triage-tile-secondary-${id}`).click()
    await page.getByTestId('triage-detail-section-header-rejected').click()
    await page.getByTestId('triage-detail-field-rejection_reason').fill('Asking too high')
    await page.getByTestId('triage-detail-field-rejection_reason').blur()
    await expect.poll(async () => (await getBookmarkedListing(request, id))?.rejection_reason).toBe('Asking too high')

    await page.reload()
    await deskTile(page, id).getByTestId(`triage-tile-secondary-${id}`).click()
    await page.getByTestId('triage-detail-section-header-rejected').click()
    await expect(page.getByTestId('triage-detail-field-rejection_reason')).toHaveValue('Asking too high')
    const row = await getBookmarkedListing(request, id)
    expect(row?.rejection_reason).toBe('Asking too high')
  })

  test('walkthrough_notes survive stage move via mobile select', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Stage move ${Date.now()}`, { stage: 'interested' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/triage')

    await page.getByTestId('triage-mobile-list').getByTestId(`triage-tile-${id}`).getByTestId(`triage-tile-secondary-${id}`).click()
    await page.getByTestId('triage-detail-section-header-walkthrough').click()
    await page.getByTestId('triage-detail-field-walkthrough_notes').fill('Big yard')
    await page.getByTestId('triage-detail-field-walkthrough_notes').blur()
    await expect.poll(async () => (await getBookmarkedListing(request, id))?.walkthrough_notes).toBe('Big yard')
    await page.getByTestId('triage-listing-modal-close').click()

    await page.getByTestId(`triage-mobile-stage-select-${id}`).selectOption('walkthrough')
    await expect.poll(async () => (await getBookmarkedListing(request, id))?.stage).toBe('walkthrough')

    await page.getByTestId('triage-tab-walkthrough').click()
    await page.getByTestId('triage-mobile-list').getByTestId(`triage-tile-${id}`).getByTestId(`triage-tile-secondary-${id}`).click()
    await expect(page.getByTestId('triage-detail-field-walkthrough_notes')).toHaveValue('Big yard')
  })

  test('tour_scheduled_at saves on blur', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Tour dt ${Date.now()}`)
    const st = await request.patch(`/api/listings/${id}`, { data: { stage: 'tour_scheduled' } })
    expect(st.status()).toBe(200)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await deskTile(page, id).getByTestId(`triage-tile-secondary-${id}`).click()
    const input = page.getByTestId('triage-detail-field-tour_scheduled_at')
    await input.fill('2026-06-01T14:30')
    await input.blur()
    await expect.poll(async () => (await getBookmarkedListing(request, id))?.tour_scheduled_at).toBe(
      '2026-06-01T14:30',
    )
  })

  test('modal closes via Escape, backdrop, and close button', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Close modes ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')

    await deskTile(page, id).getByTestId(`triage-tile-secondary-${id}`).click()
    await expect(page.getByTestId('triage-listing-modal')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('triage-listing-modal')).toHaveCount(0)

    await deskTile(page, id).getByTestId(`triage-tile-secondary-${id}`).click()
    await expect(page.getByTestId('triage-listing-modal')).toBeVisible()
    await page.getByTestId('triage-listing-modal-title').click()
    await expect(page.getByTestId('triage-listing-modal')).toBeVisible()
    await page.getByTestId('triage-listing-modal').click({ position: { x: 4, y: 4 } })
    await expect(page.getByTestId('triage-listing-modal')).toHaveCount(0)

    await deskTile(page, id).getByTestId(`triage-tile-secondary-${id}`).click()
    await page.getByTestId('triage-listing-modal-close').click()
    await expect(page.getByTestId('triage-listing-modal')).toHaveCount(0)
  })
})
