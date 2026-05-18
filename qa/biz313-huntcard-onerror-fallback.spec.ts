import { test, expect, type APIRequestContext } from '@playwright/test'

async function createHunt(request: APIRequestContext, name: string) {
  const res = await request.post('/api/house-hunts', { data: { name } })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

async function createScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz313-${Date.now()}-${Math.random()}` },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

async function seedListing(
  request: APIRequestContext,
  opts: {
    title: string
    huntId: number
    scraperId: number
    image_url: string
  },
) {
  const res = await request.post('/api/test/seed-listing', {
    data: {
      title: opts.title,
      link: `https://example.invalid/biz313-${Date.now()}-${Math.random()}`,
      hunt_id: opts.huntId,
      scraper_id: opts.scraperId,
      image_url: opts.image_url,
      scraped_at: new Date().toISOString(),
    },
  })
  expect(res.status()).toBe(201)
  const { id } = (await res.json()) as { id: number }
  const patch = await request.patch(`/api/listings/${id}`, { data: { stage: 'interested' } })
  expect(patch.status()).toBe(200)
  return id
}

test.describe('BIZ-313 HuntCard cover onError fallback', () => {
  const createdHuntIds: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of createdHuntIds) {
      await request.delete(`/api/house-hunts/${id}`).catch(() => {})
    }
    createdHuntIds.length = 0
  })

  test('broken cover URL shows placeholder after image load failure', async ({ page, request }) => {
    const suffix = Date.now()
    const name = `BIZ313 broken cover ${suffix}`
    const huntId = await createHunt(request, name)
    createdHuntIds.push(huntId)
    const scraperId = await createScraper(request)

    const put = await request.put(`/api/house-hunts/${huntId}`, {
      data: {
        filters: {},
        scraper_ids: [scraperId],
      },
    })
    expect(put.status()).toBe(200)

    const badUrl = `https://example.invalid/biz313-broken-${suffix}.jpg`
    await page.route(badUrl, async (route) => {
      await route.abort().catch(() => {})
    })

    await seedListing(request, {
      title: 'Broken cover listing',
      huntId,
      scraperId,
      image_url: badUrl,
    })

    try {
      await page.goto('/hunts')
      await expect(page.getByTestId(`hunt-card-cover-placeholder-${huntId}`)).toBeVisible()
      await expect(page.getByTestId(`hunt-card-cover-${huntId}`)).toHaveCount(0)
    } finally {
      await page.unroute(badUrl)
    }
  })
})
