import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { RedfinSource } from '../server/scrapers/redfinSource'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WAF_BODY_HTML = readFileSync(
  path.join(__dirname, 'captures', 'redfin-79498429-20260508', 'body.html'),
  'utf8',
)

const LEGIT_HTML = readFileSync(path.join(__dirname, 'fixtures', 'redfin-listing.html'), 'utf8')

test.describe('BIZ-83 Redfin WAF detection in extractPhotoUrls', () => {
  test('WAF body via injected fetch fires logger', async () => {
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
      const urls = await new RedfinSource(fakeFetch).extractPhotoUrls(
        'https://www.redfin.com/example/home/79498429',
      )
      expect(urls).toEqual([])
      expect(errors.some((e) => /\[redfin\] WAF challenge response.*79498429/.test(e))).toBe(true)
    } finally {
      console.error = orig
    }
  })

  test('Status 202 + WAF header fires logger', async () => {
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
      const url = 'https://www.redfin.com/example/home/999'
      const urls = await new RedfinSource(fakeFetch).extractPhotoUrls(url)
      expect(urls).toEqual([])
      expect(errors.some((e) => /\[redfin\] WAF challenge response/.test(e))).toBe(true)
    } finally {
      console.error = orig
    }
  })

  test('Legit listing body does NOT fire logger', async () => {
    const errors: string[] = []
    const orig = console.error
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    }
    try {
      const fakeFetch = (async () =>
        new Response(LEGIT_HTML, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })) as typeof fetch
      const urls = await new RedfinSource(fakeFetch).extractPhotoUrls('https://www.redfin.com/example/home/123')
      expect(urls.length).toBeGreaterThanOrEqual(1)
      for (const u of urls) expect(u.startsWith('https://ssl.cdn-redfin.com/')).toBe(true)
      expect(errors.some((e) => /\[redfin\] WAF/.test(e))).toBe(false)
    } finally {
      console.error = orig
    }
  })
})
