import { test, expect } from '@playwright/test'

test('scrapers page: schedule overview before active list; active scrapers collapsible', async ({
  page,
  request,
}) => {
  const suffix = Date.now()
  const feedUrl = `https://biz43-ui-${suffix}.example.com/feed.xml`
  const create = await request.post('/api/scrapers', {
    data: { kind: 'rss', url: feedUrl },
  })
  expect(create.status()).toBe(201)
  const scraper = (await create.json()) as { id: number }

  try {
    await page.goto('/scrapers')

    await expect(page.getByTestId('schedule-overview')).toBeVisible()

    const toggle = page.getByTestId('scrapers-active-toggle')
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await expect(page.locator('#scrapers-active-list')).toHaveCount(0)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await expect(page.locator('#scrapers-active-list')).toBeVisible()
    await expect(page.getByTestId(`scraper-reschedule-${scraper.id}`)).toBeVisible()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#scrapers-active-list')).toHaveCount(0)

    await expect(page.getByRole('heading', { name: 'Add New Scraper' })).toBeVisible()

    const scheduleAboveActive = await page.evaluate(() => {
      const scheduleEl = document.querySelector('[data-testid="schedule-overview"]')
      const activeHeading = document.getElementById('scrapers-active-heading')
      const activeSection = activeHeading?.closest('section')
      if (!scheduleEl || !activeSection) return false
      return scheduleEl.getBoundingClientRect().top < activeSection.getBoundingClientRect().top
    })
    expect(scheduleAboveActive).toBe(true)
  } finally {
    await request.delete(`/api/scrapers/${scraper.id}`)
  }
})
