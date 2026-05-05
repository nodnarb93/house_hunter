import { test, expect } from '@playwright/test'

test('scrapers page: no document horizontal overflow at 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/scrapers')
  await expect(page.getByTestId('schedule-overview')).toBeVisible()

  const docFitsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )
  expect(docFitsViewport).toBe(true)
})
