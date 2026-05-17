import { test, expect } from '@playwright/test'

test.describe('BIZ-293 Phase 1 settings hub', () => {
  test('hub rows link to scrapers, app settings, and system logs', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByTestId('settings-hub')).toBeVisible()
    await expect(page.getByTestId('settings-hub-scrapers')).toBeVisible()
    await expect(page.getByTestId('settings-hub-app-settings')).toBeVisible()
    await expect(page.getByTestId('settings-hub-system-logs')).toBeVisible()

    await page.getByTestId('settings-hub-app-settings').click()
    await expect(page).toHaveURL(/\/settings\/app$/)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByText('Webhook URL')).toBeVisible()

    await page.goto('/settings')
    await page.getByTestId('settings-hub-scrapers').click()
    await expect(page).toHaveURL(/\/scrapers$/)

    await page.goto('/settings')
    await page.getByTestId('settings-hub-system-logs').click()
    await expect(page).toHaveURL(/\/runs$/)
  })
})
