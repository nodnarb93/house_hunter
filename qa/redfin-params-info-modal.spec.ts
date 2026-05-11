import { test, expect } from '@playwright/test'

test.describe('BIZ-118 Redfin params info modal', () => {
  const createdIds: number[] = []

  test.afterAll(async ({ request }) => {
    for (const id of createdIds) {
      await request.delete(`/api/scraper-sources/${id}`).catch(() => {})
    }
  })

  async function pickRedfin(page: import('@playwright/test').Page) {
    await page.getByTestId('scraper-source-type-dropdown').click()
    await page.getByRole('option', { name: /^Redfin$/i }).click()
  }

  test('info modal opens from edit-mode Location box with Locked wording, ESC closes', async ({ page, request }) => {
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
    await expect(page.getByTestId('redfin-num-homes')).toHaveValue('350', { timeout: 10_000 })

    const readonlyBox = page.getByTestId('redfin-readonly-location-box')
    await expect(readonlyBox.getByTestId('redfin-params-info-button')).toBeVisible()

    const btn = readonlyBox.getByTestId('redfin-params-info-button')
    await expect(btn).toHaveAttribute('aria-label', 'About these parameters')
    await expect(btn).toHaveAttribute('title', 'About these parameters')

    await btn.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Locked from the URL entered at scraper creation')
    await expect(dialog).toContainText('no max-baths counterpart')

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('info modal opens from create-mode Location label row with Will be set wording', async ({ page }) => {
    await page.goto('/scrapers')
    await pickRedfin(page)

    const addSection = page.locator('section[aria-labelledby="scrapers-add-heading"]')
    const createBtn = addSection.getByTestId('redfin-params-info-button')
    await expect(createBtn).toBeVisible()
    await expect(createBtn).toHaveAttribute('aria-label', 'About these parameters')

    await createBtn.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Will be set from the location URL you resolve')
    await expect(dialog).not.toContainText('Locked from the URL entered at scraper creation')
  })

  test('readonly Location box width is less than the form column width', async ({ page, request }) => {
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
    await expect(page.getByTestId('redfin-readonly-location-box')).toBeVisible({ timeout: 10_000 })

    const box = page.getByTestId('redfin-readonly-location-box')
    const form = page.getByTestId('redfin-form').filter({ has: box })

    const boxBB = await box.boundingBox()
    const formBB = await form.boundingBox()
    expect(boxBB).toBeTruthy()
    expect(formBB).toBeTruthy()
    expect(boxBB!.width).toBeLessThan(formBB!.width)
  })
})
