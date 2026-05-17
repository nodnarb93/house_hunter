import { test, expect, type APIRequestContext } from '@playwright/test'

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

async function createRssScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz154-feed-${Date.now()}.xml` },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

async function seedOneBookmarked(request: APIRequestContext) {
  const scraperId = await createRssScraper(request)
  const huntRes = await request.post('/api/house-hunts', { data: { name: `BIZ154 hunt ${Date.now()}` } })
  expect(huntRes.status()).toBe(201)
  const huntId = ((await huntRes.json()) as { id: number }).id

  const seed = await request.post('/api/test/seed-listing', {
    data: {
      title: `BIZ154 listing ${Date.now()}`,
      link: `https://example.invalid/biz154-${Date.now()}`,
      hunt_id: huntId,
      scraper_id: scraperId,
      price_cents: 199_000_00,
    },
  })
  expect(seed.status()).toBe(201)
  const { id } = (await seed.json()) as { id: number }
  const patch = await request.patch(`/api/listings/${id}`, { data: { bookmarked: 1, stage: 'interested' } })
  expect(patch.status()).toBe(200)
  return { id }
}

test.describe('BIZ-154 mobile layout (bottom nav)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => window.localStorage.clear())
  })

  test('bottom nav visible; hamburger hidden; main padding symmetric with bottom inset', async ({ page }) => {
    await page.goto('/')

    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toHaveClass(/-translate-x-full/)
    await expect(page.getByTestId('sidebar-toggle')).toBeHidden()
    await expect(page.getByTestId('bottom-nav')).toBeVisible()

    const padding = await page.locator('main').evaluate((el) => {
      const cs = window.getComputedStyle(el)
      return { left: cs.paddingLeft, right: cs.paddingRight, bottom: cs.paddingBottom }
    })
    expect(padding.left).toBe('16px')
    expect(padding.right).toBe('16px')
    expect(padding.bottom).toBe('64px')
  })

  test('bottom nav tabs navigate without opening sidebar', async ({ page }) => {
    await page.goto('/dashboard')

    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toHaveClass(/-translate-x-full/)

    await page.getByTestId('bottom-nav-tab-hunts').click()
    await expect(page).toHaveURL(/\/hunts$/)
    await expect(sidebar).toHaveClass(/-translate-x-full/)
  })

  test('Triage first tab (Interested) is fully within viewport at 375px', async ({ page, request }) => {
    await wipeListings(request)
    await seedOneBookmarked(request)

    await page.goto('/triage')
    await expect(page.getByTestId('triage-board')).toBeVisible()

    const firstTab = page.getByTestId('triage-tab-interested')
    await expect(firstTab).toBeVisible()

    const box = await firstTab.boundingBox()
    expect(box).not.toBeNull()
    if (!box) return
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(375)
  })
})
