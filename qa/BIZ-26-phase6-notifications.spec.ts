import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { test, expect } from '@playwright/test'

/**
 * Phase 6 (BIZ-36): per-hunt notification routing after new listings.
 *
 * Production path is exercised via scheduler/pipeline calling `notifyHuntsForNewListings`.
 * Playwright uses PLAYWRIGHT_TEST-only routes to seed a listing and invoke the same
 * notifier without relying on outbound intercept from the browser.
 */

test('POST scrape pipeline: hunt webhook receives matching listing; results include listing', async ({
  page,
  request,
}) => {
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
  let listingId: number | undefined

  try {
    const post = await request.post('/api/house-hunts', { data: { name: `Phase6 notif ${Date.now()}` } })
    expect(post.status()).toBe(201)
    huntId = ((await post.json()) as { id: number }).id

    const put = await request.put(`/api/house-hunts/${huntId}`, {
      data: {
        filters: {},
        notifications: [{ type: 'webhook', destination: webhookUrl, enabled: true }],
      },
    })
    expect(put.status()).toBe(200)

    const uniqueLink = `https://example.invalid/phase6-listing-${Date.now()}`
    const seed = await request.post('/api/test/seed-listing', {
      data: {
        title: 'Test Listing Phase6',
        link: uniqueLink,
        price_cents: 25_000_000,
        address: '123 Test St',
        beds: 2,
        baths: 1,
      },
    })
    expect(seed.status()).toBe(201)
    listingId = ((await seed.json()) as { id: number }).id

    const evalRes = await request.post('/api/test/evaluate-notifications', {
      data: { listing_ids: [listingId] },
    })
    expect(evalRes.status()).toBe(200)

    expect(receivedBody).toBeTruthy()
    const payload = receivedBody as {
      hunt_id: number
      hunt_name: string
      matches: Array<{ id: number; title: string; link: string }>
    }
    expect(payload.hunt_id).toBe(huntId)
    expect(payload.matches).toHaveLength(1)
    expect(payload.matches[0].id).toBe(listingId)
    expect(payload.matches[0].link).toBe(uniqueLink)

    const results = await request.get(`/api/house-hunts/${huntId}/results`)
    expect(results.status()).toBe(200)
    const listings = (await results.json()) as Array<{ id: number; link: string }>
    expect(listings.some((l) => l.id === listingId)).toBe(true)
  } finally {
    if (huntId !== undefined) {
      await request.delete(`/api/house-hunts/${huntId}`)
    }
    if (listingId !== undefined) {
      await request.delete(`/api/test/listings/${listingId}`)
    }
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  }

  expect(errors).toEqual([])
})
