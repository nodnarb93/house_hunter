import { test, expect } from '@playwright/test'

test.describe('BIZ-61 backfill response counts', () => {
  test('POST backfill-images returns queued, succeeded, and failed counts', async ({ request }) => {
    const seed = await request.post('/api/test/seed-listing', {
      data: {
        title: 'BIZ-61 backfill counts seed',
        link: `https://example.invalid/biz61-${Date.now()}`,
        price_cents: 250_000_00,
        address: '61 Count Rd',
        beds: 3,
        baths: 2,
      },
    })
    expect(seed.status()).toBe(201)
    const { id } = (await seed.json()) as { id: number }

    const backfill = await request.post('/api/listings/backfill-images')
    expect(backfill.status()).toBe(200)
    const body = (await backfill.json()) as {
      ok?: unknown
      queued?: unknown
      succeeded?: unknown
      failed?: unknown
    }

    expect(body.ok).toBe(true)
    expect(typeof body.queued).toBe('number')
    expect(typeof body.succeeded).toBe('number')
    expect(typeof body.failed).toBe('number')
    expect(body.queued).toBe((body.succeeded as number) + (body.failed as number))
    expect(body.queued as number).toBeGreaterThanOrEqual(1)

    await request.delete(`/api/test/listings/${id}`)
  })
})
