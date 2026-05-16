import Database from 'better-sqlite3'
import os from 'node:os'
import { test, expect, type APIRequestContext } from '@playwright/test'

const seeds: { listingIds: number[]; huntIds: number[]; scraperIds: number[] } = {
  listingIds: [],
  huntIds: [],
  scraperIds: [],
}

async function wipeListings(request: APIRequestContext) {
  const res = await request.delete('/api/test/listings')
  expect(res.status()).toBe(204)
}

async function createHunt(request: APIRequestContext, name: string) {
  const res = await request.post('/api/house-hunts', { data: { name } })
  expect(res.status()).toBe(201)
  const id = ((await res.json()) as { id: number }).id
  seeds.huntIds.push(id)
  return id
}

async function createScraper(request: APIRequestContext, url: string) {
  const res = await request.post('/api/scrapers', { data: { url } })
  expect(res.status()).toBe(201)
  const id = ((await res.json()) as { id: number }).id
  seeds.scraperIds.push(id)
  return id
}

async function attachScraper(request: APIRequestContext, huntId: number, scraperId: number) {
  const put = await request.put(`/api/house-hunts/${huntId}`, { data: { scraper_ids: [scraperId] } })
  expect(put.status()).toBe(200)
}

async function seedListing(
  request: APIRequestContext,
  opts: { title: string; huntId: number; scraperId: number },
) {
  const res = await request.post('/api/test/seed-listing', {
    data: {
      title: opts.title,
      link: `https://example.invalid/biz286a-ui-${Date.now()}-${Math.random()}`,
      hunt_id: opts.huntId,
      scraper_id: opts.scraperId,
    },
  })
  expect(res.status()).toBe(201)
  const { id } = (await res.json()) as { id: number }
  seeds.listingIds.push(id)
  return id
}

function openTestDb(request: APIRequestContext) {
  return request.get('/api/test/runtime-info').then(async (res) => {
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { database_path: string }
    expect(body.database_path.startsWith(os.tmpdir())).toBe(true)
    return new Database(body.database_path)
  })
}

function readHuntId(db: Database.Database, listingId: number): number | null {
  const row = db.prepare('SELECT hunt_id FROM listings WHERE id = ?').get(listingId) as
    | { hunt_id: number | null }
    | undefined
  return row?.hunt_id ?? null
}

test.describe('BIZ-286a HuntDetail bookmark sets hunt_id', () => {
  test.beforeEach(async ({ request }) => {
    seeds.listingIds = []
    seeds.huntIds = []
    seeds.scraperIds = []
    await wipeListings(request)
  })

  test.afterEach(async ({ request }) => {
    while (seeds.listingIds.length > 0) {
      const id = seeds.listingIds.pop()!
      await request.delete(`/api/test/listings/${id}`).catch(() => {})
    }
    while (seeds.huntIds.length > 0) {
      const id = seeds.huntIds.pop()!
      await request.delete(`/api/house-hunts/${id}`).catch(() => {})
    }
    while (seeds.scraperIds.length > 0) {
      const id = seeds.scraperIds.pop()!
      await request.delete(`/api/scrapers/${id}`).catch(() => {})
    }
  })

  test('bookmark from hunt B overwrites hunt_id; un-bookmark preserves it', async ({ page, request }) => {
    const scraperId = await createScraper(request, `https://example.invalid/biz286a-ui-${Date.now()}.xml`)
    const huntA = await createHunt(request, `BIZ286a UI hunt A ${Date.now()}`)
    const huntB = await createHunt(request, `BIZ286a UI hunt B ${Date.now()}`)
    await attachScraper(request, huntA, scraperId)
    await attachScraper(request, huntB, scraperId)

    const listingId = await seedListing(request, {
      title: 'BIZ286a bookmark provenance',
      huntId: huntA,
      scraperId,
    })

    await page.goto(`/hunts/${huntB}`)
    const bookmarkBtn = page.getByTestId(`hunt-result-bookmark-${listingId}`)
    await expect(bookmarkBtn).toBeVisible({ timeout: 15_000 })

    await bookmarkBtn.click()
    await expect(bookmarkBtn).toHaveText('Saved')

    const db = await openTestDb(request)
    try {
      expect(readHuntId(db, listingId)).toBe(huntB)

      await bookmarkBtn.click()
      await expect(bookmarkBtn).toHaveText('Bookmark')

      expect(readHuntId(db, listingId)).toBe(huntB)
    } finally {
      db.close()
    }
  })
})
