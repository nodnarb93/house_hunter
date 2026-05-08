import { test, expect } from '@playwright/test'

test.describe('BIZ-76 lightbox (URL-seeded gallery)', () => {
  test('opens from gallery main image; closes via Escape, backdrop click, and close control', async ({
    page,
    request,
  }) => {
    const uniq = Date.now()
    const hunt = await request.post('/api/house-hunts', { data: { name: `BIZ-76 lightbox hunt ${uniq}` } })
    expect(hunt.status()).toBe(201)
    const { id: huntId } = (await hunt.json()) as { id: number }

    const seed = await request.post('/api/test/seed-listing', {
      data: {
        title: 'BIZ-76 lightbox listing',
        hunt_id: huntId,
        link: `https://www.redfin.com/home/${uniq}`,
        price_cents: 500_000_00,
        address: '9 Lightbox Ln',
        beds: 2,
        baths: 2,
      },
    })
    expect(seed.status()).toBe(201)
    const { id: listingId } = (await seed.json()) as { id: number }

    const urls = [
      `https://ssl.cdn-redfin.com/photo/test/biz76/${uniq}_0_o.jpg`,
      `https://ssl.cdn-redfin.com/photo/test/biz76/${uniq}_1_o.jpg`,
    ]
    const imgSeed = await request.post('/api/test/replace-listing-image-urls', {
      data: { listing_id: listingId, urls },
    })
    expect(imgSeed.status()).toBe(200)

    await page.goto(`/hunts/${huntId}`)

    const card = page.locator(`[data-listing-id="${listingId}"]`)
    const mainImg = card.getByTestId('listing-gallery-main-img')
    await expect(mainImg).toBeVisible({ timeout: 20_000 })
    await expect(mainImg).toHaveAttribute('src', urls[0])

    await mainImg.click()
    const overlay = page.getByTestId('listing-lightbox-overlay')
    await expect(overlay).toBeVisible()
    await expect(page.getByTestId('listing-lightbox-img')).toHaveAttribute('src', urls[0])

    await page.keyboard.press('Escape')
    await expect(overlay).not.toBeVisible()

    await mainImg.click()
    await expect(overlay).toBeVisible()
    await overlay.click({ position: { x: 6, y: 6 } })
    await expect(overlay).not.toBeVisible()

    await mainImg.click()
    await expect(overlay).toBeVisible()
    await page.getByTestId('listing-lightbox-close').click()
    await expect(overlay).not.toBeVisible()

    await request.delete(`/api/test/listings/${listingId}`)
    await request.delete(`/api/house-hunts/${huntId}`)
  })
})
