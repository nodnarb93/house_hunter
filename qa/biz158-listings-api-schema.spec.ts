import Database from 'better-sqlite3'
import os from 'node:os'
import { test, expect, type APIRequestContext } from '@playwright/test'

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

async function createRssScraper(request: APIRequestContext) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/biz158-feed-${Date.now()}.xml` },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

async function seedBookmarkedListing(request: APIRequestContext, title: string) {
  const scraperId = await createRssScraper(request)
  const huntRes = await request.post('/api/house-hunts', { data: { name: `BIZ158 hunt ${Date.now()}` } })
  expect(huntRes.status()).toBe(201)
  const huntId = ((await huntRes.json()) as { id: number }).id

  const seed = await request.post('/api/test/seed-listing', {
    data: {
      title,
      link: `https://example.invalid/biz158-${Date.now()}`,
      hunt_id: huntId,
      scraper_id: scraperId,
      price_cents: 250_000_00,
    },
  })
  expect(seed.status()).toBe(201)
  const { id } = (await seed.json()) as { id: number }
  const patch = await request.patch(`/api/listings/${id}`, { data: { bookmarked: 1 } })
  expect(patch.status()).toBe(200)
  return { id, title }
}

type ListingJson = {
  id: number
  title: string
  nickname: string | null
  displayName?: string
  interested_notes: string | null
  contacted_notes: string | null
  tour_scheduled_at: string | null
  tour_notes: string | null
  walkthrough_notes: string | null
  rejection_reason: string | null
  stage: string
}

test.describe('BIZ-158 / BIZ-159 listings triage schema API', () => {
  test.beforeEach(async ({ request }) => {
    await wipeListings(request)
  })

  test('0014 migration adds triage columns (pragma)', async ({ request }) => {
    const res = await request.get('/api/test/runtime-info')
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { database_path: string }
    expect(body.database_path.startsWith(os.tmpdir())).toBe(true)

    const db = new Database(body.database_path, { readonly: true })
    try {
      const cols = db.prepare('PRAGMA table_info(listings)').all() as { name: string }[]
      const names = new Set(cols.map((c) => c.name))
      for (const col of [
        'nickname',
        'interested_notes',
        'contacted_notes',
        'tour_scheduled_at',
        'tour_notes',
        'walkthrough_notes',
        'rejection_reason',
      ]) {
        expect(names.has(col), `missing column ${col}`).toBe(true)
      }
    } finally {
      db.close()
    }
  })

  test('GET displayName falls back to title when nickname is null', async ({ request }) => {
    const title = `BIZ158 display fallback ${Date.now()}`
    const { id } = await seedBookmarkedListing(request, title)

    const listRes = await request.get('/api/listings?bookmarked=1')
    expect(listRes.status()).toBe(200)
    const data = (await listRes.json()) as { listings: ListingJson[] }
    const row = data.listings.find((l) => l.id === id)
    expect(row).toBeTruthy()
    expect(row!.nickname).toBeNull()
    expect(row!.displayName).toBe(title)
  })

  test('PATCH nickname updates displayName; empty string clears nickname', async ({ request }) => {
    const title = `BIZ158 nick ${Date.now()}`
    const { id, title: seededTitle } = await seedBookmarkedListing(request, title)

    const p1 = await request.patch(`/api/listings/${id}`, { data: { nickname: 'Mid-century gem' } })
    expect(p1.status()).toBe(200)
    const j1 = (await p1.json()) as ListingJson
    expect(j1.displayName).toBe('Mid-century gem')
    expect(j1.nickname).toBe('Mid-century gem')

    const p2 = await request.patch(`/api/listings/${id}`, { data: { nickname: '' } })
    expect(p2.status()).toBe(200)
    const j2 = (await p2.json()) as ListingJson
    expect(j2.nickname).toBeNull()
    expect(j2.displayName).toBe(seededTitle)
  })

  test('PATCH stage walkthrough vs invalid', async ({ request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ158 stage ${Date.now()}`)

    const ok = await request.patch(`/api/listings/${id}`, { data: { stage: 'walkthrough' } })
    expect(ok.status()).toBe(200)
    const okBody = (await ok.json()) as ListingJson
    expect(okBody.stage).toBe('walkthrough')

    const bad = await request.patch(`/api/listings/${id}`, { data: { stage: 'bogus' } })
    expect(bad.status()).toBe(400)
  })

  test('PATCH nullable text fields round-trip and empty string to null', async ({ request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ158 roundtrip ${Date.now()}`)

    const fields = [
      'interested_notes',
      'contacted_notes',
      'tour_scheduled_at',
      'tour_notes',
      'walkthrough_notes',
      'rejection_reason',
    ] as const

    for (const field of fields) {
      const value = `val-${field}-${Date.now()}`
      const patch1 = await request.patch(`/api/listings/${id}`, { data: { [field]: value } })
      expect(patch1.status()).toBe(200)

      const get1 = await request.get('/api/listings?bookmarked=1')
      expect(get1.status()).toBe(200)
      const row1 = ((await get1.json()) as { listings: ListingJson[] }).listings.find((l) => l.id === id)
      expect(row1?.[field]).toBe(value)

      const patch2 = await request.patch(`/api/listings/${id}`, { data: { [field]: '' } })
      expect(patch2.status()).toBe(200)

      const get2 = await request.get('/api/listings?bookmarked=1')
      expect(get2.status()).toBe(200)
      const row2 = ((await get2.json()) as { listings: ListingJson[] }).listings.find((l) => l.id === id)
      expect(row2?.[field]).toBeNull()
    }
  })

  test('combined PATCH persists nickname, tour_notes, and stage', async ({ request }) => {
    const { id } = await seedBookmarkedListing(request, `BIZ158 combo ${Date.now()}`)

    const patch = await request.patch(`/api/listings/${id}`, {
      data: { nickname: 'X', tour_notes: 'Y', stage: 'tour_scheduled' },
    })
    expect(patch.status()).toBe(200)
    const patched = (await patch.json()) as ListingJson
    expect(patched.nickname).toBe('X')
    expect(patched.tour_notes).toBe('Y')
    expect(patched.stage).toBe('tour_scheduled')

    const getRes = await request.get('/api/listings?bookmarked=1')
    expect(getRes.status()).toBe(200)
    const row = ((await getRes.json()) as { listings: ListingJson[] }).listings.find((l) => l.id === id)
    expect(row?.nickname).toBe('X')
    expect(row?.tour_notes).toBe('Y')
    expect(row?.stage).toBe('tour_scheduled')
  })
})
