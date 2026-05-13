import { test, expect, type APIRequestContext } from '@playwright/test'

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

async function createRssScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz148-feed-${Date.now()}.xml` },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

async function seedBookmarkedAcrossStages(request: APIRequestContext) {
  const scraperId = await createRssScraper(request)
  const huntRes = await request.post('/api/house-hunts', { data: { name: `BIZ148 hunt ${Date.now()}` } })
  expect(huntRes.status()).toBe(201)
  const huntId = ((await huntRes.json()) as { id: number }).id

  const specs = [
    { stage: 'interested' as const, label: 'Interested row' },
    { stage: 'contacted' as const, label: 'Contacted row' },
    { stage: 'tour_scheduled' as const, label: 'Tour row' },
  ]
  const listings: { id: number; title: string; stage: string }[] = []
  const t = Date.now()
  for (let i = 0; i < specs.length; i++) {
    const title = `BIZ148 ${specs[i].label} ${t}-${i}`
    const seed = await request.post('/api/test/seed-listing', {
      data: {
        title,
        link: `https://example.invalid/biz148-${t}-${i}`,
        hunt_id: huntId,
        scraper_id: scraperId,
        price_cents: 199_000_00,
      },
    })
    expect(seed.status()).toBe(201)
    const { id } = (await seed.json()) as { id: number }
    const patch = await request.patch(`/api/listings/${id}`, { data: { bookmarked: 1, stage: specs[i].stage } })
    expect(patch.status()).toBe(200)
    listings.push({ id, title, stage: specs[i].stage })
  }
  return { huntId, listings }
}

test.describe('BIZ-148 Triage mobile tabbed list', () => {
  test.describe('mobile viewport', () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test.beforeEach(async ({ request }) => {
      await wipeListings(request)
    })

    test('tab strip visible, desktop grid hidden, count badges', async ({ page, request }) => {
      await seedBookmarkedAcrossStages(request)
      await page.goto('/triage')
      await expect(page.getByTestId('triage-board')).toBeVisible()

      for (const key of ['interested', 'contacted', 'tour_scheduled', 'rejected'] as const) {
        await expect(page.getByTestId(`triage-tab-${key}`)).toBeVisible()
      }
      await expect(page.getByTestId('triage-column-interested')).toBeHidden()

      await expect(page.getByTestId('triage-tab-interested')).toHaveText(/Interested/)
      await expect(page.getByTestId('triage-tab-interested')).toHaveText(/1/)
      await expect(page.getByTestId('triage-tab-contacted')).toHaveText(/1/)
      await expect(page.getByTestId('triage-tab-tour_scheduled')).toHaveText(/1/)
      await expect(page.getByTestId('triage-tab-rejected')).toHaveText(/0/)
    })

    test('tab click switches active stage and filters list', async ({ page, request }) => {
      const { listings } = await seedBookmarkedAcrossStages(request)
      const [rowInterested, rowContacted] = listings

      await page.goto('/triage')
      await expect(page.getByTestId('triage-tab-interested')).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByTestId('triage-mobile-list').getByText(rowInterested.title)).toBeVisible()
      await expect(page.getByTestId('triage-mobile-list').getByText(rowContacted.title)).toBeHidden()

      await page.getByTestId('triage-tab-contacted').click()
      await expect(page.getByTestId('triage-tab-contacted')).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByTestId('triage-tab-interested')).toHaveAttribute('aria-selected', 'false')
      await expect(page.getByTestId('triage-mobile-list').getByText(rowContacted.title)).toBeVisible()
      await expect(page.getByTestId('triage-mobile-list').getByText(rowInterested.title)).toBeHidden()

      await page.getByTestId('triage-tab-tour_scheduled').click()
      await expect(page.getByTestId('triage-tab-tour_scheduled')).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByTestId('triage-mobile-list').getByText(listings[2].title)).toBeVisible()
    })

    test('stage select PATCHes listing and card moves under new tab', async ({ page, request }) => {
      const { listings } = await seedBookmarkedAcrossStages(request)
      const interestedRow = listings[0]

      await page.goto('/triage')
      await expect(page.getByTestId('triage-tab-interested')).toHaveAttribute('aria-selected', 'true')

      const select = page.getByTestId(`triage-mobile-stage-select-${interestedRow.id}`)
      const patchPromise = page.waitForResponse(
        (res) => res.url().includes(`/api/listings/${interestedRow.id}`) && res.request().method() === 'PATCH',
      )
      await select.selectOption('tour_scheduled')
      const patchRes = await patchPromise
      expect(patchRes.ok()).toBeTruthy()

      await page.getByTestId('triage-tab-tour_scheduled').click()
      await expect(page.getByTestId('triage-mobile-list').getByText(interestedRow.title)).toBeVisible()

      await page.getByTestId('triage-tab-interested').click()
      await expect(page.getByTestId('triage-mobile-list').getByText(interestedRow.title)).toBeHidden()
    })
  })

  test.describe('desktop viewport', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('4-column grid visible, mobile tab strip hidden', async ({ page, request }) => {
      await wipeListings(request)
      await seedBookmarkedAcrossStages(request)

      await page.goto('/triage')
      for (const key of ['interested', 'contacted', 'tour_scheduled', 'rejected'] as const) {
        await expect(page.getByTestId(`triage-column-${key}`)).toBeVisible()
      }
      await expect(page.getByTestId('triage-tab-interested')).toBeHidden()
    })
  })
})

test('empty state at both viewports: only triage-empty renders, no columns or tabs', async ({ page, request }) => {
  const del = await request.delete('/api/test/listings')
  expect(del.status()).toBe(204)

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/triage')
  await expect(page.getByTestId('triage-empty')).toBeVisible()
  await expect(page.getByTestId('triage-column-interested')).toBeHidden()
  await expect(page.getByTestId('triage-tab-interested')).toBeHidden()

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/triage')
  await expect(page.getByTestId('triage-empty')).toBeVisible()
  await expect(page.getByTestId('triage-column-interested')).toBeHidden()
  await expect(page.getByTestId('triage-tab-interested')).toBeHidden()
})
