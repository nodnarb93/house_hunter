import { test, expect } from '@playwright/test'

test('triage Kanban page and listings stage API', async ({ page, request }) => {
  await page.goto('/triage')

  await expect(page.getByTestId('triage-board')).toBeVisible()

  const bookmarkedRes = await request.get('/api/listings?bookmarked=1')
  expect(bookmarkedRes.status()).toBe(200)
  const bookmarkedBody = await bookmarkedRes.json()
  expect(bookmarkedBody).toHaveProperty('listings')
  expect(Array.isArray(bookmarkedBody.listings)).toBe(true)

  if ((bookmarkedBody.listings as unknown[]).length === 0) {
    await expect(page.getByTestId('triage-empty')).toBeVisible()
    await expect(page.getByTestId('triage-column-interested')).toBeHidden()
    await expect(page.getByTestId('triage-tab-interested')).toBeHidden()
  } else {
    await expect(page.getByTestId('triage-empty')).toBeHidden()
    await expect(page.getByTestId('triage-column-interested')).toBeVisible()
    await expect(page.getByTestId('triage-column-contacted')).toBeVisible()
    await expect(page.getByTestId('triage-column-tour_scheduled')).toBeVisible()
    await expect(page.getByTestId('triage-column-rejected')).toBeVisible()
  }

  const patchRes = await request.patch('/api/listings/2147483647', {
    data: { stage: 'contacted' },
  })
  expect(patchRes.status()).toBe(404)
})
