import { test, expect } from '@playwright/test'
import { RedfinSource } from '../server/scrapers/redfinSource'

function makeCdnOkFetch(mls: string, bucket: string): typeof fetch {
  const expected = `https://ssl.cdn-redfin.com/photo/160/bigphoto/${bucket}/${mls}_0.jpg`
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (u === expected && init?.method === 'HEAD') {
      return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    }
    return new Response(null, { status: 404 })
  }) as typeof fetch
}

test.describe('BIZ-79 RedfinSource CDN extractor', () => {
  test('returns ssl.cdn-redfin.com URL when MLS hint is provided (injected fetch)', async () => {
    delete process.env.PLAYWRIGHT_TEST
    const mls = '226013015'
    const src = new RedfinSource(makeCdnOkFetch(mls, '015'))
    const urls = await src.extractPhotoUrls('https://www.redfin.com/OH/Columbus/home/79708871', { mlsNumber: mls })
    expect(urls).toEqual([`https://ssl.cdn-redfin.com/photo/160/bigphoto/015/${mls}_0.jpg`])
  })

  test('PLAYWRIGHT_TEST=1 has no effect on CDN extraction', async () => {
    const prev = process.env.PLAYWRIGHT_TEST
    const mls = '226013015'
    try {
      delete process.env.PLAYWRIGHT_TEST
      const baseline = await new RedfinSource(makeCdnOkFetch(mls, '015')).extractPhotoUrls(
        'https://www.redfin.com/OH/Columbus/home/79708871',
        { mlsNumber: mls },
      )
      process.env.PLAYWRIGHT_TEST = '1'
      const withFlag = await new RedfinSource(makeCdnOkFetch(mls, '015')).extractPhotoUrls(
        'https://www.redfin.com/OH/Columbus/home/79708871',
        { mlsNumber: mls },
      )
      expect(withFlag).toEqual(baseline)
    } finally {
      if (prev === undefined) delete process.env.PLAYWRIGHT_TEST
      else process.env.PLAYWRIGHT_TEST = prev
    }
  })
})
