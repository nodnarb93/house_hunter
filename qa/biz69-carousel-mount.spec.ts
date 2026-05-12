import { test, expect, type APIRequestContext } from '@playwright/test'

async function createRssScraper(request: APIRequestContext, suffix: string) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/feed-${suffix}-${Date.now()}.xml` },
  })
  expect(res.status()).toBe(201)
  return (await res.json()) as { id: number }
}

test.describe('BIZ-69 carousel mount cap (AC #6)', () => {
  test('listing gallery mounts at most three images and advances src when paging', async ({
    page,
    request,
  }) => {
    const uniq = Date.now()
    const hunt = await request.post('/api/house-hunts', { data: { name: `BIZ-75 mount hunt ${uniq}` } })
    expect(hunt.status()).toBe(201)
    const { id: huntId } = (await hunt.json()) as { id: number }

    const scraper = await createRssScraper(request, 'biz69-mount')
    const scraperId = scraper.id
    const huntPut = await request.put(`/api/house-hunts/${huntId}`, {
      data: { scraper_ids: [scraperId] },
    })
    expect(huntPut.status()).toBe(200)

    const seed = await request.post('/api/test/seed-listing', {
      data: {
        title: 'BIZ-75 carousel mount listing',
        hunt_id: huntId,
        link: `https://www.redfin.com/home/${uniq}`,
        price_cents: 400_000_00,
        address: '2 Carousel Mount Rd',
        beds: 2,
        baths: 2,
        scraper_id: scraperId,
      },
    })
    expect(seed.status()).toBe(201)
    const { id: listingId } = (await seed.json()) as { id: number }

    const urls = Array.from(
      { length: 10 },
      (_, i) => `https://ssl.cdn-redfin.com/photo/test/biz75/${uniq}_${i}_o.jpg`
    )
    const imgSeed = await request.post('/api/test/replace-listing-image-urls', {
      data: { listing_id: listingId, urls },
    })
    expect(imgSeed.status()).toBe(200)

    await page.goto(`/hunts/${huntId}`)

    const card = page.locator(`[data-listing-id="${listingId}"]`)
    await expect(card.getByTestId('listing-gallery')).toBeVisible()

    const assertCap = async () => {
      expect(await card.locator('img').count()).toBeLessThanOrEqual(3)
    }

    await assertCap()
    const mainImg = card.getByTestId('listing-gallery-main-img')
    await expect(mainImg).toBeVisible({ timeout: 20_000 })
    await expect(mainImg).toHaveAttribute('src', urls[0])

    await card.getByTestId('listing-gallery-next').click()
    await expect(mainImg).toHaveAttribute('src', urls[1])
    await assertCap()

    for (let i = 0; i < 5; i += 1) {
      await card.getByTestId('listing-gallery-next').click()
    }
    await assertCap()
    await expect(mainImg).toHaveAttribute('src', urls[6])

    await request.delete(`/api/test/listings/${listingId}`)
    await request.delete(`/api/house-hunts/${huntId}`)
    await request.delete(`/api/scrapers/${scraperId}`).catch(() => {})
  })
})
