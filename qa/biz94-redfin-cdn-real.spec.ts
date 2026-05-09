/**
 * Real-network golden check against ssl.cdn-redfin.com (opt-in).
 *
 * Manual run:
 *   REAL_NETWORK_TESTS=1 npx playwright test qa/biz94-redfin-cdn-real.spec.ts
 */
import { test, expect } from '@playwright/test'
import { fetchRedfinCdnPhotoUrls } from '../server/scrapers/redfinCdnPhotoFetcher'

test.describe('BIZ-94 Redfin CDN real network', () => {
  test.skip(!process.env.REAL_NETWORK_TESTS, 'set REAL_NETWORK_TESTS=1 to run')

  test('known MLS returns at least one live image/jpeg URL', async () => {
    const urls = await fetchRedfinCdnPhotoUrls('226015925')
    expect(urls.length).toBeGreaterThanOrEqual(1)
    const head = await fetch(urls[0]!, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10_000),
    })
    expect(head.status).toBe(200)
    expect((head.headers.get('content-type') ?? '').toLowerCase()).toContain('image/jpeg')
  })
})
