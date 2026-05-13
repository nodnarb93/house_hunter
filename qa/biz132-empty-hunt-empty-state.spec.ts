import { test, expect, type APIRequestContext } from '@playwright/test'

async function createRssScraper(request: APIRequestContext, suffix: string) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/feed-${suffix}-${Date.now()}.xml` },
  })
  expect(res.status()).toBe(201)
  return (await res.json()) as { id: number }
}

test('BIZ-132: hunt with no scrapers shows empty-state CTA while other scrapers have listings', async ({
  page,
  request,
}) => {
  let huntId: number | undefined
  let scraperId: number | undefined
  let listingId: number | undefined
  try {
    const scraper = await createRssScraper(request, 'biz132-empty')
    scraperId = scraper.id

    const seed = await request.post('/api/test/seed-listing', {
      data: {
        title: 'Other-scraper listing',
        link: `https://example.invalid/biz132-empty-${Date.now()}`,
        price_cents: 100_000_00,
        scraper_id: scraperId,
      },
    })
    expect(seed.status()).toBe(201)
    listingId = ((await seed.json()) as { id: number }).id

    const post = await request.post('/api/house-hunts', { data: { name: `BIZ132 empty ${Date.now()}` } })
    expect(post.status()).toBe(201)
    huntId = ((await post.json()) as { id: number }).id

    await page.goto(`/hunts/${huntId}`)
    await expect(page.getByTestId('hunt-detail-results-empty')).toBeVisible()
    await expect(page.getByTestId('hunt-detail-results-grid')).toHaveCount(0)
    await expect(page.getByTestId('configure-hunt-cta')).toBeVisible()
  } finally {
    if (huntId !== undefined) await request.delete(`/api/house-hunts/${huntId}`).catch(() => {})
    if (listingId !== undefined) await request.delete(`/api/test/listings/${listingId}`).catch(() => {})
    if (scraperId !== undefined) await request.delete(`/api/scrapers/${scraperId}`).catch(() => {})
  }
})
