import { test, expect, type APIRequestContext } from '@playwright/test'

async function createRssScraper(request: APIRequestContext, suffix: string) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/feed-${suffix}-${Date.now()}.xml` },
  })
  expect(res.status()).toBe(201)
  return (await res.json()) as { id: number }
}

test.describe('BIZ-44 dashboard refactor', () => {
  test('hunt detail: gear icon opens and closes configuration drawer', async ({ page, request }) => {
    const post = await request.post('/api/house-hunts', { data: { name: `BIZ44 drawer ${Date.now()}` } })
    expect(post.status()).toBe(201)
    const { id } = (await post.json()) as { id: number }
    try {
      await page.goto(`/hunts/${id}`)
      await expect(page.getByTestId('open-config-drawer')).toBeVisible()
      await page.getByTestId('open-config-drawer').click()
      await expect(page.getByTestId('hunt-config-drawer')).toBeVisible()
      await expect(page.getByTestId('hunt-detail-min-price')).toBeVisible()
      await page.getByTestId('close-config-drawer').click()
      await expect(page.getByTestId('hunt-config-drawer')).toBeHidden()
    } finally {
      await request.delete(`/api/house-hunts/${id}`)
    }
  })

  test('hunt detail: filter inputs exist only while drawer is open', async ({ page, request }) => {
    const post = await request.post('/api/house-hunts', { data: { name: `BIZ44 panels ${Date.now()}` } })
    expect(post.status()).toBe(201)
    const { id } = (await post.json()) as { id: number }
    try {
      await page.goto(`/hunts/${id}`)
      await page.getByTestId('open-config-drawer').click()
      await expect(page.getByTestId('hunt-detail-min-price')).toBeVisible()
      await page.getByTestId('close-config-drawer').click()
      await expect(page.getByTestId('hunt-detail-min-price')).not.toBeVisible()
    } finally {
      await request.delete(`/api/house-hunts/${id}`)
    }
  })

  test('hunt detail: empty state and Configure Hunt opens drawer', async ({ page, request }) => {
    const post = await request.post('/api/house-hunts', { data: { name: `BIZ44 empty ${Date.now()}` } })
    expect(post.status()).toBe(201)
    const { id } = (await post.json()) as { id: number }
    try {
      // min_price in cents — no test fixture costs $100M, so results are always 0
      const filterPut = await request.put(`/api/house-hunts/${id}`, {
        data: { filters: { min_price: 9_999_999_999 } },
      })
      expect(filterPut.status()).toBe(200)

      await page.goto(`/hunts/${id}`)
      await expect(page.getByText('No listings identified yet.')).toBeVisible()
      await page.getByTestId('configure-hunt-cta').click()
      await expect(page.getByTestId('hunt-config-drawer')).toBeVisible()
    } finally {
      await request.delete(`/api/house-hunts/${id}`)
    }
  })

  test('hunt detail: results grid shows property cards when listings match filters', async ({ page, request }) => {
    const post = await request.post('/api/house-hunts', { data: { name: `BIZ44 grid ${Date.now()}` } })
    expect(post.status()).toBe(201)
    const { id } = (await post.json()) as { id: number }
    let listingId: number | undefined
    let scraperId: number | undefined
    try {
      const scraper = await createRssScraper(request, 'biz44-grid')
      scraperId = scraper.id

      const filterPut = await request.put(`/api/house-hunts/${id}`, {
        data: { filters: { keywords: 'BIZ44 Grid' }, scraper_ids: [scraperId] },
      })
      expect(filterPut.status()).toBe(200)

      const seed = await request.post('/api/test/seed-listing', {
        data: {
          title: 'BIZ44 Grid Property',
          link: `https://example.invalid/biz44-grid-${Date.now()}`,
          price_cents: 350_000_00,
          address: '100 Grid St',
          beds: 3,
          baths: 2,
          scraper_id: scraperId,
        },
      })
      expect(seed.status()).toBe(201)
      listingId = ((await seed.json()) as { id: number }).id

      await page.goto(`/hunts/${id}`)
      await expect(page.getByTestId('hunt-detail-results-grid')).toBeVisible()
      await expect(page.getByTestId('hunt-result-card')).toHaveCount(1)
      await expect(page.getByText('100 Grid St')).toBeVisible()
    } finally {
      if (listingId !== undefined) {
        await request.delete(`/api/test/listings/${listingId}`)
      }
      await request.delete(`/api/house-hunts/${id}`)
      if (scraperId !== undefined) {
        await request.delete(`/api/scrapers/${scraperId}`).catch(() => {})
      }
    }
  })

  test('triage board shows hunt name badge when hunt_id matches a house hunt', async ({ page, request }) => {
    const post = await request.post('/api/house-hunts', { data: { name: `BIZ44 Triage Hunt ${Date.now()}` } })
    expect(post.status()).toBe(201)
    const { id: huntId } = (await post.json()) as { id: number }
    let listingId: number | undefined
    let scraperId: number | undefined
    try {
      const scraper = await createRssScraper(request, 'biz44-triage')
      scraperId = scraper.id
      const seed = await request.post('/api/test/seed-listing', {
        data: {
          hunt_id: huntId,
          title: 'BIZ44 Triage Card',
          link: `https://example.invalid/biz44-triage-${Date.now()}`,
          price_cents: 400_000_00,
          address: '200 Triage Ave',
          beds: 2,
          baths: 1,
          scraper_id: scraperId,
        },
      })
      expect(seed.status()).toBe(201)
      listingId = ((await seed.json()) as { id: number }).id

      const patch = await request.patch(`/api/listings/${listingId}`, { data: { bookmarked: 1 } })
      expect(patch.status()).toBe(200)

      await page.goto('/triage')
      await expect(page.getByTestId('triage-board')).toBeVisible()
      const badge = page.getByTestId('triage-column-interested').getByTestId('hunt-name-badge').first()
      await expect(badge).toBeVisible()
      await expect(badge).toContainText(/BIZ44 Triage Hunt/)
    } finally {
      if (listingId !== undefined) {
        await request.delete(`/api/test/listings/${listingId}`)
      }
      await request.delete(`/api/house-hunts/${huntId}`)
      if (scraperId !== undefined) {
        await request.delete(`/api/scrapers/${scraperId}`).catch(() => {})
      }
    }
  })
})
