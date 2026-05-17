import { expect, test } from '@playwright/test'

test.describe('BIZ-105 / BIZ-106 — heading clears hamburger when sidebar closed (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/scrapers')
    await page.evaluate(() => window.localStorage.clear())
    await page.reload()
  })

  test('scrapers h1 is right of toggle when sidebar closed', async ({ page }) => {
    await page.getByTestId('sidebar-toggle').click()
    await expect(page.getByTestId('sidebar')).toHaveClass(/-translate-x-full/)

    const headingBox = await page.getByRole('heading', { level: 1 }).boundingBox()
    const toggleBox = await page.getByTestId('sidebar-toggle').boundingBox()
    expect(headingBox).not.toBeNull()
    expect(toggleBox).not.toBeNull()
    const intersects =
      headingBox!.x < toggleBox!.x + toggleBox!.width &&
      headingBox!.x + headingBox!.width > toggleBox!.x &&
      headingBox!.y < toggleBox!.y + toggleBox!.height &&
      headingBox!.y + headingBox!.height > toggleBox!.y
    expect(intersects).toBe(false)
  })
})

test.describe('BIZ-105 / BIZ-106 — heading clears hamburger when sidebar closed (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/scrapers')
    await page.evaluate(() => window.localStorage.clear())
    await page.reload()
  })

  test('scrapers h1 visible without hamburger; heading clears bottom nav', async ({ page }) => {
    await expect(page.getByTestId('sidebar-toggle')).toBeHidden()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const headingBox = await page.getByRole('heading', { level: 1 }).boundingBox()
    const bottomNavBox = await page.getByTestId('bottom-nav').boundingBox()
    expect(headingBox).not.toBeNull()
    expect(bottomNavBox).not.toBeNull()
    const intersects =
      headingBox!.y + headingBox!.height > bottomNavBox!.y &&
      headingBox!.x < bottomNavBox!.x + bottomNavBox!.width &&
      headingBox!.x + headingBox!.width > bottomNavBox!.x
    expect(intersects).toBe(false)
  })
})
