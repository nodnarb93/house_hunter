import { test, expect } from '@playwright/test'

test.describe('BIZ-293 Phase 1 desktop layout unchanged', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => window.localStorage.clear())
  })

  test('bottom nav hidden, sidebar toggle and hunt list work', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(page.getByTestId('bottom-nav')).toHaveCount(0)
    await expect(page.getByTestId('sidebar-toggle')).toBeVisible()
    await expect(page.getByTestId('house-hunts-section')).toBeVisible()

    const sidebar = page.getByTestId('sidebar')
    await page.getByTestId('sidebar-toggle').click()
    await expect(sidebar).not.toHaveClass(/-translate-x-full/)
  })
})
