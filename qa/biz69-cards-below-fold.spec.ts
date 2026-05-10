import { test, expect } from '@playwright/test'

/**
 * AC #7: below-the-fold cards should not pull every seeded CDN URL on first paint.
 * Threshold: total requests to ssl.cdn-redfin.com must stay below total seeded URLs (6 listings × 10).
 * ListingGallery mounts at most three slides (current ± 1); first paint uses two per card, so scroll alone
 * may not add requests. After scrolling the last card into view, advancing its carousel loads a third image.
 */
test.describe('BIZ-69 below-fold lazy CDN (AC #7)', () => {
  test.setTimeout(90_000)

  test('initial load does not request all seeded Redfin CDN URLs; carousel advances load more', async ({
    page,
    request,
  }) => {
    const uniq = Date.now()
    let cdnRequests = 0
    await page.route('**/ssl.cdn-redfin.com/**', async (route) => {
      cdnRequests += 1
      await route.continue()
    })

    const hunt = await request.post('/api/house-hunts', { data: { name: `BIZ-75 fold hunt ${uniq}` } })
    expect(hunt.status()).toBe(201)
    const { id: huntId } = (await hunt.json()) as { id: number }

    const listingIds: number[] = []
    const urlsPerListing = 10
    const listingCount = 6

    for (let i = 0; i < listingCount; i += 1) {
      const seed = await request.post('/api/test/seed-listing', {
        data: {
          title: `BIZ-75 fold listing ${i}`,
          hunt_id: huntId,
          link: `https://www.redfin.com/home/${uniq}-${i}`,
          price_cents: 300_000_00 + i * 1000,
          address: `${100 + i} Below Fold Ln`,
          beds: 2,
          baths: 2,
        },
      })
      expect(seed.status()).toBe(201)
      const { id: listingId } = (await seed.json()) as { id: number }
      listingIds.push(listingId)

      const urls = Array.from(
        { length: urlsPerListing },
        (_, j) => `https://ssl.cdn-redfin.com/photo/test/biz75fold/${uniq}_${i}_${j}_o.jpg`
      )
      const imgSeed = await request.post('/api/test/replace-listing-image-urls', {
        data: { listing_id: listingId, urls },
      })
      expect(imgSeed.status()).toBe(200)
    }

    const totalSeededUrls = listingCount * urlsPerListing

    await page.goto(`/hunts/${huntId}`)
    await page.waitForLoadState('networkidle')

    expect(cdnRequests).toBeLessThan(totalSeededUrls)

    const lazyAttrs = await page
      .locator('[data-testid="listing-gallery-main-img"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('loading')))
    expect(lazyAttrs.length).toBeGreaterThan(0)
    expect(lazyAttrs.every((v) => v === 'lazy')).toBe(true)

    const countBeforeAdvance = cdnRequests
    const firstCard = page.locator('[data-testid="hunt-result-card"]').first()
    await firstCard.scrollIntoViewIfNeeded()
    await expect(firstCard.locator('[data-testid="listing-gallery-main-img"]')).toBeVisible({ timeout: 20_000 })
    const nextBtn = firstCard.locator('[data-testid="listing-gallery-next"]')
    await expect(nextBtn).toBeVisible({ timeout: 20_000 })
    await nextBtn.click()
    await expect
      .poll(async () => cdnRequests, { timeout: 30_000 })
      .toBeGreaterThan(countBeforeAdvance)

    for (const id of listingIds) {
      await request.delete(`/api/test/listings/${id}`)
    }
    await request.delete(`/api/house-hunts/${huntId}`)
  })
})
