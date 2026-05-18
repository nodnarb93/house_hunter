import { test, expect } from '@playwright/test'

test.describe('BIZ-296 Phase 3 activity summary API', () => {
  test('GET /api/activity-summary returns non-negative integer counts', async ({ request }) => {
    const res = await request.get('/api/activity-summary')
    expect(res.status()).toBe(200)
    const body = (await res.json()) as {
      unviewedMatchesCount: unknown
      huntsWithNewListingsCount: unknown
    }
    expect(typeof body.unviewedMatchesCount).toBe('number')
    expect(typeof body.huntsWithNewListingsCount).toBe('number')
    expect(Number.isInteger(body.unviewedMatchesCount)).toBe(true)
    expect(Number.isInteger(body.huntsWithNewListingsCount)).toBe(true)
    expect(body.unviewedMatchesCount).toBeGreaterThanOrEqual(0)
    expect(body.huntsWithNewListingsCount).toBeGreaterThanOrEqual(0)
  })
})
