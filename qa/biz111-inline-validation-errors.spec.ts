import { test, expect } from '@playwright/test'

test.describe('BIZ-111 inline Redfin validation errors', () => {
  async function pickRedfin(page: import('@playwright/test').Page) {
    await page.getByTestId('scraper-source-type-dropdown').click()
    await page.getByRole('option', { name: /^Redfin$/i }).click()
  }

  test('section errors inline with DOM order and submit blocked', async ({ page }) => {
    await page.goto('/scrapers')
    await pickRedfin(page)

    const url = 'https://www.redfin.com/city/4664/OH/Columbus'
    await page.getByTestId('redfin-location-url').fill(url)
    await page.getByTestId('redfin-resolve-btn').click()
    await expect(page.getByText(/Resolved:/)).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('redfin-min-price').fill('500000')
    await page.getByTestId('redfin-max-price').fill('100000')
    await page.getByTestId('redfin-min-beds').fill('4')
    await page.getByTestId('redfin-max-beds').fill('2')
    await page.getByTestId('redfin-min-baths').fill('3')
    await page.getByTestId('redfin-max-baths').fill('1')

    const posts: string[] = []
    const onReq = (req: import('@playwright/test').Request) => {
      if (
        req.method() === 'POST' &&
        req.url().includes('/api/scraper-sources') &&
        !req.url().includes('resolve-redfin') &&
        !req.url().includes('/test')
      ) {
        posts.push(req.url())
      }
    }
    page.on('request', onReq)
    try {
      await page.getByTestId('redfin-form-submit').click()

      const priceErr = page.getByTestId('redfin-price-error')
      const bedsErr = page.getByTestId('redfin-beds-error')
      const bathsErr = page.getByTestId('redfin-baths-error')

      await expect(priceErr).toBeVisible()
      await expect(priceErr).toContainText('min_price is greater than max_price')
      await expect(bedsErr).toBeVisible()
      await expect(bedsErr).toContainText('min_beds is greater than max_beds')
      await expect(bathsErr).toBeVisible()
      await expect(bathsErr).toContainText('min_baths is greater than max_baths')

      const priceFieldset = page.getByRole('group', { name: 'Price ($)' })
      const bedsFieldset = page.getByRole('group', { name: 'Beds' })
      const bathsFieldset = page.getByRole('group', { name: 'Baths' })
      const uiptFieldset = page.getByRole('group', { name: 'Property type (uipt)' })

      const priceBox = await priceFieldset.boundingBox()
      const priceErrBox = await priceErr.boundingBox()
      const bedsBox = await bedsFieldset.boundingBox()
      expect(priceBox).toBeTruthy()
      expect(priceErrBox).toBeTruthy()
      expect(bedsBox).toBeTruthy()
      expect(priceErrBox!.y).toBeGreaterThan(priceBox!.y + priceBox!.height - 1)
      expect(priceErrBox!.y + priceErrBox!.height).toBeLessThan(bedsBox!.y + 1)

      const bedsErrBox = await bedsErr.boundingBox()
      const bathsBox = await bathsFieldset.boundingBox()
      expect(bedsErrBox).toBeTruthy()
      expect(bathsBox).toBeTruthy()
      expect(bedsErrBox!.y).toBeGreaterThan(bedsBox!.y + bedsBox!.height - 1)
      expect(bedsErrBox!.y + bedsErrBox!.height).toBeLessThan(bathsBox!.y + 1)

      const bathsErrBox = await bathsErr.boundingBox()
      const uiptBox = await uiptFieldset.boundingBox()
      expect(bathsErrBox).toBeTruthy()
      expect(uiptBox).toBeTruthy()
      expect(bathsErrBox!.y).toBeGreaterThan(bathsBox!.y + bathsBox!.height - 1)
      expect(bathsErrBox!.y + bathsErrBox!.height).toBeLessThan(uiptBox!.y + 1)

      await page.waitForTimeout(600)
      expect(posts).toEqual([])
    } finally {
      page.off('request', onReq)
    }
  })
})
