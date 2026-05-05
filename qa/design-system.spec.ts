import { test, expect } from '@playwright/test'

test('design system: sidebar shell, navigation, no legacy top nav, scraper type dropdown', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')
  await page.waitForFunction(
    () => (document.querySelector('#root')?.textContent?.trim().length ?? 0) > 0,
  )

  await expect(page.getByTestId('sidebar')).toBeVisible()

  await page.getByRole('navigation', { name: 'Pipeline configuration' }).getByRole('link', { name: 'Scrapers' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Scrapers' })).toBeVisible()

  await expect(page.locator('nav.nav')).toHaveCount(0)

  await page.getByRole('navigation', { name: 'Pipeline configuration' }).getByRole('link', { name: 'Scrapers' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Scrapers' })).toBeVisible()

  const dropdown = page.getByTestId('scraper-source-type-dropdown')
  await expect(dropdown.locator('select')).toHaveCount(0)

  await dropdown.getByRole('button', { expanded: false }).click()
  await expect(dropdown.getByRole('option', { name: 'RSS Feed' })).toBeVisible()
  await expect(dropdown.getByRole('option', { name: 'Redfin' })).toBeVisible()
  await expect(dropdown.getByRole('listbox')).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dropdown.getByRole('option', { name: 'RSS Feed' })).toHaveCount(0)

  expect(errors, 'unexpected console errors').toEqual([])
})
