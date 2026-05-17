import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

const seeds: { listingId: number; huntId: number; scraperId: number }[] = []

async function createRssScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz290-gallery-feed-${Date.now()}.xml` },
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
  const huntRes = await request.post('/api/house-hunts', { data: { name: `BIZ290 gallery hunt ${Date.now()}` } })
  expect(huntRes.status()).toBe(201)
  const huntId = ((await huntRes.json()) as { id: number }).id

  const seed = await request.post('/api/test/seed-listing', {
    data: {
      title,
      link: `https://example.invalid/biz290-gallery-${Date.now()}`,
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
  return { id, title, huntId, scraperId }
}

async function replaceListingImages(request: APIRequestContext, listingId: number, urls: string[]) {
  const imgSeed = await request.post('/api/test/replace-listing-image-urls', {
    data: { listing_id: listingId, urls },
  })
  expect(imgSeed.status()).toBe(200)
}

function deskTile(page: Page, listingId: number) {
  return page.getByTestId('triage-desktop-kanban').getByTestId(`triage-tile-${listingId}`)
}

async function openModalFromTile(page: Page, listingId: number) {
  await deskTile(page, listingId).getByTestId(`triage-tile-secondary-${listingId}`).click()
  await expect(page.getByTestId('triage-listing-modal')).toBeVisible()
}

function modal(page: Page) {
  return page.getByTestId('triage-listing-modal')
}

test.describe('BIZ-290 triage modal gallery + address', () => {
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

  test('gallery region renders above stage sections on modal open', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Gallery slot ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await openModalFromTile(page, id)

    const galleryRegion = modal(page).locator(
      '[data-testid="listing-gallery"], [data-testid="listing-gallery-empty"], [data-testid="listing-gallery-loading"]',
    )
    await expect(galleryRegion.first()).toBeVisible()
    await expect(page.getByTestId('triage-detail-section-interested')).toBeVisible()
  })

  test('single-image listing: no carousel chrome', async ({ page, request }) => {
    const uniq = Date.now()
    const { id } = await seedBookmarkedListing(request, `Single img ${uniq}`)
    await replaceListingImages(request, id, [
      `https://ssl.cdn-redfin.com/photo/test/biz290/${uniq}_0_o.jpg`,
    ])
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await openModalFromTile(page, id)

    const m = modal(page)
    await expect(m.getByTestId('listing-gallery-main-img')).toBeVisible({ timeout: 20_000 })
    await expect(m.getByTestId('listing-gallery-prev')).toHaveCount(0)
    await expect(m.getByTestId('listing-gallery-next')).toHaveCount(0)
    await expect(m.getByText(/\d+\/\d+/)).toHaveCount(0)
  })

  test('multi-image listing: carousel controls + counter functional', async ({ page, request }) => {
    const uniq = Date.now()
    const { id } = await seedBookmarkedListing(request, `Multi img ${uniq}`)
    await replaceListingImages(request, id, [
      `https://ssl.cdn-redfin.com/photo/test/biz290/${uniq}_0_o.jpg`,
      `https://ssl.cdn-redfin.com/photo/test/biz290/${uniq}_1_o.jpg`,
    ])
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await openModalFromTile(page, id)

    const m = modal(page)
    await expect(m.getByTestId('listing-gallery-main-img')).toBeVisible({ timeout: 20_000 })
    await expect(m.getByTestId('listing-gallery-prev')).toBeVisible()
    await expect(m.getByTestId('listing-gallery-next')).toBeVisible()
    await expect(m.getByText('1/2')).toBeVisible()
    await m.getByTestId('listing-gallery-next').click()
    await expect(m.getByText('2/2')).toBeVisible()
    await m.getByTestId('listing-gallery-prev').click()
    await expect(m.getByText('1/2')).toBeVisible()
  })

  test('no-image listing: "No image" placeholder visible', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `No img ${Date.now()}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await openModalFromTile(page, id)

    await expect(modal(page).getByTestId('listing-gallery-empty')).toBeVisible({ timeout: 20_000 })
  })

  test('address visible when present', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Addr present ${Date.now()}`, {
      address: '123 Main St',
    })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await openModalFromTile(page, id)

    await expect(page.getByTestId('triage-listing-modal-address')).toHaveText('123 Main St')
  })

  test('address omitted when null', async ({ page, request }) => {
    const { id } = await seedBookmarkedListing(request, `Addr absent ${Date.now()}`, { address: null })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await openModalFromTile(page, id)

    await expect(page.getByTestId('triage-listing-modal-address')).toHaveCount(0)
  })

  test('lightbox opens above modal; notes preserved through lightbox cycle', async ({ page, request }) => {
    const uniq = Date.now()
    const { id } = await seedBookmarkedListing(request, `Lightbox notes ${uniq}`)
    await replaceListingImages(request, id, [
      `https://ssl.cdn-redfin.com/photo/test/biz290/${uniq}_0_o.jpg`,
      `https://ssl.cdn-redfin.com/photo/test/biz290/${uniq}_1_o.jpg`,
    ])
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await openModalFromTile(page, id)

    const notes = page.getByTestId('triage-detail-field-interested_notes')
    await notes.fill('temporary draft I am writing')

    const mainImg = modal(page).getByTestId('listing-gallery-main-img')
    await expect(mainImg).toBeVisible({ timeout: 20_000 })
    await mainImg.click()

    await expect(page.getByTestId('listing-lightbox-overlay')).toBeVisible()
    await expect(page.getByTestId('triage-listing-modal')).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('listing-lightbox-overlay')).toHaveCount(0)
    await expect(page.getByTestId('triage-listing-modal')).toBeVisible()
    await expect(notes).toHaveValue('temporary draft I am writing')
  })

  test('closing modal dismisses any open lightbox', async ({ page, request }) => {
    const uniq = Date.now()
    const { id } = await seedBookmarkedListing(request, `Close stack ${uniq}`)
    await replaceListingImages(request, id, [
      `https://ssl.cdn-redfin.com/photo/test/biz290/${uniq}_0_o.jpg`,
      `https://ssl.cdn-redfin.com/photo/test/biz290/${uniq}_1_o.jpg`,
    ])
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/triage')
    await openModalFromTile(page, id)

    const mainImg = modal(page).getByTestId('listing-gallery-main-img')
    await expect(mainImg).toBeVisible({ timeout: 20_000 })
    await mainImg.click()
    await expect(page.getByTestId('listing-lightbox-overlay')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('listing-lightbox-overlay')).toHaveCount(0)
    await expect(page.getByTestId('triage-listing-modal')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('listing-lightbox-overlay')).toHaveCount(0)
    await expect(page.getByTestId('triage-listing-modal')).toHaveCount(0)
  })
})
