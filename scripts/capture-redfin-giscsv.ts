/**
 * One-shot capture of Redfin stingray GIS-CSV for gis-csv investigation (BIZ-83/84).
 *
 * Usage:
 *   npx tsx scripts/capture-redfin-giscsv.ts <redfin-search-url>
 *
 * Example:
 *   npx tsx scripts/capture-redfin-giscsv.ts https://www.redfin.com/city/4664/OH/Columbus
 *
 * Writes body (csv or json), status, headers, meta, and sanity to
 * qa/captures/redfin-giscsv-investigation-{YYYYMMDD}/.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'
import {
  REDFIN_FETCH_HEADERS,
  buildStingrayGisCsvUrl,
  parseRedfinUrl,
} from '../server/scrapers/redfinAdapter'

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

function firstLines(text: string, n: number): string[] {
  const lines = text.split(/\r?\n/)
  return lines.slice(0, n)
}

async function main() {
  const searchUrl = process.argv[2]
  if (!searchUrl) {
    console.error('Usage: npx tsx scripts/capture-redfin-giscsv.ts <redfin-search-url>')
    process.exit(2)
  }

  const parsedParams = parseRedfinUrl(searchUrl)
  if (!parsedParams) {
    console.error(`Not a supported Redfin city/zip search URL: ${searchUrl}`)
    process.exit(2)
  }

  const gisCsvUrl = buildStingrayGisCsvUrl(parsedParams)
  const fetchedAt = new Date()
  const dateStamp = utcDateStamp(fetchedAt)
  const outDir = path.join('qa', 'captures', `redfin-giscsv-investigation-${dateStamp}`)
  mkdirSync(outDir, { recursive: true })

  const requestHeaders = { ...REDFIN_FETCH_HEADERS }

  const t0 = Date.now()
  const res = await fetch(gisCsvUrl, {
    headers: { ...requestHeaders },
    signal: AbortSignal.timeout(15_000),
  })
  const body = await res.text()
  const durationMs = Date.now() - t0

  const ct = (res.headers.get('content-type') ?? '').toLowerCase()
  const bodyFile = ct.includes('json') ? 'body.json' : 'body.csv'
  writeFileSync(path.join(outDir, bodyFile), body, 'utf8')
  writeFileSync(path.join(outDir, 'status.txt'), `${res.status} ${res.statusText}\n`, 'utf8')
  writeFileSync(path.join(outDir, 'headers.json'), JSON.stringify(headersToObject(res.headers), null, 2), 'utf8')

  const meta = {
    url: searchUrl,
    fetchedAtUtc: fetchedAt.toISOString(),
    durationMs,
    host: hostname(),
    platform: process.platform,
    nodeVersion: process.version,
    requestHeaders,
    gisCsvUrl,
    parsedParams,
  }
  writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')

  const preview = firstLines(body, 5).join('\n')
  const sanity = [
    `Search URL:    ${searchUrl}`,
    `GIS-CSV URL:   ${gisCsvUrl}`,
    `Status:        ${res.status} ${res.statusText}`,
    `Body bytes:    ${body.length}`,
    `Duration ms:   ${durationMs}`,
    `Out dir:       ${outDir}`,
    `Body file:     ${bodyFile}`,
    `First 5 lines:`,
    preview,
  ].join('\n')
  console.log(sanity)
  writeFileSync(path.join(outDir, 'sanity.txt'), sanity + '\n', 'utf8')
}

main().catch((err) => {
  console.error('capture-redfin-giscsv failed:', err)
  process.exit(1)
})
