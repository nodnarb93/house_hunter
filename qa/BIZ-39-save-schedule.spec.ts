import { test, expect } from '@playwright/test'

test('scrapers page: save schedule via UI succeeds (no 404)', async ({ page, request }) => {
  const suffix = Date.now()
  const create = await request.post('/api/scrapers', {
    data: { kind: 'rss', url: `https://save-sched-${suffix}.example.com/feed.xml` },
  })
  expect(create.status()).toBe(201)
  const scraper = (await create.json()) as { id: number }

  try {
    await page.goto('/scrapers')
    await page.getByTestId('scrapers-active-toggle').click()
    await page.getByTestId(`scraper-edit-${scraper.id}`).click()
    await expect(page.getByTestId('scraper-slot-picker')).toBeVisible()
    const picker = page.getByTestId('scraper-slot-picker')
    await picker.locator('button:not([disabled])').first().click()
    await page.getByRole('button', { name: 'Save schedule' }).click()
    await expect(page.getByText('Schedule updated.')).toBeVisible()
  } finally {
    await request.delete(`/api/scrapers/${scraper.id}`)
  }
})
