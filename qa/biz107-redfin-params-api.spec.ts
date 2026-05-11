import { test, expect } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test.describe('BIZ-107 Redfin params API', () => {
  let scraperId = 0

  test('POST creates redfin row and config_json holds structured values', async ({ request }) => {
    const create = await request.post('/api/scraper-sources', {
      data: {
        kind: 'redfin',
        region_id: 4664,
        region_type: 6,
        market: 'columbus',
        status: 9,
        num_homes: 100,
        min_price: 200_000,
        max_price: 600_000,
        min_beds: 3,
        uipt: '1,2,3',
      },
    })
    expect(create.status()).toBe(201)
    const created = (await create.json()) as { id: number; config_json: string | null }
    scraperId = created.id
    const cfg = JSON.parse(created.config_json ?? '{}') as Record<string, unknown>
    expect(cfg.region_id).toBe(4664)
    expect(cfg.region_type).toBe(6)
    expect(cfg.market).toBe('columbus')
    expect(cfg.status).toBe(9)
    expect(cfg.num_homes).toBe(100)
    expect(cfg.min_price).toBe(200_000)
    expect(cfg.max_price).toBe(600_000)
    expect(cfg.min_beds).toBe(3)
    expect(cfg.uipt).toBe('1,2,3')
  })

  test('GET /:id returns structured params for redfin source', async ({ request }) => {
    const res = await request.get(`/api/scraper-sources/${scraperId}`)
    expect(res.status()).toBe(200)
    const body = (await res.json()) as {
      kind: string
      params: {
        region_id: number
        status: number
        num_homes: number
        uipt: string | null
      }
    }
    expect(body.kind).toBe('redfin')
    expect(body.params.region_id).toBe(4664)
    expect(body.params.status).toBe(9)
    expect(body.params.num_homes).toBe(100)
    expect(body.params.uipt).toBe('1,2,3')
  })

  test('PATCH happy path updates config_json', async ({ request }) => {
    const patch = await request.patch(`/api/scraper-sources/${scraperId}`, {
      data: {
        region_id: 4664,
        region_type: 6,
        market: 'columbus',
        status: 1,
        num_homes: 50,
      },
    })
    expect(patch.status()).toBe(200)
    const patched = (await patch.json()) as { params: { status: number; num_homes: number } }
    expect(patched.params.status).toBe(1)
    expect(patched.params.num_homes).toBe(50)

    const get = await request.get(`/api/scraper-sources/${scraperId}`)
    expect(get.status()).toBe(200)
    const got = (await get.json()) as { params: { status: number; num_homes: number } }
    expect(got.params.status).toBe(1)
    expect(got.params.num_homes).toBe(50)
  })

  test('PATCH rejects min>max beds with 400', async ({ request }) => {
    const patch = await request.patch(`/api/scraper-sources/${scraperId}`, {
      data: {
        region_id: 4664,
        region_type: 6,
        market: 'columbus',
        min_beds: 5,
        max_beds: 2,
        num_homes: 50,
        page_number: 1,
        status: 1,
      },
    })
    expect(patch.status()).toBe(400)
    const err = (await patch.json()) as { error: string }
    expect(err.error).toMatch(/min.*beds.*greater|max.*beds.*less/i)
  })

  test('PATCH on non-existent id returns 404', async ({ request }) => {
    const patch = await request.patch('/api/scraper-sources/999999999', {
      data: {
        region_id: 1,
        region_type: 6,
        market: 'x',
      },
    })
    expect(patch.status()).toBe(404)
  })

  test('PATCH on rss-kind source returns 400', async ({ request }) => {
    const create = await request.post('/api/scraper-sources', {
      data: { url: 'https://example.com/feed.xml' },
    })
    expect(create.status()).toBe(201)
    const rss = (await create.json()) as { id: number; kind: string }
    expect(rss.kind).toBe('rss')

    const patch = await request.patch(`/api/scraper-sources/${rss.id}`, {
      data: { region_id: 1, region_type: 6, market: 'x' },
    })
    expect(patch.status()).toBe(400)
    const err = (await patch.json()) as { error: string }
    expect(err.error.toLowerCase()).toContain('redfin')

    await request.delete(`/api/scraper-sources/${rss.id}`)
  })

  test('DELETE test redfin row', async ({ request }) => {
    const del = await request.delete(`/api/scraper-sources/${scraperId}`)
    expect(del.status()).toBe(200)
  })
})
