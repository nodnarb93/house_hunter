import { test, expect, type APIRequestContext } from '@playwright/test'

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

const biz158TileSeeds: { listingId: number; huntId: number; scraperId: number }[] = []

async function createRssScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz158-tile-feed-${Date.now()}.xml` },
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
  const huntRes = await request.post('/api/house-hunts', { data: { name: `BIZ158 tile hunt ${Date.now()}` } })
  expect(huntRes.status()).toBe(201)
  const huntId = ((await huntRes.json()) as { id: number }).id

  const seed = await request.post('/api/test/seed-listing', {
    data: {
      title,
      link: `https://example.invalid/biz158-tile-${Date.now()}`,
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
  biz158TileSeeds.push({ listingId: id, huntId, scraperId })
  return { id, title, huntId }
}

type ListingJson = {
  id: number
  title: string
  nickname: string | null
  displayName?: string
  stage: string
}

async function getListingRow(request: APIRequestContext, id: number): Promise<ListingJson | undefined> {
  const listRes = await request.get('/api/listings?bookmarked=1')
  expect(listRes.status()).toBe(200)
  const data = (await listRes.json()) as { listings: ListingJson[] }
  return data.listings.find((l) => l.id === id)
}

test.describe('BIZ-158 / BIZ-160 triage tile + walkthrough column', () => {
  test.beforeEach(async ({ request }) => {
    await wipeListings(request)
  })

  test.afterEach(async ({ request }) => {
    while (biz158TileSeeds.length > 0) {
      const { listingId, huntId, scraperId } = biz158TileSeeds.pop()!
      await request.delete(`/api/test/listings/${listingId}`).catch(() => {})
      await request.delete(`/api/house-hunts/${huntId}`).catch(() => {})
      await request.delete(`/api/scrapers/${scraperId}`).catch(() => {})
    }
  })

  test('desktop column order and grid-cols-5', async ({ page, request }) => {
    await seedBookmarkedListing(request, `BIZ158 tile cols ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')

    const kanban = page.getByTestId('triage-desktop-kanban')
    await expect(kanban).toBeVisible()
    const ids = await kanban.evaluate((el) =>
      Array.from(el.querySelectorAll('[data-testid^="triage-column-"]'))
        .map((e) => e.getAttribute('data-testid'))
        .filter((t): t is string => !!t),
    )
    expect(ids).toEqual([
      'triage-column-interested',
      'triage-column-contacted',
      'triage-column-tour_scheduled',
      'triage-column-walkthrough',
      'triage-column-rejected',
    ])
    await expect(kanban).toHaveClass(/grid-cols-5/)
  })

  test('mobile tab order includes walkthrough', async ({ page, request }) => {
    await seedBookmarkedListing(request, `BIZ158 tile tabs ${Date.now()}`)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/triage')

    const tabStrip = page.getByTestId('triage-mobile-tabs')
    await expect(tabStrip).toBeVisible()
    const ids = await tabStrip.evaluate((el) =>
      Array.from(el.querySelectorAll('[data-testid^="triage-tab-"]'))
        .map((e) => e.getAttribute('data-testid'))
        .filter((t): t is string => !!t),
    )
    expect(ids).toEqual([
      'triage-tab-interested',
      'triage-tab-contacted',
      'triage-tab-tour_scheduled',
      'triage-tab-walkthrough',
      'triage-tab-rejected',
    ])
  })

  test('displayName shows title when nickname is null', async ({ page, request }) => {
    const title = 'Title Only'
    const { id } = await seedBookmarkedListing(request, title)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')
    await expect(desk.getByTestId(`triage-tile-displayname-${id}`)).toHaveText(title)
  })

  test('displayName shows nickname after PATCH', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ158 nick patch ${Date.now()}`)
    const nick = await request.patch(`/api/listings/${id}`, { data: { nickname: 'Pretty Name' } })
    expect(nick.status()).toBe(200)

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')
    await expect(desk.getByTestId(`triage-tile-displayname-${id}`)).toHaveText('Pretty Name')
  })

  test('pencil inline edit Enter saves and persists on GET', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ158 pencil ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')

    const desk = page.getByTestId('triage-desktop-kanban')
    await desk.getByTestId(`triage-tile-nickname-edit-${id}`).click()
    const input = desk.getByTestId(`triage-tile-nickname-input-${id}`)
    await input.fill('My House')
    await input.press('Enter')

    await expect(desk.getByTestId(`triage-tile-displayname-${id}`)).toHaveText('My House')
    const row = await getListingRow(request, id)
    expect(row?.nickname).toBe('My House')
  })

  test('pencil edit Escape discards without PATCH', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ158 esc ${Date.now()}`)
    const before = await getListingRow(request, id)
    expect(before?.nickname).toBeNull()

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')
    const priorLabel = (await desk.getByTestId(`triage-tile-displayname-${id}`).textContent()) ?? ''

    await desk.getByTestId(`triage-tile-nickname-edit-${id}`).click()
    await desk.getByTestId(`triage-tile-nickname-input-${id}`).fill('should-not-save')
    await desk.getByTestId(`triage-tile-nickname-input-${id}`).press('Escape')

    await expect(desk.getByTestId(`triage-tile-displayname-${id}`)).toHaveText(priorLabel)
    const after = await getListingRow(request, id)
    expect(after?.nickname).toBeNull()
  })

  test('thumbnail placeholder when image_url is null', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ158 noimg ${Date.now()}`, { image_url: null })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')
    await expect(desk.getByTestId('triage-tile-thumb-placeholder')).toBeVisible()
    expect(await desk.locator('[data-testid="triage-tile-thumb-img"]').count()).toBe(0)
  })

  test('thumbnail img mounts for seeded image_url', async ({ page, request }) => {
    const badUrl = 'https://example.invalid/x.jpg'
    let releaseImage: () => void = () => {}
    const imageStall = new Promise<void>((resolve) => {
      releaseImage = resolve
    })
    await page.route(badUrl, async (route) => {
      await imageStall
      // Duplicate fetches for the same URL can race; swallow "already handled".
      await route.abort().catch(() => {})
    })
    try {
      const { id } = await seedBookmarkedListing(request, `BIZ158 badimg ${Date.now()}`, { image_url: badUrl })
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto('/triage')

      const desk = page.getByTestId('triage-desktop-kanban')
      const img = desk.locator(`[data-testid="triage-tile-thumb-img"][src="${badUrl}"]`).first()
      await expect(img).toBeAttached({ timeout: 5000 })
      await expect(desk.getByTestId(`triage-tile-displayname-${id}`)).toBeVisible()
    } finally {
      releaseImage()
      await page.unroute(badUrl)
    }
  })

  test('drag listing from tour_scheduled to walkthrough', async ({ page, request }) => {
    const title = `BIZ158 drag ${Date.now()}`
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

    await expect(
      desk.getByTestId('triage-column-walkthrough').getByTestId(`triage-tile-displayname-${id}`),
    ).toBeVisible()
    const row = await getListingRow(request, id)
    expect(row?.stage).toBe('walkthrough')
  })

  test('secondary line testid when beds baths address all null', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ158 sec ${Date.now()}`, {
      beds: null,
      baths: null,
      address: null,
    })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')
    await expect(desk.getByTestId(`triage-tile-secondary-${id}`)).toBeVisible()
  })
})
