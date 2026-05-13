import { test, expect, type APIRequestContext } from '@playwright/test'

const STAGE_LABELS: Record<'interested' | 'contacted' | 'tour_scheduled' | 'rejected', string> = {
  interested: 'Interested',
  contacted: 'Contacted',
  tour_scheduled: 'Tour Scheduled',
  rejected: 'Rejected',
}

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

async function createRssScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz151-feed-${Date.now()}.xml` },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

async function seedOneBookmarked(request: APIRequestContext) {
  const scraperId = await createRssScraper(request)
  const huntRes = await request.post('/api/house-hunts', { data: { name: `BIZ151 hunt ${Date.now()}` } })
  expect(huntRes.status()).toBe(201)
  const huntId = ((await huntRes.json()) as { id: number }).id

  const title = `BIZ151 label row ${Date.now()}`
  const seed = await request.post('/api/test/seed-listing', {
    data: {
      title,
      link: `https://example.invalid/biz151-${Date.now()}`,
      hunt_id: huntId,
      scraper_id: scraperId,
      price_cents: 199_000_00,
    },
  })
  expect(seed.status()).toBe(201)
  const { id } = (await seed.json()) as { id: number }
  const patch = await request.patch(`/api/listings/${id}`, { data: { bookmarked: 1, stage: 'interested' } })
  expect(patch.status()).toBe(200)
  return { id, title }
}

test.describe('BIZ-151 / BIZ-152 mobile triage tab labels', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ request }) => {
    await wipeListings(request)
  })

  test('tab labels are not clipped; tablist scrolls horizontally; tabs remain clickable', async ({ page, request }) => {
    await seedOneBookmarked(request)
    await page.goto('/triage')
    await expect(page.getByTestId('triage-board')).toBeVisible()

    const tablist = page.getByRole('tablist')
    await expect(tablist).toBeVisible()

    await expect(tablist.locator(':scope > [role="tab"]')).toHaveCount(4)

    await expect
      .poll(async () =>
        tablist.evaluate((el: HTMLElement) => el.scrollWidth >= el.clientWidth),
      )
      .toBeTruthy()

    const keys = ['interested', 'contacted', 'tour_scheduled', 'rejected'] as const

    for (const key of keys) {
      const tab = page.getByTestId(`triage-tab-${key}`)
      const labelSpan = tab.locator(':scope > span').first()

      await expect(labelSpan).toHaveText(STAGE_LABELS[key])
      await expect(labelSpan).not.toContainText('…')

      await expect
        .poll(async () =>
          labelSpan.evaluate((el: HTMLElement) => el.scrollWidth <= el.offsetWidth + 1),
        )
        .toBeTruthy()
    }

    for (const key of keys) {
      await page.getByTestId(`triage-tab-${key}`).click()
      await expect(page.getByTestId(`triage-tab-${key}`)).toHaveAttribute('aria-selected', 'true')
      for (const other of keys) {
        if (other === key) continue
        await expect(page.getByTestId(`triage-tab-${other}`)).toHaveAttribute('aria-selected', 'false')
      }
    }
  })
})
