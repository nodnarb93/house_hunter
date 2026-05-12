import { test, expect } from '@playwright/test'

test.describe('BIZ-122 num_homes onBlur clamp', () => {
  const createdIds: number[] = []

  test.afterAll(async ({ request }) => {
    for (const id of createdIds) {
      await request.delete(`/api/scraper-sources/${id}`).catch(() => {})
    }
  })

  test('clamps num_homes to 350 on blur when above max', async ({ page, request }) => {
    const create = await request.post('/api/scraper-sources', {
      data: {
        kind: 'redfin',
        region_id: 4664,
        region_type: 6,
        market: 'columbus',
        num_homes: 350,
        page_number: 1,
        status: 9,
      },
    })
    expect(create.status()).toBe(201)
    const row = (await create.json()) as { id: number }
    createdIds.push(row.id)

    await page.goto('/scrapers')
    await page.getByTestId('scrapers-active-toggle').click()
    await page.getByTestId(`scraper-edit-params-${row.id}`).click()
    const numHomes = page.getByTestId('redfin-num-homes')
    await expect(numHomes).toHaveValue('350', { timeout: 10_000 })

    await numHomes.fill('5000')
    await page.getByTestId('redfin-page-number').click()
    await expect(numHomes).toHaveValue('350')
  })

  test('clamps num_homes to 1 on blur when below min or empty', async ({ page, request }) => {
    const create = await request.post('/api/scraper-sources', {
      data: {
        kind: 'redfin',
        region_id: 4664,
        region_type: 6,
        market: 'columbus',
        num_homes: 350,
        page_number: 1,
        status: 9,
      },
    })
    expect(create.status()).toBe(201)
    const row = (await create.json()) as { id: number }
    createdIds.push(row.id)

    await page.goto('/scrapers')
    await page.getByTestId('scrapers-active-toggle').click()
    await page.getByTestId(`scraper-edit-params-${row.id}`).click()
    const numHomes = page.getByTestId('redfin-num-homes')
    await expect(numHomes).toHaveValue('350', { timeout: 10_000 })

    await numHomes.fill('0')
    await page.getByTestId('redfin-page-number').click()
    await expect(numHomes).toHaveValue('1')
  })
})
