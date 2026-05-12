import { test, expect, type APIRequestContext } from '@playwright/test'

async function createRssScraper(request: APIRequestContext, suffix: string) {
  const res = await request.post('/api/scrapers', {
    data: { url: `https://example.invalid/feed-${suffix}-${Date.now()}.xml` },
  })
  expect(res.status()).toBe(201)
  return (await res.json()) as { id: number }
}

test('GET hunt results: empty scraper set returns [] even when matching listings exist', async ({ request }) => {
  let huntId: number | undefined
  let scraperId: number | undefined
  let listingId: number | undefined
  try {
    const scraper = await createRssScraper(request, 'empty')
    scraperId = scraper.id

    const post = await request.post('/api/house-hunts', { data: { name: `BIZ129 empty ${Date.now()}` } })
    expect(post.status()).toBe(201)
    huntId = ((await post.json()) as { id: number }).id

    const seed = await request.post('/api/test/seed-listing', {
      data: {
        title: 'Orphan scope listing',
        link: `https://example.invalid/biz129-empty-${Date.now()}`,
        price_cents: 50_000_000,
        scraper_id: scraperId,
      },
    })
    expect(seed.status()).toBe(201)
    listingId = ((await seed.json()) as { id: number }).id

    const results = await request.get(`/api/house-hunts/${huntId}/results`)
    expect(results.status()).toBe(200)
    const rows = (await results.json()) as unknown[]
    expect(rows).toEqual([])
  } finally {
    if (huntId !== undefined) await request.delete(`/api/house-hunts/${huntId}`).catch(() => {})
    if (listingId !== undefined) await request.delete(`/api/test/listings/${listingId}`).catch(() => {})
    if (scraperId !== undefined) await request.delete(`/api/scrapers/${scraperId}`).catch(() => {})
  }
})

test('GET hunt results: only listings whose scraper is in the hunt scraper set', async ({ request }) => {
  let huntId: number | undefined
  let scraperA: number | undefined
  let scraperB: number | undefined
  let listingA: number | undefined
  let listingB: number | undefined
  try {
    const a = await createRssScraper(request, 'a-scope')
    const b = await createRssScraper(request, 'b-scope')
    scraperA = a.id
    scraperB = b.id

    const post = await request.post('/api/house-hunts', { data: { name: `BIZ129 scope ${Date.now()}` } })
    expect(post.status()).toBe(201)
    huntId = ((await post.json()) as { id: number }).id

    const put = await request.put(`/api/house-hunts/${huntId}`, {
      data: { scraper_ids: [scraperA] },
    })
    expect(put.status()).toBe(200)

    const linkA = `https://example.invalid/biz129-a-${Date.now()}`
    const linkB = `https://example.invalid/biz129-b-${Date.now()}`

    const seedA = await request.post('/api/test/seed-listing', {
      data: { title: 'A row', link: linkA, scraper_id: scraperA },
    })
    const seedB = await request.post('/api/test/seed-listing', {
      data: { title: 'B row', link: linkB, scraper_id: scraperB },
    })
    expect(seedA.status()).toBe(201)
    expect(seedB.status()).toBe(201)
    listingA = ((await seedA.json()) as { id: number }).id
    listingB = ((await seedB.json()) as { id: number }).id

    const results = await request.get(`/api/house-hunts/${huntId}/results`)
    expect(results.status()).toBe(200)
    const rows = (await results.json()) as Array<{ id: number; link: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].link).toBe(linkA)
  } finally {
    if (huntId !== undefined) await request.delete(`/api/house-hunts/${huntId}`).catch(() => {})
    if (listingA !== undefined) await request.delete(`/api/test/listings/${listingA}`).catch(() => {})
    if (listingB !== undefined) await request.delete(`/api/test/listings/${listingB}`).catch(() => {})
    if (scraperA !== undefined) await request.delete(`/api/scrapers/${scraperA}`).catch(() => {})
    if (scraperB !== undefined) await request.delete(`/api/scrapers/${scraperB}`).catch(() => {})
  }
})

test('GET hunt results: filters intersect with scraper set (B scraper cannot leak in)', async ({ request }) => {
  let huntId: number | undefined
  let scraperA: number | undefined
  let scraperB: number | undefined
  const listingIds: number[] = []
  try {
    const a = await createRssScraper(request, 'a-filter')
    const b = await createRssScraper(request, 'b-filter')
    scraperA = a.id
    scraperB = b.id

    const post = await request.post('/api/house-hunts', { data: { name: `BIZ129 filter ${Date.now()}` } })
    expect(post.status()).toBe(201)
    huntId = ((await post.json()) as { id: number }).id

    const put = await request.put(`/api/house-hunts/${huntId}`, {
      data: {
        scraper_ids: [scraperA],
        filters: { min_price: 200_000 },
      },
    })
    expect(put.status()).toBe(200)

    const seeds = [
      { scraper_id: scraperA, price_cents: 15_000_000, tag: 'a150' },
      { scraper_id: scraperA, price_cents: 30_000_000, tag: 'a300' },
      { scraper_id: scraperB, price_cents: 15_000_000, tag: 'b150' },
      { scraper_id: scraperB, price_cents: 30_000_000, tag: 'b300' },
    ] as const

    for (const s of seeds) {
      const r = await request.post('/api/test/seed-listing', {
        data: {
          title: `row ${s.tag}`,
          link: `https://example.invalid/biz129-${s.tag}-${Date.now()}`,
          price_cents: s.price_cents,
          scraper_id: s.scraper_id,
        },
      })
      expect(r.status()).toBe(201)
      listingIds.push(((await r.json()) as { id: number }).id)
    }

    const results = await request.get(`/api/house-hunts/${huntId}/results`)
    expect(results.status()).toBe(200)
    const rows = (await results.json()) as Array<{ id: number; price_cents: number | null; title: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].price_cents).toBe(30_000_000)
    expect(rows[0].title).toContain('a300')
  } finally {
    if (huntId !== undefined) await request.delete(`/api/house-hunts/${huntId}`).catch(() => {})
    for (const id of listingIds) {
      await request.delete(`/api/test/listings/${id}`).catch(() => {})
    }
    if (scraperA !== undefined) await request.delete(`/api/scrapers/${scraperA}`).catch(() => {})
    if (scraperB !== undefined) await request.delete(`/api/scrapers/${scraperB}`).catch(() => {})
  }
})
