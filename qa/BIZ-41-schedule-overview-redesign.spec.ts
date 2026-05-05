import { test, expect } from '@playwright/test'

test('schedule overview: grid layout, hour labels, legend, no document overflow at 1280px', async ({
  page,
  request,
}) => {
  const suffix = Date.now()
  const feedUrl = `https://biz41-schedule-${suffix}.example.com/feed.xml`
  const create = await request.post('/api/scrapers', {
    data: { kind: 'rss', url: feedUrl },
  })
  expect(create.status()).toBe(201)
  const scraper = (await create.json()) as { id: number }

  const put = await request.put(`/api/scrapers/${scraper.id}`, {
    data: { schedule_slots: ['03:30'] },
  })
  expect(put.status()).toBe(200)

  try {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/scrapers')

    const overview = page.getByTestId('schedule-overview')
    await expect(overview).toBeVisible()
    await expect(page.getByTestId('hour-label').first()).toBeVisible()

    const cell = page.getByTestId('schedule-slot-cell-03:30')
    await expect(cell).toBeVisible()
    await expect(cell).not.toHaveClass(/bg-zinc-950/)

    await expect(overview.getByText(feedUrl, { exact: true })).toBeVisible()

    const docFitsViewport = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )
    expect(docFitsViewport).toBe(true)
  } finally {
    await request.delete(`/api/scrapers/${scraper.id}`)
  }
})
