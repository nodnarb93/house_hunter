import { test, expect, type APIRequestContext } from '@playwright/test'

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

const redesignSeeds: { listingId: number; huntId: number; scraperId: number }[] = []

async function createRssScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz158-redesign-feed-${Date.now()}.xml` },
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
  const huntRes = await request.post('/api/house-hunts', { data: { name: `BIZ158 redesign hunt ${Date.now()}` } })
  expect(huntRes.status()).toBe(201)
  const huntId = ((await huntRes.json()) as { id: number }).id

  const seed = await request.post('/api/test/seed-listing', {
    data: {
      title,
      link: `https://example.invalid/biz158-redesign-${Date.now()}`,
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
  redesignSeeds.push({ listingId: id, huntId, scraperId })
  return { id, title, huntId }
}

type ListingJson = {
  id: number
  title: string
  nickname: string | null
  displayName?: string
  stage: string
}

async function getBookmarkedListing(request: APIRequestContext, id: number): Promise<ListingJson | undefined> {
  const listRes = await request.get('/api/listings?bookmarked=1')
  expect(listRes.status()).toBe(200)
  const data = (await listRes.json()) as { listings: ListingJson[] }
  return data.listings.find((l) => l.id === id)
}

const tinyPngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test.describe('BIZ-158 / BIZ-161 triage tile redesign + walkthrough', () => {
  test.beforeEach(async ({ request }) => {
    await wipeListings(request)
  })

  test.afterEach(async ({ request }) => {
    while (redesignSeeds.length > 0) {
      const { listingId, huntId, scraperId } = redesignSeeds.pop()!
      await request.delete(`/api/test/listings/${listingId}`).catch(() => {})
      await request.delete(`/api/house-hunts/${huntId}`).catch(() => {})
      await request.delete(`/api/scrapers/${scraperId}`).catch(() => {})
    }
  })

  test('Walkthrough column rendered on desktop', async ({ page, request }) => {
    await seedBookmarkedListing(request, `BIZ161 col ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const col = page.getByTestId('triage-column-walkthrough')
    await expect(col).toBeVisible()
    await expect(col).toContainText(/walkthrough/i)
  })

  test('Walkthrough drag-drop persists after reload', async ({ page, request }) => {
    const title = `BIZ161 drag ${Date.now()}`
    const { id } = await seedBookmarkedListing(request, title)
    const stagePatch = await request.patch(`/api/listings/${id}`, { data: { stage: 'tour_scheduled' } })
    expect(stagePatch.status()).toBe(200)

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')

    const desk = page.getByTestId('triage-desktop-kanban')
    const card = desk.getByTestId('triage-column-tour_scheduled').locator('[draggable="true"]').first()
    const patchWait = page.waitForResponse(
      (res) => res.request().method() === 'PATCH' && res.url().includes(`/api/listings/${id}`),
    )
    await card.dragTo(desk.getByTestId('triage-column-walkthrough'))
    await patchWait

    await page.reload()
    await expect(desk.getByTestId('triage-column-walkthrough').getByTestId(`triage-tile-displayname-${id}`)).toBeVisible()
    const row = await getBookmarkedListing(request, id)
    expect(row?.stage).toBe('walkthrough')
  })

  test('Walkthrough mobile tab and stage select', async ({ page, request }) => {
    const title = `BIZ161 mob ${Date.now()}`
    const { id } = await seedBookmarkedListing(request, title)

    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/triage')

    await page.getByTestId('triage-tab-walkthrough').click()
    await expect(page.getByTestId('triage-tab-walkthrough')).toHaveAttribute('aria-selected', 'true')

    await page.getByTestId('triage-tab-interested').click()
    await expect(page.getByTestId('triage-tab-interested')).toHaveAttribute('aria-selected', 'true')

    const patchPromise = page.waitForResponse(
      (res) => res.url().includes(`/api/listings/${id}`) && res.request().method() === 'PATCH',
    )
    await page.getByTestId(`triage-mobile-stage-select-${id}`).selectOption('walkthrough')
    await patchPromise

    await page.getByTestId('triage-tab-walkthrough').click()
    await expect(page.getByTestId('triage-mobile-list').getByTestId(`triage-tile-displayname-${id}`)).toBeVisible()
  })

  test('Thumbnail testid and src when image_url set', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ161 img ${Date.now()}`, { image_url: tinyPngDataUrl })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')
    const img = desk.getByTestId(`triage-tile-thumbnail-${id}`)
    await expect(img).toBeVisible()
    await expect(img).toHaveAttribute('src', tinyPngDataUrl)
  })

  test('Thumbnail placeholder when image_url is null', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ161 ph ${Date.now()}`, { image_url: null })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await expect(page.getByTestId('triage-desktop-kanban').getByTestId(`triage-tile-thumbnail-placeholder-${id}`)).toBeVisible()
  })

  test('Inline nickname edit persists; title unchanged', async ({ page, request }) => {
    const seedTitle = `BIZ161 nick title ${Date.now()}`
    const { id } = await seedBookmarkedListing(request, seedTitle)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')

    const desk = page.getByTestId('triage-desktop-kanban')
    await expect(desk.getByTestId(`triage-tile-displayname-${id}`)).toHaveText(seedTitle)

    await desk.getByTestId(`triage-tile-nickname-edit-${id}`).click()
    const input = desk.getByTestId(`triage-tile-nickname-input-${id}`)
    await input.fill('My favorite')
    await input.press('Enter')

    await page.reload()
    await expect(desk.getByTestId(`triage-tile-displayname-${id}`)).toHaveText('My favorite')
    const row = await getBookmarkedListing(request, id)
    expect(row?.nickname).toBe('My favorite')
    expect(row?.title).toBe(seedTitle)
  })

  test('Pencil and displayName clicks do not open a dialog', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ161 bubble ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('triage-listing-modal')).toHaveCount(0)

    await desk.getByTestId(`triage-tile-nickname-edit-${id}`).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('triage-listing-modal')).toHaveCount(0)

    await desk.getByTestId(`triage-tile-nickname-input-${id}`).press('Escape')

    await desk.getByTestId(`triage-tile-displayname-${id}`).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('triage-listing-modal')).toHaveCount(0)
  })

  test('Secondary line shows beds baths address', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ161 sec ${Date.now()}`, {
      beds: 3,
      baths: 2,
      address: '123 Main St',
    })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const secondary = page.getByTestId('triage-desktop-kanban').getByTestId(`triage-tile-secondary-${id}`)
    await expect(secondary).toContainText('3 bd · 2 ba · 123 Main St')
  })
})
