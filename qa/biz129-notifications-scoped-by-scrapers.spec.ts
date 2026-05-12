import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { test, expect, type APIRequestContext } from '@playwright/test'

async function createRssScraper(request: APIRequestContext, suffix: string) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/notif-feed-${suffix}-${Date.now()}.xml` },
  })
  expect(res.status()).toBe(201)
  return (await res.json()) as { id: number }
}

test('evaluate-notifications: webhook only for listings in hunt scraper set', async ({ page, request }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.goto('/')

  let receivedBody: unknown
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    let raw = ''
    req.on('data', (c) => {
      raw += String(c)
    })
    req.on('end', () => {
      try {
        receivedBody = JSON.parse(raw) as unknown
      } catch {
        receivedBody = null
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const webhookUrl = `http://127.0.0.1:${port}/hook`

  let huntId: number | undefined
  let scraperA: number | undefined
  let scraperB: number | undefined
  let listingA: number | undefined
  let listingB: number | undefined

  try {
    const a = await createRssScraper(request, 'a-notif')
    const b = await createRssScraper(request, 'b-notif')
    scraperA = a.id
    scraperB = b.id

    const post = await request.post('/api/house-hunts', { data: { name: `BIZ129 notif ${Date.now()}` } })
    expect(post.status()).toBe(201)
    huntId = ((await post.json()) as { id: number }).id

    const put = await request.put(`/api/house-hunts/${huntId}`, {
      data: {
        scraper_ids: [scraperA],
        filters: {},
        notifications: [{ type: 'webhook', destination: webhookUrl, enabled: true }],
      },
    })
    expect(put.status()).toBe(200)

    const linkA = `https://example.invalid/biz129-notif-a-${Date.now()}`
    const linkB = `https://example.invalid/biz129-notif-b-${Date.now()}`

    const seedA = await request.post('/api/test/seed-listing', {
      data: {
        title: 'Notif A listing',
        link: linkA,
        price_cents: 25_000_000,
        scraper_id: scraperA,
      },
    })
    const seedB = await request.post('/api/test/seed-listing', {
      data: {
        title: 'Notif B listing',
        link: linkB,
        price_cents: 25_000_000,
        scraper_id: scraperB,
      },
    })
    expect(seedA.status()).toBe(201)
    expect(seedB.status()).toBe(201)
    listingA = ((await seedA.json()) as { id: number }).id
    listingB = ((await seedB.json()) as { id: number }).id

    const evalRes = await request.post('/api/test/evaluate-notifications', {
      data: { listing_ids: [listingA, listingB] },
    })
    expect(evalRes.status()).toBe(200)

    expect(receivedBody).toBeTruthy()
    const payload = receivedBody as {
      hunt_id: number
      matches: Array<{ id: number; link: string }>
    }
    expect(payload.hunt_id).toBe(huntId)
    expect(payload.matches).toHaveLength(1)
    expect(payload.matches[0].id).toBe(listingA)
    expect(payload.matches[0].link).toBe(linkA)
    expect(payload.matches.some((m) => m.id === listingB)).toBe(false)
  } finally {
    if (huntId !== undefined) await request.delete(`/api/house-hunts/${huntId}`).catch(() => {})
    if (listingA !== undefined) await request.delete(`/api/test/listings/${listingA}`).catch(() => {})
    if (listingB !== undefined) await request.delete(`/api/test/listings/${listingB}`).catch(() => {})
    if (scraperA !== undefined) await request.delete(`/api/scrapers/${scraperA}`).catch(() => {})
    if (scraperB !== undefined) await request.delete(`/api/scrapers/${scraperB}`).catch(() => {})
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  }

  expect(errors).toEqual([])
})
