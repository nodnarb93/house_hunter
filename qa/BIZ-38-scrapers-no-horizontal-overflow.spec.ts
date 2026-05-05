import { test, expect } from '@playwright/test'

test('scrapers page: no document horizontal overflow at 1280px', async ({ page, request }) => {
  const suffix = Date.now()
  const create = await request.post('/api/scrapers', {
    data: { kind: 'rss', url: `https://overflow-check-${suffix}.example.com/feed.xml` },
  })
  expect(create.status()).toBe(201)
  const scraper = (await create.json()) as { id: number }

  try {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/scrapers')
    const overview = page.getByTestId('schedule-overview')
    await expect(overview).toBeVisible()
    await expect(overview).toHaveClass(/max-w-full/)

    const docFitsViewport = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )
    expect(docFitsViewport).toBe(true)
  } finally {
    await request.delete(`/api/scrapers/${scraper.id}`)
  }
})
