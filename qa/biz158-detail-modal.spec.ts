import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

const biz158ModalSeeds: { listingId: number; huntId: number; scraperId: number }[] = []

async function createRssScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz158-modal-feed-${Date.now()}.xml` },
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
  const huntRes = await request.post('/api/house-hunts', { data: { name: `BIZ158 modal hunt ${Date.now()}` } })
  expect(huntRes.status()).toBe(201)
  const huntId = ((await huntRes.json()) as { id: number }).id

  const seed = await request.post('/api/test/seed-listing', {
    data: {
      title,
      link: `https://example.invalid/biz158-modal-${Date.now()}`,
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
  biz158ModalSeeds.push({ listingId: id, huntId, scraperId })
  return { id, title, huntId }
}

type ListingApiRow = {
  id: number
  title: string
  nickname: string | null
  stage: string
  interested_notes: string | null
  contacted_notes: string | null
  tour_scheduled_at: string | null
  tour_notes: string | null
  walkthrough_notes: string | null
  rejection_reason: string | null
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

test.describe('BIZ-158 / BIZ-162 listing detail modal', () => {
  test.beforeEach(async ({ request }) => {
    await wipeListings(request)
  })

  test.afterEach(async ({ request }) => {
    while (biz158ModalSeeds.length > 0) {
      const { listingId, huntId, scraperId } = biz158ModalSeeds.pop()!
      await request.delete(`/api/test/listings/${listingId}`).catch(() => {})
      await request.delete(`/api/house-hunts/${huntId}`).catch(() => {})
      await request.delete(`/api/scrapers/${scraperId}`).catch(() => {})
    }
  })

  test('tile click opens modal with title', async ({ page, request }) => {
    const title = `Modal open ${Date.now()}`
    const { id } = await seedBookmarkedListing(request, title)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')

    await deskTile(page, id).click()
    await expect(page.getByTestId('modal-backdrop')).toBeVisible()
    await expect(page.getByTestId('listing-detail-title')).toHaveText(title)
  })

  test('current-stage section expanded; others collapsed (interested + tour_scheduled)', async ({ page, request }) => {
    const { id: idInterested } = await seedBookmarkedListing(request, `Interested exp ${Date.now()}`)
    const { id: idTour } = await seedBookmarkedListing(request, `Tour exp ${Date.now()}`)
    const st = await request.patch(`/api/listings/${idTour}`, { data: { stage: 'tour_scheduled' } })
    expect(st.status()).toBe(200)

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')

    await deskTile(page, idInterested).click()
    await expect(page.getByTestId('listing-detail-section-toggle-interested')).toHaveAttribute('aria-expanded', 'true')
    for (const k of ['contacted', 'tour_scheduled', 'walkthrough', 'rejected'] as const) {
      await expect(page.getByTestId(`listing-detail-section-toggle-${k}`)).toHaveAttribute('aria-expanded', 'false')
    }
    await page.getByTestId('modal-backdrop').click({ position: { x: 4, y: 4 } })

    await deskTile(page, idTour).click()
    await expect(page.getByTestId('listing-detail-section-toggle-tour_scheduled')).toHaveAttribute('aria-expanded', 'true')
    for (const k of ['interested', 'contacted', 'walkthrough', 'rejected'] as const) {
      await expect(page.getByTestId(`listing-detail-section-toggle-${k}`)).toHaveAttribute('aria-expanded', 'false')
    }
  })

  test('interested notes save on blur (verified via GET list)', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Notes blur ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await deskTile(page, id).click()
    const ta = page.getByTestId('listing-detail-notes-interested')
    await ta.fill('Loved the kitchen')
    await ta.blur()
    await expect
      .poll(async () => (await getBookmarkedListing(request, id))?.interested_notes)
      .toBe('Loved the kitchen')
  })

  test('rejection reason saves on blur', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Reject ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await deskTile(page, id).click()
    await page.getByTestId('listing-detail-section-toggle-rejected').click()
    const ta = page.getByTestId('listing-detail-notes-rejected')
    await ta.fill('Too far from work')
    await ta.blur()
    await expect.poll(async () => (await getBookmarkedListing(request, id))?.rejection_reason).toBe('Too far from work')
  })

  test('tour_scheduled_at saves on blur', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Tour dt ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await deskTile(page, id).click()
    await page.getByTestId('listing-detail-section-toggle-tour_scheduled').click()
    const input = page.getByTestId('listing-detail-tour-scheduled-at')
    await input.fill('2026-06-01T10:30')
    await input.blur()
    await expect.poll(async () => (await getBookmarkedListing(request, id))?.tour_scheduled_at).toBe('2026-06-01T10:30')
  })

  test('notes persist across close + reopen', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Reopen ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await deskTile(page, id).click()
    await page.getByTestId('listing-detail-notes-interested').fill('Note A')
    await page.getByTestId('listing-detail-notes-interested').blur()
    await expect.poll(async () => (await getBookmarkedListing(request, id))?.interested_notes).toBe('Note A')
    await page.getByTestId('modal-backdrop').click({ position: { x: 4, y: 4 } })
    await expect(page.getByTestId('modal-backdrop')).toHaveCount(0)

    await deskTile(page, id).click()
    await expect(page.getByTestId('listing-detail-notes-interested')).toHaveValue('Note A')
  })

  test('notes persist across navigation away + back', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Nav ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await deskTile(page, id).click()
    await page.getByTestId('listing-detail-notes-interested').fill('PersistNav')
    await page.getByTestId('listing-detail-notes-interested').blur()
    await expect.poll(async () => (await getBookmarkedListing(request, id))?.interested_notes).toBe('PersistNav')
    await page.getByTestId('modal-backdrop').click({ position: { x: 4, y: 4 } })

    await page.goto('/')
    await page.goto('/triage')
    await deskTile(page, id).click()
    await expect(page.getByTestId('listing-detail-notes-interested')).toHaveValue('PersistNav')
  })

  test('listings.title unchanged when nickname PATCHed', async ({ request }) => {
    const originalTitle = 'Original Title'
    const { id } = await seedBookmarkedListing(request, originalTitle)
    const nick = await request.patch(`/api/listings/${id}`, { data: { nickname: 'Pretty Name' } })
    expect(nick.status()).toBe(200)
    const row = await getBookmarkedListing(request, id)
    expect(row?.title).toBe(originalTitle)
    expect(row?.nickname).toBe('Pretty Name')
  })

  test('has-notes glyph appears after note; tour_scheduled_at alone shows no glyph', async ({ page, request }) => {
    const { id: idNotes } = await seedBookmarkedListing(request, `Glyph notes ${Date.now()}`)
    const { id: idTourOnly } = await seedBookmarkedListing(request, `Glyph touronly ${Date.now()}`)
    const p1 = await request.patch(`/api/listings/${idTourOnly}`, {
      data: { stage: 'tour_scheduled', tour_scheduled_at: '2026-07-01T09:00' },
    })
    expect(p1.status()).toBe(200)

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')
    await expect(desk.getByTestId(`triage-tile-has-notes-${idNotes}`)).toHaveCount(0)
    await expect(desk.getByTestId(`triage-tile-has-notes-${idTourOnly}`)).toHaveCount(0)

    await deskTile(page, idNotes).click()
    await page.getByTestId('listing-detail-notes-interested').fill('Has a note')
    await page.getByTestId('listing-detail-notes-interested').blur()
    await expect.poll(async () => (await getBookmarkedListing(request, idNotes))?.interested_notes).toBe('Has a note')
    await page.getByTestId('modal-backdrop').click({ position: { x: 4, y: 4 } })

    await expect(desk.getByTestId(`triage-tile-has-notes-${idNotes}`)).toBeVisible()
    await expect(desk.getByTestId(`triage-tile-has-notes-${idTourOnly}`)).toHaveCount(0)
  })

  test('Escape closes modal', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Esc ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await deskTile(page, id).click()
    await expect(page.getByTestId('modal-backdrop')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('modal-backdrop')).toHaveCount(0)
  })

  test('backdrop vs content click', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Bd ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await deskTile(page, id).click()
    await expect(page.getByTestId('modal-backdrop')).toBeVisible()
    await page.getByTestId('modal-content').click({ position: { x: 20, y: 20 } })
    await expect(page.getByTestId('modal-backdrop')).toBeVisible()
    await page.getByTestId('modal-backdrop').click({ position: { x: 4, y: 4 } })
    await expect(page.getByTestId('modal-backdrop')).toHaveCount(0)
  })
})
