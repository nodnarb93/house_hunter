import { readFileSync } from 'node:fs'
import path from 'node:path'

export function createRedfinFixtureFetch(): typeof fetch {
  return async function fixtureFetch(): Promise<Response> {
    const html = readFileSync(path.join(process.cwd(), 'qa/fixtures/redfin-listing.html'), 'utf8')
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
  } as typeof fetch
}
