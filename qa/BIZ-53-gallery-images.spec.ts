import { test, expect } from '@playwright/test'

/** Minimal valid WebP blobs (2×2 px) for test DB seeding — generated via sharp. */
const WEBP_RED =
  'UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA='
const WEBP_BLUE =
  'UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoCAAIAAUAmJaACdLoAA5gA/vtV4/+lwf/S4P/pcH/pcH8bss4bpAAA'

test.describe.configure({ mode: 'serial' })

test.describe('BIZ-53 gallery images', () => {
  test('GET /api/listings/:id/images/count and /images/0 serve WebP', async ({ request }) => {
    const seed = await request.post('/api/test/seed-listing', {
      data: {
        title: 'BIZ-53 Gallery API',
        link: `https://example.invalid/biz53-api-${Date.now()}`,
        price_cents: 250_000_00,
        address: '1 Test St',
        beds: 2,
        baths: 2,
      },
    })
    expect(seed.status()).toBe(201)
    const { id } = (await seed.json()) as { id: number }

    const imgSeed = await request.post('/api/test/seed-listing-images', {
      data: { listing_id: id, images_base64: [WEBP_RED, WEBP_BLUE] },
    })
    expect(imgSeed.status()).toBe(200)

    const countRes = await request.get(`/api/listings/${id}/images/count`)
    expect(countRes.status()).toBe(200)
    expect(((await countRes.json()) as { count: number }).count).toBe(2)

    const blob = await request.get(`/api/listings/${id}/images/0`)
    expect(blob.status()).toBe(200)
    expect(blob.headers()['content-type'] ?? '').toContain('image/webp')
    const buf = Buffer.from(await blob.body())
    expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(buf.subarray(8, 12).toString('ascii')).toBe('WEBP')

    await request.delete(`/api/test/listings/${id}`)
  })

  test('Hunt detail: carousel changes image src; lightbox opens, Escape and backdrop close', async ({
    page,
    request,
  }) => {
    const hunt = await request.post('/api/house-hunts', { data: { name: `BIZ-53 hunt ${Date.now()}` } })
    expect(hunt.status()).toBe(201)
    const { id: huntId } = (await hunt.json()) as { id: number }

    const seed = await request.post('/api/test/seed-listing', {
      data: {
        title: 'BIZ-53 UI Listing',
        hunt_id: huntId,
        link: `https://example.invalid/biz53-ui-${Date.now()}`,
        price_cents: 100_000_00,
        address: '9 Gallery Ln',
        beds: 3,
        baths: 2,
      },
    })
    expect(seed.status()).toBe(201)
    const { id: listingId } = (await seed.json()) as { id: number }

    const cdnA = 'https://ssl.cdn-redfin.com/photo/1/mbphotowidth/79708871_0_o.jpg'
    const cdnB = 'https://ssl.cdn-redfin.com/photo/1/mbphotowidth/79708871_1_o.jpg'
    const imgSeed = await request.post('/api/test/replace-listing-image-urls', {
      data: { listing_id: listingId, urls: [cdnA, cdnB] },
    })
    expect(imgSeed.status()).toBe(200)

    await page.goto(`/hunts/${huntId}`)

    const mainImg = page.getByTestId('listing-gallery-main-img').first()
    await expect(mainImg).toBeVisible({ timeout: 20_000 })
    const firstSrc = await mainImg.getAttribute('src')
    await page.getByTestId('listing-gallery-next').first().click()
    await expect(mainImg).toHaveAttribute('src', cdnB)
    const secondSrc = await mainImg.getAttribute('src')
    expect(firstSrc).toBeTruthy()
    expect(secondSrc).toBeTruthy()
    expect(firstSrc).not.toEqual(secondSrc)

    await mainImg.click()
    await expect(page.getByTestId('listing-lightbox-overlay')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('listing-lightbox-overlay')).toHaveCount(0)

    await mainImg.click()
    await expect(page.getByTestId('listing-lightbox-overlay')).toBeVisible()
    await page.getByTestId('listing-lightbox-overlay').click({ position: { x: 5, y: 5 } })
    await expect(page.getByTestId('listing-lightbox-overlay')).toHaveCount(0)

    await request.delete(`/api/house-hunts/${huntId}`)
    await request.delete(`/api/test/listings/${listingId}`)
  })
})
