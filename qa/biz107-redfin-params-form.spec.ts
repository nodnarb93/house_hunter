import { test, expect } from '@playwright/test'

test.describe('BIZ-107 Redfin params form', () => {
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

  test('create with non-default v1 params', async ({ page, request }) => {
    await page.goto('/scrapers')
    await pickRedfin(page)

    const url = 'https://www.redfin.com/city/4664/OH/Columbus'
    await page.getByTestId('redfin-location-url').fill(url)
    await page.getByTestId('redfin-resolve-btn').click()
    await expect(page.getByText(/Resolved:/)).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('redfin-status').selectOption('1')
    await page.getByTestId('redfin-num-homes').fill('100')
    await page.getByTestId('redfin-min-price').fill('200000')
    await page.getByTestId('redfin-max-price').fill('600000')
    await page.getByTestId('redfin-min-beds').fill('3')
    await page.getByTestId('redfin-max-baths').fill('3')
    await page.getByTestId('redfin-uipt-1').check()
    await page.getByTestId('redfin-uipt-2').check()

    await page.getByTestId('redfin-form-submit').click()
    await expect(page.getByText('Redfin source added.')).toBeVisible({ timeout: 15_000 })

    const listRes = await request.get('/api/scraper-sources')
    expect(listRes.ok()).toBeTruthy()
    const list = (await listRes.json()) as Array<{ id: number; kind: string }>
    const newest = list.filter((s) => s.kind === 'redfin').sort((a, b) => b.id - a.id)[0]
    expect(newest).toBeTruthy()
    createdIds.push(newest.id)

    const detail = await request.get(`/api/scraper-sources/${newest.id}`)
    expect(detail.ok()).toBeTruthy()
    const body = (await detail.json()) as {
      params: {
        status: number
        num_homes: number
        min_price: number | null
        max_price: number | null
        min_beds: number | null
        max_baths: number | null
        uipt: string | null
      }
    }
    expect(body.params.status).toBe(1)
    expect(body.params.num_homes).toBe(100)
    expect(body.params.min_price).toBe(200_000)
    expect(body.params.max_price).toBe(600_000)
    expect(body.params.min_beds).toBe(3)
    expect(body.params.max_baths).toBe(3)
    expect(body.params.uipt).toBe('1,2')
  })

  test('URL import populates form', async ({ page }) => {
    await page.goto('/scrapers')
    await pickRedfin(page)

    const u =
      'https://www.redfin.com/city/4664/OH/Columbus?min_price=300000&max_beds=4&uipt=1'
    await page.getByTestId('redfin-location-url').fill(u)
    await page.getByTestId('redfin-resolve-btn').click()
    await expect(page.getByText(/Resolved:/)).toBeVisible({ timeout: 15_000 })

    await expect(page.getByTestId('redfin-min-price')).toHaveValue('300000')
    await expect(page.getByTestId('redfin-max-beds')).toHaveValue('4')
    await expect(page.getByTestId('redfin-uipt-1')).toBeChecked()
  })

  test('edit existing scraper params', async ({ page, request }) => {
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

    await page.getByTestId('redfin-num-homes').fill('150')
    await page.getByTestId('redfin-form-submit').click()
    await expect(page.getByText('Redfin parameters updated.')).toBeVisible({ timeout: 15_000 })

    const get = await request.get(`/api/scraper-sources/${row.id}`)
    const body = (await get.json()) as { params: { num_homes: number } }
    expect(body.params.num_homes).toBe(150)
  })

  test('invalid min>max blocked', async ({ page }) => {
    await page.goto('/scrapers')
    await pickRedfin(page)

    const url = 'https://www.redfin.com/city/4664/OH/Columbus'
    await page.getByTestId('redfin-location-url').fill(url)
    await page.getByTestId('redfin-resolve-btn').click()
    await expect(page.getByText(/Resolved:/)).toBeVisible({ timeout: 15_000 })

    const posts: string[] = []
    const onReq = (req: import('@playwright/test').Request) => {
      if (
        req.method() === 'POST' &&
        req.url().includes('/api/scraper-sources') &&
        !req.url().includes('resolve-redfin') &&
        !req.url().includes('/test')
      ) {
        posts.push(req.url())
      }
    }
    page.on('request', onReq)
    try {
      await page.getByTestId('redfin-min-price').fill('500000')
      await page.getByTestId('redfin-max-price').fill('100000')
      await page.getByTestId('redfin-form-submit').click()
      await expect(page.getByTestId('redfin-price-error')).toBeVisible()
      await expect(page.getByTestId('redfin-price-error')).toContainText(/min_price|max_price|greater/i)
      await expect(page.getByTestId('redfin-form-error')).toHaveCount(0)
      await expect(page.getByTestId('redfin-beds-error')).toHaveCount(0)
      await expect(page.getByTestId('redfin-baths-error')).toHaveCount(0)
      await page.waitForTimeout(600)
      expect(posts).toEqual([])
    } finally {
      page.off('request', onReq)
    }
  })

  test('invalid min beds>max beds blocked', async ({ page }) => {
    await page.goto('/scrapers')
    await pickRedfin(page)

    const url = 'https://www.redfin.com/city/4664/OH/Columbus'
    await page.getByTestId('redfin-location-url').fill(url)
    await page.getByTestId('redfin-resolve-btn').click()
    await expect(page.getByText(/Resolved:/)).toBeVisible({ timeout: 15_000 })

    const posts: string[] = []
    const onReq = (req: import('@playwright/test').Request) => {
      if (
        req.method() === 'POST' &&
        req.url().includes('/api/scraper-sources') &&
        !req.url().includes('resolve-redfin') &&
        !req.url().includes('/test')
      ) {
        posts.push(req.url())
      }
    }
    page.on('request', onReq)
    try {
      await page.getByTestId('redfin-min-beds').fill('4')
      await page.getByTestId('redfin-max-beds').fill('2')
      await page.getByTestId('redfin-form-submit').click()
      await expect(page.getByTestId('redfin-beds-error')).toBeVisible()
      await expect(page.getByTestId('redfin-beds-error')).toContainText(/min_beds|max_beds|greater/i)
      await expect(page.getByTestId('redfin-form-error')).toHaveCount(0)
      await expect(page.getByTestId('redfin-price-error')).toHaveCount(0)
      await expect(page.getByTestId('redfin-baths-error')).toHaveCount(0)
      await page.waitForTimeout(600)
      expect(posts).toEqual([])
    } finally {
      page.off('request', onReq)
    }
  })

  test('invalid min baths>max baths blocked', async ({ page }) => {
    await page.goto('/scrapers')
    await pickRedfin(page)

    const url = 'https://www.redfin.com/city/4664/OH/Columbus'
    await page.getByTestId('redfin-location-url').fill(url)
    await page.getByTestId('redfin-resolve-btn').click()
    await expect(page.getByText(/Resolved:/)).toBeVisible({ timeout: 15_000 })

    const posts: string[] = []
    const onReq = (req: import('@playwright/test').Request) => {
      if (
        req.method() === 'POST' &&
        req.url().includes('/api/scraper-sources') &&
        !req.url().includes('resolve-redfin') &&
        !req.url().includes('/test')
      ) {
        posts.push(req.url())
      }
    }
    page.on('request', onReq)
    try {
      await page.getByTestId('redfin-min-baths').fill('3')
      await page.getByTestId('redfin-max-baths').fill('1')
      await page.getByTestId('redfin-form-submit').click()
      await expect(page.getByTestId('redfin-baths-error')).toBeVisible()
      await expect(page.getByTestId('redfin-baths-error')).toContainText(/min_baths|max_baths|greater/i)
      await expect(page.getByTestId('redfin-form-error')).toHaveCount(0)
      await expect(page.getByTestId('redfin-price-error')).toHaveCount(0)
      await expect(page.getByTestId('redfin-beds-error')).toHaveCount(0)
      await page.waitForTimeout(600)
      expect(posts).toEqual([])
    } finally {
      page.off('request', onReq)
    }
  })

  test('num_homes out of range shows form error before Add in DOM', async ({ page }) => {
    await page.goto('/scrapers')
    await pickRedfin(page)

    const url = 'https://www.redfin.com/city/4664/OH/Columbus'
    await page.getByTestId('redfin-location-url').fill(url)
    await page.getByTestId('redfin-resolve-btn').click()
    await expect(page.getByText(/Resolved:/)).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('redfin-num-homes').fill('400')
    await page.getByTestId('redfin-form-submit').click()

    const err = page.getByTestId('redfin-form-error')
    await expect(err).toBeVisible()
    await expect(err).toContainText(/num_homes/i)

    const errorBeforeSubmitButton = await err.evaluate((el) => {
      const btn = document.querySelector('[data-testid="redfin-form-submit"]')
      if (!btn) return false
      return (el.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    })
    expect(errorBeforeSubmitButton).toBe(true)
  })
})
