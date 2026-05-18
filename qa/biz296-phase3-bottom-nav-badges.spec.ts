import { test, expect } from '@playwright/test'

test.describe('BIZ-296 Phase 3 bottom nav badges', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => window.localStorage.clear())
  })

  test('shows dashboard and hunts badges when counts are non-zero', async ({ page }) => {
    await page.route('**/api/activity-summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ unviewedMatchesCount: 5, huntsWithNewListingsCount: 2 }),
      })
    })
    await page.goto('/dashboard')
    await expect(page.getByTestId('bottom-nav-badge-dashboard')).toBeVisible()
    await expect(page.getByTestId('bottom-nav-badge-dashboard')).toContainText('5')
    await expect(page.getByTestId('bottom-nav-badge-hunts')).toBeVisible()
    await expect(page.getByTestId('bottom-nav-badge-hunts')).toContainText('2')
  })

  test('hides badges when counts are zero', async ({ page }) => {
    await page.route('**/api/activity-summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ unviewedMatchesCount: 0, huntsWithNewListingsCount: 0 }),
      })
    })
    await page.goto('/dashboard')
    await expect(page.getByTestId('bottom-nav-badge-dashboard')).toHaveCount(0)
    await expect(page.getByTestId('bottom-nav-badge-hunts')).toHaveCount(0)
  })

  test('settings tab never renders a badge', async ({ page }) => {
    await page.route('**/api/activity-summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ unviewedMatchesCount: 9, huntsWithNewListingsCount: 4 }),
      })
    })
    await page.goto('/settings')
    await expect(page.locator('[data-testid^="bottom-nav-badge-settings"]')).toHaveCount(0)
  })
})
