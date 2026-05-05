import type { Env, Listing } from '../types'

const LISTING_STAGES = ['interested', 'contacted', 'tour_scheduled', 'rejected'] as const
type ListingStage = (typeof LISTING_STAGES)[number]

function isListingStage(value: unknown): value is ListingStage {
  return typeof value === 'string' && (LISTING_STAGES as readonly string[]).includes(value)
}

function parseOptionalInt(value: string | null): number | undefined {
  if (value == null || value === '') return undefined
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : undefined
}

function parseOptionalBit(value: string | null): 0 | 1 | undefined {
  if (value == null || value === '') return undefined
  if (value === '0') return 0
  if (value === '1') return 1
  return undefined
}

export async function handleListings(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/$/, '') || url.pathname

  if (path === '/api/listings' && request.method === 'GET') {
    const presetId = parseOptionalInt(url.searchParams.get('preset_id'))
    const seen = parseOptionalBit(url.searchParams.get('seen'))
    const bookmarked = parseOptionalBit(url.searchParams.get('bookmarked'))
    const limitRaw = parseOptionalInt(url.searchParams.get('limit'))
    const offsetRaw = parseOptionalInt(url.searchParams.get('offset'))
    const limit = limitRaw != null && limitRaw > 0 ? Math.min(limitRaw, 500) : 50
    const offset = offsetRaw != null && offsetRaw >= 0 ? offsetRaw : 0

    const where: string[] = ['1=1']
    const params: unknown[] = []
    if (presetId != null) {
      where.push('preset_id = ?')
      params.push(presetId)
    }
    if (seen != null) {
      where.push('seen = ?')
      params.push(seen)
    }
    if (bookmarked != null) {
      where.push('bookmarked = ?')
      params.push(bookmarked)
    }

    const whereSql = where.join(' AND ')
    const countRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM listings WHERE ${whereSql}`).bind(...params).first<{ c: number }>()
    const total = countRow?.c ?? 0

    const listParams = [...params, limit, offset]
    const rows = await env.DB
      .prepare(
        `SELECT id, preset_id, hunt_id, run_id, title, link, price_cents, address, beds, baths, image_url, scraped_at, seen, bookmarked, stage
         FROM listings WHERE ${whereSql}
         ORDER BY scraped_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...listParams)
      .all<Listing>()

    return Response.json({ listings: rows.results ?? [], total })
  }

  const patchMatch = path.match(/^\/api\/listings\/(\d+)$/)
  if (patchMatch && request.method === 'PATCH') {
    const id = Number(patchMatch[1])
    let body: { seen?: unknown; bookmarked?: unknown; stage?: unknown }
    try {
      body = (await request.json()) as { seen?: unknown; bookmarked?: unknown; stage?: unknown }
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const updates: string[] = []
    const values: unknown[] = []
    if (body.seen === 0 || body.seen === 1) {
      updates.push('seen = ?')
      values.push(body.seen)
    }
    if (body.bookmarked === 0 || body.bookmarked === 1) {
      updates.push('bookmarked = ?')
      values.push(body.bookmarked)
    }
    if (body.stage !== undefined) {
      if (!isListingStage(body.stage)) {
        return Response.json({ error: 'Invalid stage' }, { status: 400 })
      }
      updates.push('stage = ?')
      values.push(body.stage)
    }
    if (!updates.length) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    values.push(id)
    await env.DB.prepare(`UPDATE listings SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()

    const row = await env.DB
      .prepare(
        `SELECT id, preset_id, hunt_id, run_id, title, link, price_cents, address, beds, baths, image_url, scraped_at, seen, bookmarked, stage
         FROM listings WHERE id = ?`
      )
      .bind(id)
      .first<Listing>()
    if (!row) return new Response('Not found', { status: 404 })
    return Response.json(row)
  }

  return new Response('Not found', { status: 404 })
}
