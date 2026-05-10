import { readFileSync } from 'node:fs'
import path from 'node:path'

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

export function createRedfinFixtureFetch(): typeof fetch {
  return async function fixtureFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const href = requestUrl(input)
    if (href.includes('ssl.cdn-redfin.com')) {
      return globalThis.fetch(input, init)
    }
    const html = readFileSync(path.join(process.cwd(), 'qa/fixtures/redfin-listing.html'), 'utf8')
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
  } as typeof fetch
}
