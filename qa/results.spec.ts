import { test, expect } from '@playwright/test'

test.describe('Hunt Results', () => {
  test.beforeEach(async ({ request }) => {
    await request.delete('/api/test/listings')
  })

  test('results page layout, empty state, and listings API', async ({ page, request }) => {
    await page.goto('/results')

    await expect(page.getByTestId('results-list')).toBeVisible()
    await expect(page.getByTestId('results-detail')).toBeVisible()

    await expect(page.getByTestId('results-empty')).toBeVisible()

    const listRes = await request.get('/api/listings')
    expect(listRes.status()).toBe(200)
    const listBody = await listRes.json()
    expect(listBody).toHaveProperty('listings')
    expect(Array.isArray(listBody.listings)).toBe(true)

    const presetRes = await request.get('/api/listings?preset_id=999')
    expect(presetRes.status()).toBe(200)
    const presetBody = await presetRes.json()
    expect(presetBody.listings).toEqual([])

    const title = (await page.title()).trim()
    expect(title.toLowerCase()).toContain('result')
    await expect(page.getByRole('heading', { name: /hunt results/i })).toBeVisible()
  })
})
