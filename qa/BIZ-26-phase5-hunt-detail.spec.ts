import { test, expect } from '@playwright/test'

test('GET /api/house-hunts/:id returns detail with filters, scraper_ids, notifications', async ({ request }) => {
  const post = await request.post('/api/house-hunts', { data: { name: `Phase5 detail ${Date.now()}` } })
  expect(post.status()).toBe(201)
  const created = (await post.json()) as { id: number }

  const r = await request.get(`/api/house-hunts/${created.id}`)
  expect(r.status()).toBe(200)
  const body = (await r.json()) as {
    filters: Record<string, unknown>
    scraper_ids: unknown
    notifications: unknown
  }
  expect(body.filters).toBeDefined()
  expect(['min_price', 'max_price', 'min_beds', 'min_baths', 'keywords', 'keywords_exclude', 'location_text'].every((k) => k in body.filters)).toBe(
    true
  )
  expect(Array.isArray(body.scraper_ids)).toBe(true)
  expect(Array.isArray(body.notifications)).toBe(true)

  await request.delete(`/api/house-hunts/${created.id}`)
})

test('PUT /api/house-hunts/:id with filters persists; GET reflects values', async ({ request }) => {
  const post = await request.post('/api/house-hunts', { data: { name: `Phase5 filters ${Date.now()}` } })
  const { id } = (await post.json()) as { id: number }

  const put = await request.put(`/api/house-hunts/${id}`, {
    data: {
      filters: {
        min_price: 100_000,
        max_price: 500_000,
        min_beds: 2,
        min_baths: 1.5,
        keywords: 'garage,parking',
        keywords_exclude: 'hoa',
        location_text: 'Columbus',
      },
    },
  })
  expect(put.status()).toBe(200)

  const get = await request.get(`/api/house-hunts/${id}`)
  expect(get.status()).toBe(200)
  const body = (await get.json()) as { filters: Record<string, unknown> }
  expect(body.filters.min_price).toBe(100_000)
  expect(body.filters.max_price).toBe(500_000)
  expect(body.filters.min_beds).toBe(2)
  expect(body.filters.min_baths).toBe(1.5)
  expect(body.filters.keywords).toBe('garage,parking')
  expect(body.filters.keywords_exclude).toBe('hoa')
  expect(body.filters.location_text).toBe('Columbus')

  await request.delete(`/api/house-hunts/${id}`)
})

