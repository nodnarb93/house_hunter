import { test, expect, type APIRequestContext } from '@playwright/test'

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

const cleanup: { listingId: number; huntId: number; scraperId: number }[] = []

async function createRssScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz167-feed-${Date.now()}.xml` },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

async function seedBookmarkedListing(
  request: APIRequestContext,
  opts: { title: string; image_url?: string | null },
) {
  const scraperId = await createRssScraper(request)
  const huntRes = await request.post('/api/house-hunts', { data: { name: `BIZ167 hunt ${Date.now()}` } })
  expect(huntRes.status()).toBe(201)
  const huntId = ((await huntRes.json()) as { id: number }).id

  const body: Record<string, unknown> = {
    title: opts.title,
    link: `https://example.invalid/biz167-${Date.now()}`,
    hunt_id: huntId,
    scraper_id: scraperId,
    price_cents: 199_000_00,
  }
  if ('image_url' in opts) {
    body.image_url = opts.image_url
  }

  const seed = await request.post('/api/test/seed-listing', { data: body })
  expect(seed.status()).toBe(201)
  const { id } = (await seed.json()) as { id: number }
  const patch = await request.patch(`/api/listings/${id}`, { data: { bookmarked: 1 } })
  expect(patch.status()).toBe(200)
  cleanup.push({ listingId: id, huntId, scraperId })
  return { id, title: opts.title }
}

type ListingRow = { id: number; image_url: string | null }

test.describe('BIZ-167 listings image_url fallback from listing_image_urls', () => {
  test.beforeEach(async ({ request }) => {
    await wipeListings(request)
  })

  test.afterEach(async ({ request }) => {
    while (cleanup.length > 0) {
      const { listingId, huntId, scraperId } = cleanup.pop()!
      await request.delete(`/api/test/listings/${listingId}`).catch(() => {})
      await request.delete(`/api/house-hunts/${huntId}`).catch(() => {})
      await request.delete(`/api/scrapers/${scraperId}`).catch(() => {})
    }
  })

  test('GET /api/listings returns fallback image_url from listing_image_urls', async ({ request }) => {
    const url = 'https://example.test/photo.jpg'
    const { id } = await seedBookmarkedListing(request, {
      title: `BIZ167 fallback ${Date.now()}`,
      image_url: null,
    })
    const rep = await request.post('/api/test/replace-listing-image-urls', {
      data: { listing_id: id, urls: [url] },
    })
    expect(rep.status()).toBe(200)

    const listRes = await request.get('/api/listings?bookmarked=1')
    expect(listRes.status()).toBe(200)
    const data = (await listRes.json()) as { listings: ListingRow[] }
    const row = data.listings.find((l) => l.id === id)
    expect(row).toBeTruthy()
    expect(row!.image_url).toBe(url)
  })

  test('GET /api/listings returns listings.image_url when set', async ({ request }) => {
    const primary = 'https://primary.test/x.jpg'
    const { id } = await seedBookmarkedListing(request, {
      title: `BIZ167 primary ${Date.now()}`,
      image_url: primary,
    })
    const rep = await request.post('/api/test/replace-listing-image-urls', {
      data: { listing_id: id, urls: ['https://gallery.test/other.jpg'] },
    })
    expect(rep.status()).toBe(200)

    const listRes = await request.get('/api/listings?bookmarked=1')
    expect(listRes.status()).toBe(200)
    const data = (await listRes.json()) as { listings: ListingRow[] }
    const row = data.listings.find((l) => l.id === id)
    expect(row!.image_url).toBe(primary)
  })

  test('GET /api/listings returns null image_url when no image source', async ({ request }) => {
    const { id } = await seedBookmarkedListing(request, {
      title: `BIZ167 noimg ${Date.now()}`,
      image_url: null,
    })

    const listRes = await request.get('/api/listings?bookmarked=1')
    expect(listRes.status()).toBe(200)
    const data = (await listRes.json()) as { listings: ListingRow[] }
    const row = data.listings.find((l) => l.id === id)
    expect(row!.image_url).toBeNull()
  })

  test('PATCH response carries fallback image_url', async ({ request }) => {
    const url = 'https://example.test/patch-fallback.jpg'
    const { id } = await seedBookmarkedListing(request, {
      title: `BIZ167 patch ${Date.now()}`,
      image_url: null,
    })
    const rep = await request.post('/api/test/replace-listing-image-urls', {
      data: { listing_id: id, urls: [url] },
    })
    expect(rep.status()).toBe(200)

    const patch = await request.patch(`/api/listings/${id}`, { data: { nickname: 'pw-fallback-nick' } })
    expect(patch.status()).toBe(200)
    const body = (await patch.json()) as ListingRow
    expect(body.image_url).toBe(url)
  })
})
