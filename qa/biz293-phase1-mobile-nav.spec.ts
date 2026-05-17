import { test, expect } from '@playwright/test'

test.describe('BIZ-293 Phase 1 mobile bottom nav', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => window.localStorage.clear())
  })

  test('bottom nav visible, hamburger hidden, tabs navigate with active state', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(page.getByTestId('bottom-nav')).toBeVisible()
    await expect(page.getByTestId('sidebar-toggle')).toHaveCount(0)

    const tabs = [
      { key: 'dashboard', path: '/dashboard' },
      { key: 'hunts', path: '/hunts' },
      { key: 'settings', path: '/settings' },
    ] as const

    for (const { key, path } of tabs) {
      await page.getByTestId(`bottom-nav-tab-${key}`).click()
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(page.getByTestId(`bottom-nav-tab-${key}`)).toHaveAttribute('aria-current', 'page')
    }
  })
})
