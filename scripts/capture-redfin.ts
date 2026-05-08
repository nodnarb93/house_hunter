/**
 * One-shot capture of a Redfin listing HTML response under the same fetch
 * conditions the production scheduled scraper uses. See BIZ-81 for context.
 *
 * Usage:
 *   npx tsx scripts/capture-redfin.ts <listing-url>
 *
 * Writes body, status, headers, meta, and a sanity-check log to
 * qa/captures/redfin-{listingId}-{YYYYMMDD}/.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'
import { REDFIN_FETCH_HEADERS, extractPhotoUrls } from '../server/scrapers/redfinAdapter'

function parseListingId(url: string): string {
  const match = url.match(/\/home\/(\d+)/)
  if (!match) throw new Error(`Could not extract /home/{N} listing id from URL: ${url}`)
  return match[1]
}

function utcDateStamp(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0')
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = d.getUTCDate().toString().padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  h.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      out[key] = '[REDACTED]'
    } else {
      out[key] = value
    }
  })
  return out
}

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: npx tsx scripts/capture-redfin.ts <listing-url>')
    process.exit(2)
  }

  const listingId = parseListingId(url)
  const fetchedAt = new Date()
  const dateStamp = utcDateStamp(fetchedAt)
  const outDir = path.join('qa', 'captures', `redfin-${listingId}-${dateStamp}`)
  mkdirSync(outDir, { recursive: true })

  const requestHeaders = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    ...REDFIN_FETCH_HEADERS,
  }

  const t0 = Date.now()
  const res = await fetch(url, {
    headers: { ...requestHeaders },
    signal: AbortSignal.timeout(15_000),
  })
  const body = await res.text()
  const durationMs = Date.now() - t0

  writeFileSync(path.join(outDir, 'body.html'), body, 'utf8')
  writeFileSync(path.join(outDir, 'status.txt'), `${res.status} ${res.statusText}\n`, 'utf8')
  writeFileSync(path.join(outDir, 'headers.json'), JSON.stringify(headersToObject(res.headers), null, 2), 'utf8')

  const meta = {
    url,
    listingId,
    fetchedAtUtc: fetchedAt.toISOString(),
    durationMs,
    host: hostname(),
    platform: process.platform,
    nodeVersion: process.version,
    requestHeaders,
  }
  writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')

  let extractCount = -1
  let extractError: string | null = null
  let extractSample: string[] = []
  try {
    const urls = extractPhotoUrls(body)
    extractCount = urls.length
    extractSample = urls.slice(0, 3)
  } catch (err) {
    extractError = err instanceof Error ? err.message : String(err)
  }

  const sanity = [
    `URL:           ${url}`,
    `Status:        ${res.status} ${res.statusText}`,
    `Body bytes:    ${body.length}`,
    `Duration ms:   ${durationMs}`,
    `Out dir:       ${outDir}`,
    `extractPhotoUrls(body) count: ${extractCount}`,
    `extractPhotoUrls(body) error: ${extractError ?? 'none'}`,
    `extractPhotoUrls first 3:    ${JSON.stringify(extractSample)}`,
  ].join('\n')
  console.log(sanity)
  writeFileSync(path.join(outDir, 'sanity.txt'), sanity + '\n', 'utf8')
}

main().catch((err) => {
  console.error('capture-redfin failed:', err)
  process.exit(1)
})
