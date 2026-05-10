import { test, expect } from '@playwright/test'

test.describe('BIZ-69 child 3: pipeline writes image URLs', () => {
  test('backfill fills listing_image_urls from Redfin fixture; GET /images returns CDN URLs; INSERT OR IGNORE is idempotent', async ({
    request,
  }) => {
    const uniq = Date.now()
    const seed = await request.post('/api/test/seed-listing', {
      data: {
        title: 'BIZ-74 URL pipeline seed',
        link: `https://www.redfin.com/OH/Columbus/999-test/home/79708871?biz74=${uniq}`,
        mls_number: '226013015',
        price_cents: 400_000_00,
        address: '1 Pipeline Rd',
        beds: 2,
        baths: 2,
      },
    })
    expect(seed.status()).toBe(201)
    const { id } = (await seed.json()) as { id: number }

    const backfill = await request.post(`/api/listings/backfill-images?listing_id=${id}`)
    expect(backfill.status()).toBe(200)

    const imagesRes = await request.get(`/api/listings/${id}/images`)
    expect(imagesRes.ok()).toBeTruthy()
    const { urls } = (await imagesRes.json()) as { urls: string[] }
    expect(urls.length).toBeGreaterThanOrEqual(1)
    expect(urls.some((u) => u.includes('ssl.cdn-redfin.com'))).toBeTruthy()

    const n1 = urls.length

    const dup1 = await request.post('/api/test/replace-listing-image-urls', {
      data: { listing_id: id, urls },
    })
    expect(dup1.status()).toBe(200)
    const j1 = (await dup1.json()) as { rowCount: number }
    expect(j1.rowCount).toBe(n1)

    const dup2 = await request.post('/api/test/replace-listing-image-urls', {
      data: { listing_id: id, urls },
    })
    expect(dup2.status()).toBe(200)
    const j2 = (await dup2.json()) as { rowCount: number }
    expect(j2.rowCount).toBe(n1)

    const images2 = await request.get(`/api/listings/${id}/images`)
    const body2 = (await images2.json()) as { urls: string[] }
    expect(body2.urls.length).toBe(n1)

    await request.delete(`/api/test/listings/${id}`)
  })
})
