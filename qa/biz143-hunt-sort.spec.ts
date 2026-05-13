import { test, expect, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test.describe('BIZ-143 hunt sort dropdown and persisted default', () => {
  let scraperId = 0
  let huntAId = 0
  let huntBId = 0
  let idLow = 0
  let idMid = 0
  let idHigh = 0

  test.beforeAll(async ({ request }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const feedUrl = `https://example.com/biz143-sort-${suffix}.xml`

    const scraperRes = await request.post('/api/scraper-sources', { data: { url: feedUrl } })
    expect(scraperRes.status()).toBe(201)
    const scraper = (await scraperRes.json()) as { id: number }
    scraperId = scraper.id

    const huntARes = await request.post('/api/house-hunts', { data: { name: `BIZ-143 Hunt A ${suffix}` } })
    expect(huntARes.status()).toBe(201)
    huntAId = (await huntARes.json() as { id: number }).id

    const putA = await request.put(`/api/house-hunts/${huntAId}`, { data: { scraper_ids: [scraperId] } })
    expect(putA.status()).toBe(200)

    const huntBRes = await request.post('/api/house-hunts', { data: { name: `BIZ-143 Hunt B ${suffix}` } })
    expect(huntBRes.status()).toBe(201)
    huntBId = (await huntBRes.json() as { id: number }).id

    const putB = await request.put(`/api/house-hunts/${huntBId}`, { data: { scraper_ids: [scraperId] } })
    expect(putB.status()).toBe(200)

    async function seedListing(body: Record<string, unknown>) {
      const res = await request.post('/api/test/seed-listing', { data: body })
      expect(res.status()).toBe(201)
      return (await res.json() as { id: number }).id
    }

    idLow = await seedListing({
      title: 'Low',
      link: `https://example.com/biz143-listing-low-${suffix}`,
      price_cents: 50_000,
      scraped_at: '2020-01-01T00:00:00.000Z',
      scraper_id: scraperId,
    })
    idMid = await seedListing({
      title: 'Mid',
      link: `https://example.com/biz143-listing-mid-${suffix}`,
      price_cents: 200_000,
      scraped_at: '2020-01-02T00:00:00.000Z',
      scraper_id: scraperId,
    })
    idHigh = await seedListing({
      title: 'High',
      link: `https://example.com/biz143-listing-high-${suffix}`,
      price_cents: 500_000,
      scraped_at: '2020-01-03T00:00:00.000Z',
      scraper_id: scraperId,
    })

    const patchBm = await request.patch(`/api/listings/${idMid}`, { data: { bookmarked: 1 } })
    expect(patchBm.status()).toBe(200)

    const priceAscRes = await request.get(`/api/house-hunts/${huntAId}/results?sort=price_asc`)
    expect(priceAscRes.status()).toBe(200)
    const priceAscIds = ((await priceAscRes.json()) as { id: number }[]).map((x) => x.id)
    expect(priceAscIds).toEqual([idLow, idMid, idHigh])
  })

  async function listingOrder(page: Page) {
    return page.locator('[data-testid="hunt-result-card"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-listing-id'))
    )
  }

  test('AC1 dropdown options and AC2 reorder (price_asc + bookmarked_first)', async ({ page }) => {
    await page.goto(`/hunts/${huntAId}`)
    await page.waitForLoadState('networkidle')

    const sort = page.locator('[data-testid="hunt-detail-sort"]')
    await expect(sort).toBeVisible()
    await expect(sort.locator('option')).toHaveCount(5)

    const initial = await listingOrder(page)
    expect(initial).toEqual([String(idHigh), String(idMid), String(idLow)])

    const priceAscRespPromise = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        r.url().includes(`/api/house-hunts/${huntAId}/results`) &&
        new URL(r.url()).searchParams.get('sort') === 'price_asc' &&
        r.ok()
    )
    await sort.selectOption('price_asc')
    const priceAscResp = await priceAscRespPromise
    const priceBody = (await priceAscResp.json()) as { id: number }[]
    expect(priceBody.map((x) => x.id)).toEqual([idLow, idMid, idHigh])
    await expect(sort).toHaveValue('price_asc')
    await expect.poll(async () => listingOrder(page)).toEqual([String(idLow), String(idMid), String(idHigh)])

    const bmRespPromise = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        r.url().includes(`/api/house-hunts/${huntAId}/results`) &&
        new URL(r.url()).searchParams.get('sort') === 'bookmarked_first' &&
        r.ok()
    )
    await sort.selectOption('bookmarked_first')
    const bmResp = await bmRespPromise
    const bmBody = (await bmResp.json()) as { id: number }[]
    expect(bmBody.map((x) => x.id)).toEqual([idMid, idHigh, idLow])
    await expect(sort).toHaveValue('bookmarked_first')
    await expect.poll(async () => listingOrder(page)).toEqual([String(idMid), String(idHigh), String(idLow)])
  })

  test('AC3 persisted default_listing_sort in settings', async ({ request }) => {
    const res = await request.get('/api/settings')
    expect(res.status()).toBe(200)
    const body = (await res.json()) as Record<string, string>
    expect(body.default_listing_sort).toBe('bookmarked_first')
  })

  test('AC4 reload keeps dropdown and first-paint order', async ({ page }) => {
    await page.goto(`/hunts/${huntAId}`)
    await page.waitForLoadState('networkidle')
    const sort = page.locator('[data-testid="hunt-detail-sort"]')
    await expect(sort).toHaveValue('bookmarked_first')
    const order = await listingOrder(page)
    expect(order[0]).toBe(String(idMid))
  })

  test('AC5 allowlist and SQL injection attempts', async ({ request }) => {
    const badSort = await request.get(`/api/house-hunts/${huntAId}/results?sort=bogus`)
    expect(badSort.status()).toBe(400)
    const badJson = (await badSort.json()) as { error?: string }
    expect(badJson.error).toBeTruthy()

    const inj = "'; DROP TABLE listings;--"
    const injRes = await request.get(
      `/api/house-hunts/${huntAId}/results?sort=${encodeURIComponent(inj)}`
    )
    expect(injRes.status()).toBe(400)

    const badPut = await request.put('/api/settings', { data: { default_listing_sort: 'bogus' } })
    expect(badPut.status()).toBe(400)

    const still = await request.get(`/api/house-hunts/${huntAId}/results`)
    expect(still.status()).toBe(200)
    const rows = (await still.json()) as { id: number }[]
    expect(rows.length).toBeGreaterThanOrEqual(3)
    const ids = new Set(rows.map((r) => r.id))
    expect(ids.has(idLow)).toBe(true)
    expect(ids.has(idMid)).toBe(true)
    expect(ids.has(idHigh)).toBe(true)
  })

  test('AC6 GET /results without sort uses persisted default', async ({ page, request }) => {
    await page.goto(`/hunts/${huntAId}`)
    await page.waitForLoadState('networkidle')
    await page.locator('[data-testid="hunt-detail-sort"]').selectOption('price_asc')
    await page.waitForLoadState('networkidle')

    const res = await request.get(`/api/house-hunts/${huntAId}/results`)
    expect(res.status()).toBe(200)
    const rows = (await res.json()) as { id: number }[]
    const ids = rows.map((r) => r.id)
    const pos = (id: number) => ids.indexOf(id)
    expect(pos(idLow)).toBeLessThan(pos(idMid))
    expect(pos(idMid)).toBeLessThan(pos(idHigh))
  })

  test('AC7 global default applies to second hunt', async ({ page }) => {
    await page.goto(`/hunts/${huntAId}`)
    await page.waitForLoadState('networkidle')
    await page.locator('[data-testid="hunt-detail-sort"]').selectOption('price_desc')
    await page.waitForLoadState('networkidle')

    await page.goto(`/hunts/${huntBId}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('[data-testid="hunt-detail-sort"]')).toHaveValue('price_desc')
    const order = await listingOrder(page)
    expect(order).toEqual([String(idHigh), String(idMid), String(idLow)])
  })
})
