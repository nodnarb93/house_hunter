import { test, expect } from '@playwright/test'
import { parseRedfinCsvListings } from '../server/scrapers/redfinAdapter'
import { fetchRedfinCdnPhotoUrls } from '../server/scrapers/redfinCdnPhotoFetcher'
import { RedfinSource } from '../server/scrapers/redfinSource'

test.describe('BIZ-94 Redfin CDN photo fetcher', () => {
  test('pattern: MLS 226015925 hits v=0 CDN URL (fake fetch)', async () => {
    const expected = 'https://ssl.cdn-redfin.com/photo/160/bigphoto/925/226015925_0.jpg'
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (u === expected && init?.method === 'HEAD') {
        return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } })
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch
    const urls = await fetchRedfinCdnPhotoUrls('226015925', { fetchImpl: fakeFetch, delayMs: 0 })
    expect(urls).toEqual([expected])
  })

  test('cover v=0 then v=1 fallback', async () => {
    const u0 = 'https://ssl.cdn-redfin.com/photo/160/bigphoto/925/226015925_0.jpg'
    const u1 = 'https://ssl.cdn-redfin.com/photo/160/bigphoto/925/226015925_1.jpg'
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (init?.method !== 'HEAD') return new Response(null, { status: 404 })
      if (u === u0) return new Response(null, { status: 404 })
      if (u === u1) return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } })
      return new Response(null, { status: 404 })
    }) as typeof fetch
    const urls = await fetchRedfinCdnPhotoUrls('226015925', { fetchImpl: fakeFetch, delayMs: 0 })
    expect(urls).toEqual([u1])
  })

  test('negative: invalid MLS returns [] without throwing', async () => {
    const fake404 = (async () => new Response(null, { status: 404 })) as typeof fetch
    await expect(fetchRedfinCdnPhotoUrls('1', { fetchImpl: fake404, delayMs: 0 })).resolves.toEqual([])
    await expect(fetchRedfinCdnPhotoUrls('', { fetchImpl: fake404, delayMs: 0 })).resolves.toEqual([])
    await expect(fetchRedfinCdnPhotoUrls('abc', { fetchImpl: fake404, delayMs: 0 })).resolves.toEqual([])
  })

  test('WAF 202 + x-amzn-waf-action logs CDN guard and returns []', async () => {
    const errors: string[] = []
    const orig = console.error
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    }
    try {
      const fakeFetch = (async () =>
        new Response('', {
          status: 202,
          headers: { 'x-amzn-waf-action': 'challenge', 'content-type': 'text/html' },
        })) as typeof fetch
      const urls = await fetchRedfinCdnPhotoUrls('226015925', { fetchImpl: fakeFetch, delayMs: 0 })
      expect(urls).toEqual([])
      expect(errors.some((e) => /\[redfin\]\[cdn\] WAF challenge unexpectedly returned/.test(e))).toBe(true)
    } finally {
      console.error = orig
    }
  })

  test('HEAD 405 falls back to GET Range bytes=0-0', async () => {
    const url = 'https://ssl.cdn-redfin.com/photo/160/bigphoto/925/226015925_0.jpg'
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (u !== url) return new Response(null, { status: 404 })
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 405 })
      }
      if (init?.method === 'GET') {
        const range = new Headers(init.headers as HeadersInit).get('range')
        if (range === 'bytes=0-0') {
          return new Response(null, { status: 206, headers: { 'content-type': 'image/jpeg' } })
        }
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch
    const urls = await fetchRedfinCdnPhotoUrls('226015925', { fetchImpl: fakeFetch, delayMs: 0 })
    expect(urls).toEqual([url])
  })

  test('RedfinSource delegates when mlsNumber provided; no hints returns []', async () => {
    const expected = 'https://ssl.cdn-redfin.com/photo/160/bigphoto/015/226013015_0.jpg'
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (u === expected && init?.method === 'HEAD') {
        return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } })
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch
    const src = new RedfinSource(fakeFetch)
    const urls = await src.extractPhotoUrls('https://www.redfin.com/OH/Columbus/home/79708871', {
      mlsNumber: '226013015',
    })
    expect(urls).toEqual([expected])
    await expect(src.extractPhotoUrls('https://www.redfin.com/OH/Columbus/home/79708871')).resolves.toEqual([])
    await expect(
      src.extractPhotoUrls('https://www.redfin.com/OH/Columbus/home/79708871', { mlsNumber: null }),
    ).resolves.toEqual([])
  })

  test('parseRedfinCsvListings surfaces MLS# column', () => {
    const csv = [
      'ADDRESS,CITY,STATE OR PROVINCE,ZIP OR POSTAL CODE,PRICE,BEDS,BATHS,PROPERTY TYPE,MLS#,URL',
      '"1 Main St","Columbus","OH","43215","$100,000",2,1.0,"House","226013015","https://www.redfin.com/OH/Columbus/home/79708871"',
      '"2 Oak Rd","Dublin","OH","43017","$200,000",3,2.0,"House","","https://www.redfin.com/OH/Dublin/home/100"',
    ].join('\n')
    const rows = parseRedfinCsvListings(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.mls_number).toBe('226013015')
    expect(rows[1]?.mls_number).toBeNull()
  })
})
