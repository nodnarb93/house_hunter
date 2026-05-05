import { test, expect } from '@playwright/test'

test('scrapers page: schedule overview, slot picker with 48 options, taken slot disabled', async ({
  page,
  request,
}) => {
  const suffix = Date.now()
  const createA = await request.post('/api/scrapers', {
    data: { kind: 'rss', url: `https://biz29-a-${suffix}.example.com/feed.xml` },
  })
  expect(createA.status()).toBe(201)
  const scraperA = (await createA.json()) as { id: number }

  const createB = await request.post('/api/scrapers', {
    data: { kind: 'rss', url: `https://biz29-b-${suffix}.example.com/feed.xml` },
  })
  expect(createB.status()).toBe(201)
  const scraperB = (await createB.json()) as { id: number }

  const putA = await request.put(`/api/scrapers/${scraperA.id}`, {
    data: { schedule_slots: ['10:00'] },
  })
  expect(putA.status()).toBe(200)

  try {
    await page.goto('/scrapers')
    await expect(page.getByTestId('schedule-overview')).toBeVisible()

    await page.getByTestId('scrapers-active-toggle').click()
    await page.getByTestId(`scraper-edit-${scraperB.id}`).click()
    const picker = page.getByTestId('scraper-slot-picker')
    await expect(picker).toBeVisible()
    const options = picker.locator('[data-testid^="slot-option-"]')
    await expect(options).toHaveCount(48)

    await expect(page.getByTestId('slot-option-10:00')).toBeDisabled()
  } finally {
    await request.delete(`/api/scrapers/${scraperA.id}`)
    await request.delete(`/api/scrapers/${scraperB.id}`)
  }
})
