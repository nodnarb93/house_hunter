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
    await page.getByTestId(`scraper-edit-${scraper.id}`).click()
    await expect(page.getByTestId('scraper-slot-picker')).toBeVisible()
    await page.getByTestId('slot-option-08:00').click()
    await page.getByRole('button', { name: 'Save schedule' }).click()
    await expect(page.getByText('Schedule updated.')).toBeVisible()
  } finally {
    await request.delete(`/api/scrapers/${scraper.id}`)
  }
})
