import { test, expect } from '@playwright/test'

test.describe('Hunt images display', () => {
  let huntId: number | undefined
  let listingId: number | undefined

  test.beforeEach(() => {
    huntId = undefined
    listingId = undefined
  })

  test.afterEach(async ({ request }) => {
    if (listingId != null) {
      await request.delete(`/api/test/listings/${listingId}`)
    }
    if (huntId != null) {
      await request.delete(`/api/house-hunts/${huntId}`)
    }
    listingId = undefined
    huntId = undefined
  })

  test('Seeded listing images render in hunt detail page (not "No image")', async ({ page, request }) => {
    const uniq = Date.now()
    const seedUrl = `https://www.redfin.com/home/${uniq}`

    const hunt = await request.post('/api/house-hunts', { data: { name: `BIZ-63 hunt ${uniq}` } })
    expect(hunt.status()).toBe(201)
    ;({ id: huntId } = (await hunt.json()) as { id: number })

    const seed = await request.post('/api/test/seed-listing', {
      data: {
        title: 'BIZ-63 Redfin-shaped listing',
        hunt_id: huntId,
        link: seedUrl,
        price_cents: 123_000_00,
        address: '1 Image Test St',
        beds: 3,
        baths: 2,
      },
    })
    expect(seed.status()).toBe(201)
    ;({ id: listingId } = (await seed.json()) as { id: number })

    const imgSeed = await request.post('/api/test/replace-listing-image-urls', {
      data: {
        listing_id: listingId,
        urls: ['https://ssl.cdn-redfin.com/photo/1/mbphotowidth/79708871_0_o.jpg'],
      },
    })
    expect(imgSeed.status()).toBe(200)

    await page.goto(`/hunts/${huntId}`)

    const listingCard = page.locator(`[data-listing-id="${listingId}"]`)
    await expect(listingCard.getByTestId('listing-gallery')).toBeVisible()
    await expect(listingCard.getByTestId('listing-gallery-empty')).toHaveCount(0)

    const mainImg = listingCard.getByTestId('listing-gallery-main-img').first()
    await expect(mainImg).toBeVisible({ timeout: 20_000 })
    await expect(mainImg).toHaveAttribute('src', /.+/)
  })
})

