import { test, expect } from '@playwright/test'

test('scrapers: active toggle shows caret only; heading and caret toggle list', async ({ page, request }) => {
  const suffix = Date.now()
  const create = await request.post('/api/scrapers', {
    data: { kind: 'rss', url: `https://biz47-toggle-${suffix}.example.com/feed.xml` },
  })
  expect(create.status()).toBe(201)
  const scraper = (await create.json()) as { id: number }

  try {
    await page.goto('/scrapers')
    const toggle = page.getByTestId('scrapers-active-toggle')
    await expect(toggle).toHaveText('▼')
    await expect(toggle).not.toContainText('Expand')

    await page.locator('#scrapers-active-heading').click()
    await expect(page.locator('#scrapers-active-list')).toBeVisible()
    await expect(page.getByTestId(`scraper-reschedule-${scraper.id}`)).toBeVisible()

    await toggle.click()
    await expect(page.locator('#scrapers-active-list')).toHaveCount(0)
  } finally {
    await request.delete(`/api/scrapers/${scraper.id}`)
  }
})

test('scrapers: schedule overview shows current time indicator and label', async ({ page }) => {
  await page.goto('/scrapers')
  await expect(page.getByTestId('current-time-indicator')).toBeVisible()
  const label = page.getByTestId('current-time-label')
  await expect(label).toBeVisible()
  await expect(label).toHaveText(/\d{1,2}:\d{2}\s*(AM|PM)/i)
})

test('scrapers: delete confirmation modal and red delete button', async ({ page, request }) => {
  const suffix = Date.now()
  const create = await request.post('/api/scrapers', {
    data: { kind: 'rss', url: `https://biz47-del-${suffix}.example.com/feed.xml` },
  })
  expect(create.status()).toBe(201)
  const scraper = (await create.json()) as { id: number }

  try {
    await page.goto('/scrapers')
    await page.getByTestId('scrapers-active-toggle').click()

    const delBtn = page.getByTestId(`scraper-delete-${scraper.id}`)
    await expect(delBtn).toHaveClass(/bg-red-700/)

    await delBtn.click()
    const modal = page.getByTestId('delete-confirm-modal')
    await expect(modal).toBeVisible()
    await expect(modal.getByText('Delete this Scraper?')).toBeVisible()

    await page.getByTestId('delete-cancel-btn').click()
    await expect(modal).toHaveCount(0)
    await expect(page.getByTestId(`scraper-delete-${scraper.id}`)).toBeVisible()

    await delBtn.click()
    await page.getByTestId('delete-confirm-btn').click()
    await expect(page.getByTestId('delete-confirm-modal')).toHaveCount(0)
    await expect(page.getByTestId(`scraper-delete-${scraper.id}`)).toHaveCount(0)
  } finally {
    await request.delete(`/api/scrapers/${scraper.id}`).catch(() => {})
  }
})

test('scrapers: different source groups can share a slot; overview cell splits', async ({ page, request }) => {
  const suffix = Date.now()
  const redfin = await request.post('/api/scrapers', {
    data: { kind: 'redfin', region_id: 4664, region_type: 6, market: 'seattle' },
  })
  expect(redfin.status()).toBe(201)
  const redfinRow = (await redfin.json()) as { id: number }

  const rss = await request.post('/api/scrapers', {
    data: { kind: 'rss', url: `https://www.zillow.com/biz47-rss-${suffix}.example.xml` },
  })
  expect(rss.status()).toBe(201)
  const rssRow = (await rss.json()) as { id: number }

  try {
    await page.goto('/scrapers')
    await page.getByTestId('scrapers-active-toggle').click()

    await page.getByTestId(`scraper-reschedule-${redfinRow.id}`).click()
    await page.getByTestId('slot-option-08:00').click()
    await page.getByRole('button', { name: 'Save schedule' }).click()
    await expect(page.getByText('Schedule updated.')).toBeVisible()

    await page.getByTestId(`scraper-reschedule-${rssRow.id}`).click()
    const rss0800 = page.getByTestId('slot-option-08:00')
    await expect(rss0800).toBeEnabled()
    await rss0800.click()
    await page.getByRole('button', { name: 'Save schedule' }).click()
    await expect(page.getByText('Schedule updated.')).toBeVisible()

    const cell = page.getByTestId('schedule-slot-cell-08:00')
    await expect(cell.locator('.flex.h-full.flex-col > div')).toHaveCount(2)
  } finally {
    await request.delete(`/api/scrapers/${redfinRow.id}`)
    await request.delete(`/api/scrapers/${rssRow.id}`)
  }
})
