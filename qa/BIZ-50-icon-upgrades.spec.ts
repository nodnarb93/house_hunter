import { test, expect } from '@playwright/test'

test('BIZ-50: favicon link and Settings sidebar gear icon', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')
  await page.waitForFunction(
    () => (document.querySelector('#root')?.textContent?.trim().length ?? 0) > 0,
  )

  await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveCount(1)

  const faviconResp = await page.request.get('/favicon.svg')
  expect(faviconResp.status(), 'favicon should be served from static root').toBe(200)

  const settingsLink = page.getByTestId('settings-nav-link')
  await expect(settingsLink).toContainText('Settings')
  await expect(settingsLink.locator('svg')).toHaveCount(1)

  expect(errors, 'unexpected console errors').toEqual([])
})
