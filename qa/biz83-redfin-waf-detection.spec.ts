import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { fetchRedfinCdnPhotoUrls } from '../server/scrapers/redfinCdnPhotoFetcher'
import { RedfinSource } from '../server/scrapers/redfinSource'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WAF_BODY_HTML = readFileSync(
  path.join(__dirname, 'captures', 'redfin-79498429-20260508', 'body.html'),
  'utf8',
)

test.describe('BIZ-83 WAF regression guard (CDN path)', () => {
  test('WAF HTML body on CDN probe fires CDN logger', async () => {
    const errors: string[] = []
    const orig = console.error
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    }
    try {
      const fakeFetch = (async () =>
        new Response(WAF_BODY_HTML, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })) as typeof fetch
      const urls = await fetchRedfinCdnPhotoUrls('226015925', { fetchImpl: fakeFetch, delayMs: 0 })
      expect(urls).toEqual([])
      expect(errors.some((e) => /\[redfin\]\[cdn\] WAF challenge unexpectedly returned/.test(e))).toBe(true)
    } finally {
      console.error = orig
    }
  })

  test('Status 202 + WAF header on CDN fires logger', async () => {
    const errors: string[] = []
    const orig = console.error
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    }
    try {
      const fakeFetch = (async () =>
        new Response('any body', {
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

  test('Successful CDN HEAD does not fire WAF logger', async () => {
    const errors: string[] = []
    const orig = console.error
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    }
    try {
      const expected = 'https://ssl.cdn-redfin.com/photo/160/bigphoto/925/226015925_0.jpg'
      const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (u === expected && init?.method === 'HEAD') {
          return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } })
        }
        return new Response(null, { status: 404 })
      }) as typeof fetch
      const urls = await new RedfinSource(fakeFetch).extractPhotoUrls('https://www.redfin.com/example/home/123', {
        mlsNumber: '226015925',
      })
      expect(urls).toEqual([expected])
      expect(errors.some((e) => /\[redfin\]\[cdn\] WAF/.test(e))).toBe(false)
    } finally {
      console.error = orig
    }
  })
})
