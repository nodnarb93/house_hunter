import { test, expect } from '@playwright/test'

test.describe('BIZ-115 Active Scrapers mobile row layout', () => {
  test('360px: name has horizontal room and meta/actions sit below; 1024px: name aligns with Edit; edit panel opens', async ({
    page,
    request,
  }) => {
    const stamp = Date.now()
    const create = await request.post('/api/scrapers', {
      data: {
        kind: 'redfin',
        region_id: 4664,
        region_type: 6,
        market: `Biz115 ${stamp}`,
      },
    })
    expect(create.ok()).toBeTruthy()
    const { id } = (await create.json()) as { id: number }

    try {
      await page.setViewportSize({ width: 360, height: 800 })
      await page.goto('/scrapers')
      await page.getByTestId('scrapers-active-toggle').click()
      await expect(page.locator('#scrapers-active-list')).toBeVisible()

      const row = page.getByTestId(`scraper-active-row-${id}`)
      const listItem = row.locator('xpath=ancestor::li[1]')
      const nameEl = row.getByTestId(`scraper-row-name-${id}`)
      await expect(nameEl).toBeVisible()

      await expect
        .poll(async () => row.evaluate((el) => getComputedStyle(el).flexDirection))
        .toBe('column')

      const nameBox = await nameEl.boundingBox()
      expect(nameBox).not.toBeNull()
      expect(nameBox!.width).toBeGreaterThan(100)
      expect(nameBox!.height).toBeLessThan(80)

      const neverEl = row.getByText('Never tested').first()
      await expect(neverEl).toBeVisible()
      const neverBox = await neverEl.boundingBox()
      expect(neverBox).not.toBeNull()
      expect(neverBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height - 2)

      const editBtn = page.getByTestId(`scraper-reschedule-${id}`)
      await expect(editBtn).toBeVisible()
      const editBox = await editBtn.boundingBox()
      expect(editBox).not.toBeNull()
      expect(editBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height - 2)

      await page.setViewportSize({ width: 1024, height: 768 })
      await expect
        .poll(async () => row.evaluate((el) => getComputedStyle(el).flexDirection))
        .toBe('row')

      const nameBoxWide = await nameEl.boundingBox()
      const editBoxWide = await editBtn.boundingBox()
      expect(nameBoxWide).not.toBeNull()
      expect(editBoxWide).not.toBeNull()
      const nameMidY = nameBoxWide!.y + nameBoxWide!.height / 2
      const editMidY = editBoxWide!.y + editBoxWide!.height / 2
      expect(Math.abs(nameMidY - editMidY)).toBeLessThan(12)

      await editBtn.click()
      await expect(listItem.getByTestId('scraper-slot-picker')).toBeVisible()
    } finally {
      await request.delete(`/api/scrapers/${id}`).catch(() => {})
    }
  })
})
