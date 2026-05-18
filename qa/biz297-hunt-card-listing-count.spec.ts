import { test, expect, type APIRequestContext } from '@playwright/test'

async function createHunt(request: APIRequestContext, name: string) {
  const res = await request.post('/api/house-hunts', { data: { name } })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

async function createScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz297-${Date.now()}-${Math.random()}` },
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
      link: `https://example.invalid/biz297-${Date.now()}-${Math.random()}`,
      hunt_id: opts.huntId,
      scraper_id: opts.scraperId,
    },
  })
  expect(res.status()).toBe(201)
}

test.describe('BIZ-297 HuntCard listing count', () => {
  const createdHuntIds: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of createdHuntIds) {
      await request.delete(`/api/house-hunts/${id}`).catch(() => {})
    }
    createdHuntIds.length = 0
  })

  test('renders plural, singular, and zero active listing counts', async ({ page, request }) => {
    const suffix = Date.now()
    const scraperId = await createScraper(request)

    const pluralName = `BIZ297 plural ${suffix}`
    const pluralId = await createHunt(request, pluralName)
    createdHuntIds.push(pluralId)
    await seedListing(request, { title: 'Listing A', huntId: pluralId, scraperId })
    await seedListing(request, { title: 'Listing B', huntId: pluralId, scraperId })

    const singularName = `BIZ297 singular ${suffix}`
    const singularId = await createHunt(request, singularName)
    createdHuntIds.push(singularId)
    await seedListing(request, { title: 'Only one', huntId: singularId, scraperId })

    const zeroName = `BIZ297 zero ${suffix}`
    const zeroId = await createHunt(request, zeroName)
    createdHuntIds.push(zeroId)

    const apiRes = await request.get('/api/house-hunts')
    expect(apiRes.status()).toBe(200)
    const apiHunts = (await apiRes.json()) as Array<{ id: number; active_listings_count: number }>
    expect(apiHunts.find((h) => h.id === pluralId)?.active_listings_count).toBe(2)
    expect(apiHunts.find((h) => h.id === singularId)?.active_listings_count).toBe(1)
    expect(apiHunts.find((h) => h.id === zeroId)?.active_listings_count).toBe(0)

    await page.goto('/hunts')
    await expect(page.getByTestId(`hunt-card-active-count-${pluralId}`)).toHaveText('2 active')
    await expect(page.getByTestId(`hunt-card-active-count-${singularId}`)).toHaveText('1 active')
    await expect(page.getByTestId(`hunt-card-active-count-${zeroId}`)).toHaveText('0 active')
  })
})
