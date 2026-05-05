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

  const listResp = await request.get('/api/scrapers')
  const allScrapers = (await listResp.json()) as Array<{ id: number; schedule_slots: string[] }>
  const takenSlots = new Set(allScrapers.flatMap((s) => s.schedule_slots ?? []))
  const ALL_SLOTS = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2).toString().padStart(2, '0')
    const m = i % 2 === 0 ? '00' : '30'
    return `${h}:${m}`
  })
  const freeSlot = [...ALL_SLOTS].reverse().find((s) => !takenSlots.has(s))
  if (!freeSlot) throw new Error('No free slot available in DB')

  try {
    const put = await request.put(`/api/scrapers/${scraper.id}`, {
      data: { schedule_slots: [freeSlot] },
    })
    expect(put.status()).toBe(200)

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/scrapers')

    const overview = page.getByTestId('schedule-overview')
    await expect(overview).toBeVisible()
    await expect(page.getByTestId('hour-label').first()).toBeVisible()

    const cell = page.getByTestId(`schedule-slot-cell-${freeSlot}`)
    await expect(cell).toBeVisible()
    await expect(cell).not.toHaveClass(/bg-zinc-950/)

    await expect(overview.getByText(feedUrl, { exact: false })).toBeVisible()

    const docFitsViewport = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )
    expect(docFitsViewport).toBe(true)
  } finally {
    await request.delete(`/api/scrapers/${scraper.id}`)
  }
})
