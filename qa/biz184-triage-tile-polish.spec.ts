import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test'

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

const biz184Seeds: { listingId: number; huntId: number; scraperId: number }[] = []

async function createRssScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz184-feed-${Date.now()}.xml` },
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
  const huntRes = await request.post('/api/house-hunts', { data: { name: `BIZ184 hunt ${Date.now()}` } })
  expect(huntRes.status()).toBe(201)
  const huntId = ((await huntRes.json()) as { id: number }).id

  const link = `https://example.invalid/biz184-listing-${Date.now()}`
  const seed = await request.post('/api/test/seed-listing', {
    data: {
      title,
      link,
      hunt_id: huntId,
      scraper_id: scraperId,
      price_cents: 310_000_00,
      ...extra,
    },
  })
  expect(seed.status()).toBe(201)
  const { id } = (await seed.json()) as { id: number }
  const patch = await request.patch(`/api/listings/${id}`, { data: { bookmarked: 1 } })
  expect(patch.status()).toBe(200)
  biz184Seeds.push({ listingId: id, huntId, scraperId })
  return { id, title, link }
}

function routeListingImages(context: BrowserContext, id: number, urls: string[]): Promise<void> {
  return context.route(`**/api/listings/${id}/images`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ urls }),
    })
  })
}

test.describe('BIZ-184 triage tile polish', () => {
  test.beforeEach(async ({ request }) => {
    await wipeListings(request)
  })

  test.afterEach(async ({ request }) => {
    while (biz184Seeds.length > 0) {
      const { listingId, huntId, scraperId } = biz184Seeds.pop()!
      await request.delete(`/api/test/listings/${listingId}`).catch(() => {})
      await request.delete(`/api/house-hunts/${huntId}`).catch(() => {})
      await request.delete(`/api/scrapers/${scraperId}`).catch(() => {})
    }
  })

  test('triage thumbnail click opens lightbox and not detail modal', async ({ page, context, request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ184 lightbox ${Date.now()}`, { image_url: null })
    await routeListingImages(context, id, ['https://example.invalid/lb-1.jpg'])

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')
    await desk.getByTestId(`triage-tile-thumb-trigger-${id}`).click()
    await expect(page.getByTestId('listing-lightbox-overlay')).toBeVisible()
    await expect(page.getByTestId('triage-listing-modal')).toHaveCount(0)
  })

  test('lightbox single vs multi image controls', async ({ page, context, request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ184 lb controls ${Date.now()}`, { image_url: null })

    await page.setViewportSize({ width: 1280, height: 800 })

    await routeListingImages(context, id, ['https://example.invalid/single.jpg'])
    await page.goto('/triage')
    await page.getByTestId('triage-desktop-kanban').getByTestId(`triage-tile-thumb-trigger-${id}`).click()
    await expect(page.getByTestId('listing-lightbox-overlay')).toBeVisible()
    await expect(page.getByTestId('listing-lightbox-prev')).toHaveCount(0)
    await expect(page.getByTestId('listing-lightbox-next')).toHaveCount(0)
    await page.getByTestId('listing-lightbox-close').click()
    await expect(page.getByTestId('listing-lightbox-overlay')).toHaveCount(0)

    await context.unroute(`**/api/listings/${id}/images`)
    await routeListingImages(context, id, [
      'https://example.invalid/m1.jpg',
      'https://example.invalid/m2.jpg',
      'https://example.invalid/m3.jpg',
    ])
    await page.reload()
    await page.getByTestId('triage-desktop-kanban').getByTestId(`triage-tile-thumb-trigger-${id}`).click()
    await expect(page.getByTestId('listing-lightbox-prev')).toBeVisible()
    await expect(page.getByTestId('listing-lightbox-next')).toBeVisible()
  })

  test('triage tile Listing button opens external link in new tab and does not open detail modal', async ({
    page,
    context,
    request,
  }) => {
    const { id, link } = await seedBookmarkedListing(request, `BIZ184 listing btn ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')
    const a = desk.getByTestId(`triage-tile-listing-link-${id}`)
    await expect(a).toHaveAttribute('href', link)
    await expect(a).toHaveAttribute('target', '_blank')
    await expect(a).toHaveAttribute('rel', 'noopener noreferrer')

    await context.route(link, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><head><title>stub</title></head><body>ok</body></html>',
      })
    })

    const popupPromise = context.waitForEvent('page')
    await a.click()
    const popup = await popupPromise
    expect(popup.url()).toBe(link)
    await popup.close()

    await expect
      .poll(async () => await page.getByTestId('triage-listing-modal').count(), { timeout: 2000 })
      .toBe(0)
  })

  test.describe('mobile viewport', () => {
    test.use({ viewport: { width: 375, height: 800 } })

    test('mobile triage tile has Listing+Stage footer row, stage select not full width', async ({ page, request }) => {
      const { id } = await seedBookmarkedListing(request, `BIZ184 mobile footer ${Date.now()}`)
      await page.goto('/triage')
      const mobile = page.getByTestId('triage-mobile-list')
      await expect(mobile.getByTestId(`triage-tile-listing-link-${id}`)).toBeVisible()
      const select = mobile.getByTestId(`triage-mobile-stage-select-${id}`)
      await expect(select).toBeVisible()

      const tileBox = await mobile.getByTestId(`triage-tile-${id}`).boundingBox()
      const selectBox = await select.boundingBox()
      expect(tileBox).toBeTruthy()
      expect(selectBox).toBeTruthy()
      expect(selectBox!.width).toBeLessThan(tileBox!.width * 0.95)
    })
  })

  test('desktop triage tile has only Listing button in footer, no stage select', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ184 desk footer ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')
    await expect(desk.getByTestId(`triage-tile-listing-link-${id}`)).toBeVisible()
    await expect(desk.getByTestId(`triage-mobile-stage-select-${id}`)).toHaveCount(0)
  })

  test('triage tile body click still opens detail modal', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ184 body click ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    const desk = page.getByTestId('triage-desktop-kanban')
    await desk.getByTestId(`triage-tile-secondary-${id}`).click()
    await expect(page.getByTestId('triage-listing-modal')).toBeVisible()
  })
})
