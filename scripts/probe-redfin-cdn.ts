/**
 * BIZ-94 Phase 1: probe Redfin CDN URL patterns for listing photo JPEGs.
 *
 * Run: DATABASE_PATH=/path/to/house_hunter.sqlite npx tsx scripts/probe-redfin-cdn.ts
 */

import Database from 'better-sqlite3'
import path from 'node:path'
import { REDFIN_FETCH_HEADERS } from '../server/scrapers/redfinAdapter'

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data/house_hunter.sqlite')

const HEADERS: Record<string, string> = {
  Accept: 'image/*',
  ...REDFIN_FETCH_HEADERS,
} as Record<string, string>

const DELAY_MS = 150

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function extractHomeId(link: string): string | null {
  const m = link.match(/\/home\/(\d+)/)
  return m ? m[1] : null
}

function candidateUrls(id: number): string[] {
  const mod = id % 1000
  return [
    `https://ssl.cdn-redfin.com/photo/160/bigphoto/${mod}/${id}_1.jpg`,
    `https://ssl.cdn-redfin.com/photo/1/bigphoto/${mod}/${id}_1.jpg`,
    `https://ssl.cdn-redfin.com/photo/2/bigphoto/${mod}/${id}_1.jpg`,
    `https://ssl.cdn-redfin.com/photo/${mod}/bigphoto/${mod}/${id}_1.jpg`,
    `https://ssl.cdn-redfin.com/photo/161/bigphoto/${mod}/${id}_1.jpg`,
  ]
}

function indexUrls160(id: number, from: number, to: number): string[] {
  const mod = id % 1000
  const out: string[] = []
  for (let i = from; i <= to; i++) {
    out.push(`https://ssl.cdn-redfin.com/photo/160/bigphoto/${mod}/${id}_${i}.jpg`)
  }
  return out
}

async function probeOne(url: string): Promise<{ status: number; ct: string; len: string }> {
  try {
    let res = await fetch(url, { method: 'HEAD', headers: HEADERS })
    if (res.status === 405) {
      res = await fetch(url, {
        method: 'GET',
        headers: { ...HEADERS, Range: 'bytes=0-0' },
      })
    }
    const ct = res.headers.get('content-type') ?? ''
    const cl = res.headers.get('content-length') ?? ''
    return { status: res.status, ct, len: cl }
  } catch (e) {
    return { status: 0, ct: '', len: String(e) }
  }
}

async function main(): Promise<void> {
  const lines: string[] = []
  const log = (s: string) => {
    lines.push(s)
    console.log(s)
  }

  const db = new Database(DB_PATH, { readonly: true })
  const rows = db
    .prepare(
      `SELECT id, link FROM listings WHERE link LIKE '%redfin.com%' AND link LIKE '%/home/%' ORDER BY scraped_at DESC LIMIT 12`,
    )
    .all() as { id: string; link: string }[]

  const ids = new Set<string>()
  for (const r of rows) {
    const hid = extractHomeId(r.link)
    if (hid) ids.add(hid)
  }
  ids.add('226013463')

  const idList = [...ids]
  if (idList.length < 5) {
    log(`WARN: only ${idList.length} distinct home IDs from DB + hard-coded; continuing.`)
  }

  for (const sid of idList) {
    const id = parseInt(sid, 10)
    log(`\n=== property ${id} ===`)
    for (const u of candidateUrls(id)) {
      const { status, ct, len } = await probeOne(u)
      log(`${status}\t${ct}\t${len}\t${u}`)
      await sleep(DELAY_MS)
    }
    if (id === 226013463) {
      log(`\n--- indices 2..15 on /photo/160/ for ${id} ---`)
      for (const u of indexUrls160(id, 2, 15)) {
        const { status, ct, len } = await probeOne(u)
        log(`${status}\t${ct}\t${len}\t${u}`)
        await sleep(DELAY_MS)
      }
    }
  }

  const outPath = path.join(
    process.cwd(),
    'qa/captures/redfin-cdn-pattern-20260509/probe-output.txt',
  )
  await import('node:fs/promises').then((fs) => fs.mkdir(path.dirname(outPath), { recursive: true }))
  await import('node:fs/promises').then((fs) => fs.writeFile(outPath, lines.join('\n') + '\n', 'utf8'))
  log(`\nWrote ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