test('PUT /api/house-hunts/:id with scraper_ids persists', async ({ request }) => {
  const suffix = Date.now()
  const scrapRes = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/phase5-scraper-${suffix}.xml` },
  })
  expect(scrapRes.status()).toBe(201)
  const scraper = (await scrapRes.json()) as { id: number }

  const post = await request.post('/api/house-hunts', { data: { name: `Phase5 scrapers ${suffix}` } })
  const hunt = (await post.json()) as { id: number }

  const put = await request.put(`/api/house-hunts/${hunt.id}`, { data: { scraper_ids: [scraper.id] } })
  expect(put.status()).toBe(200)
  const after = (await put.json()) as { scraper_ids: number[] }
  expect(after.scraper_ids).toEqual([scraper.id])

  const get = await request.get(`/api/house-hunts/${hunt.id}`)
  expect(((await get.json()) as { scraper_ids: number[] }).scraper_ids).toEqual([scraper.id])

  await request.delete(`/api/house-hunts/${hunt.id}`)
  await request.delete(`/api/scrapers/${scraper.id}`)
})

test('PUT /api/house-hunts/:id with notifications persists', async ({ request }) => {
  const post = await request.post('/api/house-hunts', { data: { name: `Phase5 notif ${Date.now()}` } })
  const { id } = (await post.json()) as { id: number }

  const put = await request.put(`/api/house-hunts/${id}`, {
    data: {
      notifications: [{ type: 'webhook', destination: 'https://hooks.example.com/x', enabled: true }],
    },
  })
  expect(put.status()).toBe(200)
  const putBody = (await put.json()) as { notifications: Array<{ type: string; destination: string }> }
  expect(putBody.notifications).toHaveLength(1)
  expect(putBody.notifications[0].type).toBe('webhook')
  expect(putBody.notifications[0].destination).toBe('https://hooks.example.com/x')

  const get = await request.get(`/api/house-hunts/${id}`)
  const g = (await get.json()) as { notifications: typeof putBody.notifications }
  expect(g.notifications).toHaveLength(1)

  await request.delete(`/api/house-hunts/${id}`)
})

test('GET /api/house-hunts/:id/results returns 200 JSON array', async ({ request }) => {
  const post = await request.post('/api/house-hunts', { data: { name: `Phase5 results ${Date.now()}` } })
  const { id } = (await post.json()) as { id: number }

  const r = await request.get(`/api/house-hunts/${id}/results`)
  expect(r.status()).toBe(200)
  const body = await r.json()
  expect(Array.isArray(body)).toBe(true)

  await request.delete(`/api/house-hunts/${id}`)
})

test('Hunt detail page: sidebar navigation shows filter inputs; no console errors', async ({ page, request }) => {
  const errors: string[] = []
  const allConsole: string[] = []
  page.on('console', (msg) => {
    const line = `[${msg.type()}] ${msg.text()}`
    allConsole.push(line)
    if (msg.type() === 'error') errors.push(line)
  })

  const post = await request.post('/api/house-hunts', { data: { name: `UI detail ${Date.now()}` } })
  const { id } = (await post.json()) as { id: number }

  await page.goto('/scrapers')
  await page.getByTestId(`hunt-link-${id}`).click()
  await expect(page).toHaveURL(new RegExp(`/hunts/${id}$`))

  await page.getByTestId('open-config-drawer').click()
  await expect(page.getByTestId('hunt-detail-min-price')).toBeVisible()
  await expect(page.getByTestId('hunt-detail-max-price')).toBeVisible()
  await expect(page.getByTestId('hunt-detail-min-beds')).toBeVisible()

  expect(errors, `console output:\n${allConsole.join('\n')}`).toEqual([])

  await request.delete(`/api/house-hunts/${id}`)
})

test('Hunt detail: save filters via UI; reload shows saved values', async ({ page, request }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${msg.type()}] ${msg.text()}`)
  })

  const post = await request.post('/api/house-hunts', { data: { name: `UI filters ${Date.now()}` } })
  const { id } = (await post.json()) as { id: number }

  await page.goto(`/hunts/${id}`)
  await page.getByTestId('open-config-drawer').click()
  await expect(page.getByTestId('hunt-detail-min-price')).toBeVisible()

  await page.getByTestId('hunt-detail-min-price').fill('250000')
  await page.getByTestId('hunt-detail-max-price').fill('600000')
  await page.getByTestId('hunt-detail-min-beds').fill('3')
  const huntPutPath = `/api/house-hunts/${id}`
  const putFilters = page.waitForResponse((r) => {
    try {
      return new URL(r.url()).pathname === huntPutPath && r.request().method() === 'PUT' && r.ok()
    } catch {
      return false
    }
  })
  await page.getByTestId('hunt-detail-save-filters').click()
  await putFilters

  await page.reload()
  await page.getByTestId('open-config-drawer').click()
  await expect(page.getByTestId('hunt-detail-min-price')).toHaveValue('250000')
  await expect(page.getByTestId('hunt-detail-max-price')).toHaveValue('600000')
  await expect(page.getByTestId('hunt-detail-min-beds')).toHaveValue('3')

  expect(errors).toEqual([])

  await request.delete(`/api/house-hunts/${id}`)
})

test('Hunt detail: add notification via UI and save; row appears', async ({ page, request }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${msg.type()}] ${msg.text()}`)
  })

  const post = await request.post('/api/house-hunts', { data: { name: `UI notif ${Date.now()}` } })
  const { id } = (await post.json()) as { id: number }

  await page.goto(`/hunts/${id}`)
  await page.getByTestId('open-config-drawer').click()
  const dest = `https://notify.example.com/${Date.now()}`
  await page.getByTestId('hunt-detail-notification-destination').fill(dest)
  await page.getByTestId('hunt-detail-add-notification').click()
  await expect(page.getByTestId('hunt-detail-notification-list')).toContainText(dest)
  await page.getByTestId('hunt-detail-save-notifications').click()
  await expect(page.getByTestId('hunt-detail-notification-list')).toContainText(dest)

  expect(errors).toEqual([])

  await request.delete(`/api/house-hunts/${id}`)
})
