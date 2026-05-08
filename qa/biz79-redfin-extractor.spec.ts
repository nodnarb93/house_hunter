import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { RedfinSource } from '../server/scrapers/redfinSource'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_HTML = readFileSync(path.join(__dirname, 'fixtures', 'redfin-listing.html'), 'utf8')

function makeFakeFetch(): typeof fetch {
  return (async () => new Response(FIXTURE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch
}

test.describe('BIZ-79 RedfinSource production extractor', () => {
  test('returns ssl.cdn-redfin.com URLs from injected fetch (PLAYWRIGHT_TEST unset)', async () => {
    delete process.env.PLAYWRIGHT_TEST
    const src = new RedfinSource(makeFakeFetch())
    const urls = await src.extractPhotoUrls('https://www.redfin.com/example/home/123')
    expect(urls.length).toBeGreaterThanOrEqual(1)
    for (const u of urls) expect(u.startsWith('https://ssl.cdn-redfin.com/')).toBe(true)
  })

  test('PLAYWRIGHT_TEST=1 has no effect on the production extractor', async () => {
    const prev = process.env.PLAYWRIGHT_TEST
    try {
      delete process.env.PLAYWRIGHT_TEST
      const baseline = await new RedfinSource(makeFakeFetch()).extractPhotoUrls('https://www.redfin.com/example/home/123')
      process.env.PLAYWRIGHT_TEST = '1'
      const withFlag = await new RedfinSource(makeFakeFetch()).extractPhotoUrls('https://www.redfin.com/example/home/123')
      expect(withFlag).toEqual(baseline)
    } finally {
      if (prev === undefined) delete process.env.PLAYWRIGHT_TEST
      else process.env.PLAYWRIGHT_TEST = prev
    }
  })
})
