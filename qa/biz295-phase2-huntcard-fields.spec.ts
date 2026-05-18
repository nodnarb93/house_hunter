import { test, expect, type APIRequestContext } from '@playwright/test'

async function createHunt(request: APIRequestContext, name: string) {
  const res = await request.post('/api/house-hunts', { data: { name } })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

async function createScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz295-${Date.now()}-${Math.random()}` },
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
    scraped_at?: string
  },
) {
  const res = await request.post('/api/test/seed-listing', {
    data: {
      title: opts.title,
      link: `https://example.invalid/biz295-${Date.now()}-${Math.random()}`,
      hunt_id: opts.huntId,
      scraper_id: opts.scraperId,
      image_url: opts.image_url,
      scraped_at: opts.scraped_at ?? new Date().toISOString(),
    },
  })
  expect(res.status()).toBe(201)
  const { id } = (await res.json()) as { id: number }
  const patch = await request.patch(`/api/listings/${id}`, { data: { stage: 'interested' } })
  expect(patch.status()).toBe(200)
  return id
}

test.describe('BIZ-295 Phase 2 hunt card fields', () => {
  const createdHuntIds: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of createdHuntIds) {
      await request.delete(`/api/house-hunts/${id}`).catch(() => {})
    }
    createdHuntIds.length = 0
  })

  test('rich hunt renders cover, location, active count, scraped time, active status', async ({
    page,
    request,
  }) => {
    const suffix = Date.now()
    const name = `BIZ295 rich ${suffix}`
    const huntId = await createHunt(request, name)
    createdHuntIds.push(huntId)
    const scraperId = await createScraper(request)

    const put = await request.put(`/api/house-hunts/${huntId}`, {
      data: {
        filters: {
          location_text: 'Seattle, WA',
          min_beds: 3,
          min_price: 40_000_000,
          max_price: 70_000_000,
        },
        scraper_ids: [scraperId],
      },
    })
    expect(put.status()).toBe(200)

    await seedListing(request, {
      title: 'Rich listing',
      huntId,
      scraperId,
      image_url: 'https://example.invalid/biz295-cover.jpg',
      scraped_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    })

    await page.goto('/hunts')
    const card = page.getByTestId(`hunt-card-${huntId}`)
    await expect(card).toBeVisible()
    await expect(page.getByTestId(`hunt-card-cover-${huntId}`)).toBeVisible()
    const location = page.getByTestId(`hunt-card-location-${huntId}`)
    await expect(location).toContainText('Seattle, WA')
    await expect(location).toContainText('3+ bd')
    await expect(location).toContainText('$400k–$700k')
    await expect(page.getByTestId(`hunt-card-active-count-${huntId}`)).toHaveText('1 active')
    await expect(page.getByTestId(`hunt-card-last-scraped-${huntId}`)).toContainText('ago')
    await expect(page.getByTestId(`hunt-card-status-${huntId}`)).toHaveAttribute('data-status', 'active')
  })

  test('empty hunt renders placeholder, no location line, paused status', async ({ page, request }) => {
    const suffix = Date.now()
    const name = `BIZ295 empty ${suffix}`
    const huntId = await createHunt(request, name)
    createdHuntIds.push(huntId)

    await page.goto('/hunts')
    const card = page.getByTestId(`hunt-card-${huntId}`)
    await expect(card).toBeVisible()
    await expect(page.getByTestId(`hunt-card-cover-placeholder-${huntId}`)).toBeVisible()
    await expect(page.getByTestId(`hunt-card-location-${huntId}`)).toHaveCount(0)
    await expect(page.getByTestId(`hunt-card-active-count-${huntId}`)).toHaveText('0 active')
    await expect(page.getByTestId(`hunt-card-last-scraped-${huntId}`)).toHaveText('Not yet scraped')
    await expect(page.getByTestId(`hunt-card-status-${huntId}`)).toHaveAttribute('data-status', 'paused')
  })
})
