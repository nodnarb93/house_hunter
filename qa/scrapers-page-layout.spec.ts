import { test, expect } from '@playwright/test'

test.describe('BIZ-117 Scrapers page layout', () => {
  test('shows dividers between top-level Scrapers page sections', async ({ page }) => {
    await page.goto('/scrapers')

    const headerBlock = page.locator('h1', { hasText: 'Scrapers' }).locator('xpath=ancestor::div[1]')
    await expect(headerBlock).toHaveClass(/border-b/)
    await expect(headerBlock).toHaveClass(/border-white\/10/)

    const schedule = page.getByTestId('schedule-overview')
    await expect(schedule).toHaveClass(/border-b/)
    await expect(schedule).toHaveClass(/border-white\/10/)

    const activeHeading = page.getByRole('heading', { name: 'Active Scrapers' })
    const activeSection = activeHeading.locator('xpath=ancestor::section[1]')
    await expect(activeSection).toHaveClass(/border-b/)
    await expect(activeSection).toHaveClass(/border-white\/10/)
  })

  test('per-scraper schedule button reads Reschedule and opens the schedule fieldset', async ({
    page,
    request,
  }) => {
    const stamp = Date.now()
    const create = await request.post('/api/scrapers', {
      data: {
        kind: 'redfin',
        region_id: 4664,
        region_type: 6,
        market: `Biz117 ${stamp}`,
      },
    })
    expect(create.ok()).toBeTruthy()
    const { id } = (await create.json()) as { id: number }

    try {
      await page.goto('/scrapers')
      await page.getByTestId('scrapers-active-toggle').click()

      const reschedule = page.getByTestId(`scraper-reschedule-${id}`)
      await expect(reschedule).toHaveText('Reschedule')
      await reschedule.click()
      await expect(page.getByTestId('scraper-slot-picker')).toBeVisible()
    } finally {
      await request.delete(`/api/scrapers/${id}`).catch(() => {})
    }
  })
})
