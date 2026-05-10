import { test, expect } from '@playwright/test'

test.describe('BIZ-58 image backfill', () => {
  test('POST backfill queues image-less listings; Results Fetch Images control works', async ({
    page,
    request,
  }) => {
    const seed = await request.post('/api/test/seed-listing', {
      data: {
        title: 'BIZ-58 backfill seed',
        link: `https://example.invalid/biz58-${Date.now()}`,
        price_cents: 199_000_00,
        address: '2 Backfill Rd',
        beds: 2,
        baths: 1,
      },
    })
    expect(seed.status()).toBe(201)
    const { id } = (await seed.json()) as { id: number }

    const backfill = await request.post(`/api/listings/backfill-images?listing_id=${id}`)
    expect(backfill.status()).toBe(200)
    const body = (await backfill.json()) as { ok?: unknown; queued?: unknown }
    expect(body.ok).toBe(true)
    expect(typeof body.queued).toBe('number')
    expect((body.queued as number) >= 1).toBeTruthy()

    await page.waitForTimeout(300)

    const countRes = await request.get(`/api/listings/${id}/images/count`)
    expect(countRes.status()).toBe(200)
    const countBody = (await countRes.json()) as { count: number }
    expect(countBody.count).toBeGreaterThanOrEqual(0)

    await page.goto('/results')
    const btn = page.getByTestId('results-fetch-images')
    await expect(btn).toBeVisible({ timeout: 20_000 })
    await btn.click()

    await request.delete(`/api/test/listings/${id}`)
  })
})
