import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

async function createHunt(request: APIRequestContext, name: string) {
  const res = await request.post('/api/house-hunts', { data: { name } })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

async function createScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz295-sort-${Date.now()}-${Math.random()}` },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

async function seedListing(
  request: APIRequestContext,
  opts: { title: string; huntId: number; scraperId: number },
) {
  const res = await request.post('/api/test/seed-listing', {
    data: {
      title: opts.title,
      link: `https://example.invalid/biz295-sort-${Date.now()}-${Math.random()}`,
      hunt_id: opts.huntId,
      scraper_id: opts.scraperId,
      scraped_at: new Date().toISOString(),
    },
  })
  expect(res.status()).toBe(201)
}

async function cardY(page: Page, huntId: number) {
  const box = await page.getByTestId(`hunt-card-${huntId}`).boundingBox()
  return box?.y ?? 0
}

test.describe('BIZ-295 Phase 2 hunts sort', () => {
  const createdHuntIds: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of createdHuntIds) {
      await request.delete(`/api/house-hunts/${id}`).catch(() => {})
    }
    createdHuntIds.length = 0
  })

  test('recent activity vs alphabetical ordering', async ({ page, request }) => {
    const suffix = Date.now()
    const zetaName = `Zeta hunt ${suffix}`
    const alphaName = `Alpha hunt ${suffix}`
    const zetaId = await createHunt(request, zetaName)
    const alphaId = await createHunt(request, alphaName)
    createdHuntIds.push(zetaId, alphaId)
    const scraperId = await createScraper(request)

    const wireZeta = await request.put(`/api/house-hunts/${zetaId}`, {
      data: { scraper_ids: [scraperId] },
    })
    expect(wireZeta.status()).toBe(200)
    await seedListing(request, { title: 'Zeta listing', huntId: zetaId, scraperId })

    await page.goto('/hunts')
    await expect(page.getByTestId(`hunt-card-${zetaId}`)).toBeVisible()
    await expect(page.getByTestId(`hunt-card-${alphaId}`)).toBeVisible()

    await expect
      .poll(async () => (await cardY(page, zetaId)) < (await cardY(page, alphaId)))
      .toBe(true)
    let zetaY = await cardY(page, zetaId)
    let alphaY = await cardY(page, alphaId)
    expect(zetaY).toBeLessThan(alphaY)

    await page.getByTestId('hunts-overview-sort').selectOption('alpha')
    await expect
      .poll(async () => (await cardY(page, alphaId)) < (await cardY(page, zetaId)))
      .toBe(true)
    zetaY = await cardY(page, zetaId)
    alphaY = await cardY(page, alphaId)
    expect(alphaY).toBeLessThan(zetaY)
  })
})
