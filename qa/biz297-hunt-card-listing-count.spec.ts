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
  test('renders plural, singular, and zero listing counts', async ({ page, request }) => {
    const suffix = Date.now()
    const scraperId = await createScraper(request)

    const pluralName = `BIZ297 plural ${suffix}`
    const pluralId = await createHunt(request, pluralName)
    await seedListing(request, { title: 'Listing A', huntId: pluralId, scraperId })
    await seedListing(request, { title: 'Listing B', huntId: pluralId, scraperId })

    const singularName = `BIZ297 singular ${suffix}`
    const singularId = await createHunt(request, singularName)
    await seedListing(request, { title: 'Only one', huntId: singularId, scraperId })

    const zeroName = `BIZ297 zero ${suffix}`
    const zeroId = await createHunt(request, zeroName)

    await page.goto('/hunts')
    await expect(page.getByTestId(`hunt-card-${pluralId}`)).toContainText('2 listings')
    await expect(page.getByTestId(`hunt-card-${singularId}`)).toContainText('1 listing')
    await expect(page.getByTestId(`hunt-card-${zeroId}`)).toContainText('0 listings')

    await request.delete(`/api/house-hunts/${pluralId}`)
    await request.delete(`/api/house-hunts/${singularId}`)
    await request.delete(`/api/house-hunts/${zeroId}`)
  })
})
