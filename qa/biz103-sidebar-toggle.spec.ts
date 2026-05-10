import { expect, test } from '@playwright/test'

test.describe('BIZ-103 sidebar — desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear())
  })

  test('defaults open, hamburger toggles, state persists across reload', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.getByTestId('sidebar')
    const toggle = page.getByTestId('sidebar-toggle')
    await expect(sidebar).toBeVisible()
    await expect(toggle).toBeVisible()

    await expect(sidebar).not.toHaveClass(/-translate-x-full/)
    const mlOpen = await page.locator('main').evaluate((el) => parseFloat(getComputedStyle(el).marginLeft))
    expect(mlOpen).toBeGreaterThan(200)

    await toggle.click()
    await expect(sidebar).toHaveClass(/-translate-x-full/)
    const mlClosed = await page.locator('main').evaluate((el) => parseFloat(getComputedStyle(el).marginLeft))
    expect(mlClosed).toBeLessThan(20)

    await page.reload()
    await expect(page.getByTestId('sidebar')).toHaveClass(/-translate-x-full/)

    await page.getByTestId('sidebar-toggle').click()
    await page.reload()
    await expect(page.getByTestId('sidebar')).not.toHaveClass(/-translate-x-full/)
  })

  test('no backdrop on desktop; sidebar stays open across navigation', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('sidebar-backdrop')).toHaveCount(0)
    await page.getByRole('link', { name: /scrapers/i }).click()
    await expect(page.getByTestId('sidebar')).not.toHaveClass(/-translate-x-full/)
  })
})

test.describe('BIZ-103 sidebar — mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear())
  })

  test('defaults closed, opens as overlay without reflowing main', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toHaveClass(/-translate-x-full/)

    await page.getByTestId('sidebar-toggle').click()
    await expect(sidebar).not.toHaveClass(/-translate-x-full/)
    await expect(page.getByTestId('sidebar-backdrop')).toBeVisible()

    const mainMl = await page.locator('main').evaluate((el) => parseFloat(getComputedStyle(el).marginLeft))
    expect(mainMl).toBeLessThan(20)
  })

  test('backdrop click closes; Esc closes; focus enters sidebar on open', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('sidebar-toggle').click()
    const focusedInside = await page.evaluate(
      () => document.querySelector('[data-testid="sidebar"]')?.contains(document.activeElement) ?? false,
    )
    expect(focusedInside).toBe(true)

    await page.getByTestId('sidebar-backdrop').click()
    await expect(page.getByTestId('sidebar')).toHaveClass(/-translate-x-full/)

    await page.getByTestId('sidebar-toggle').click()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('sidebar')).toHaveClass(/-translate-x-full/)
  })

  test('navigating to a hunt closes the sidebar', async ({ page, request }) => {
    const huntName = `BIZ-103 sidebar mobile ${Date.now()}`
    const hunt = await request.post('/api/house-hunts', { data: { name: huntName } })
    expect(hunt.status()).toBe(201)
    const { id: huntId } = (await hunt.json()) as { id: number }

    await page.goto('/')
    await page.getByTestId('sidebar-toggle').click()
    await expect(page.getByTestId('sidebar')).not.toHaveClass(/-translate-x-full/)

    const huntLink = page.getByTestId(`hunt-link-${huntId}`)
    await expect(huntLink).toBeVisible()
    await huntLink.click()
    await expect(page.getByTestId('sidebar')).toHaveClass(/-translate-x-full/)
  })

  test('mobile does not persist sidebar open across reload', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('sidebar-toggle').click()
    await expect(page.getByTestId('sidebar')).not.toHaveClass(/-translate-x-full/)

    await page.reload()
    await expect(page.getByTestId('sidebar')).toHaveClass(/-translate-x-full/)
  })
})
