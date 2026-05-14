import type { Env, Listing } from '../types'
import { runImageBackfillForListings } from '../listingImageBackfill'

const LISTING_STAGES = ['interested', 'contacted', 'tour_scheduled', 'walkthrough', 'rejected'] as const
type ListingStage = (typeof LISTING_STAGES)[number]

const NULLABLE_STRING_PATCH_KEYS = [
  'nickname',
  'interested_notes',
  'contacted_notes',
  'tour_scheduled_at',
  'tour_notes',
  'walkthrough_notes',
  'rejection_reason',
] as const

const LISTING_SELECT_COLUMNS = `id, preset_id, hunt_id, run_id, title, link, price_cents, address, beds, baths, image_url, scraped_at, seen, bookmarked, stage,
         nickname, interested_notes, contacted_notes, tour_scheduled_at, tour_notes, walkthrough_notes, rejection_reason`

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

function serializeListing(row: Omit<Listing, 'displayName'>): Listing {
  return {
    ...row,
    displayName: row.nickname ?? row.title,
  }
}

export async function handleListings(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/$/, '') || url.pathname

  const imagesListMatch = path.match(/^\/api\/listings\/(\d+)\/images$/)
  if (imagesListMatch && request.method === 'GET') {
    const listingId = Number(imagesListMatch[1])
    if (!Number.isFinite(listingId)) return Response.json({ error: 'Invalid listing id' }, { status: 400 })
    const rows = await env.DB
      .prepare('SELECT url FROM listing_image_urls WHERE listing_id = ? ORDER BY display_order ASC')
      .bind(listingId)
      .all<{ url: string }>()
    const urls = (rows.results ?? []).map((r) => r.url)
    return Response.json({ urls })
  }

  const imagesCountMatch = path.match(/^\/api\/listings\/(\d+)\/images\/count$/)
  if (imagesCountMatch && request.method === 'GET') {
    const listingId = Number(imagesCountMatch[1])
    if (!Number.isFinite(listingId)) return Response.json({ error: 'Invalid listing id' }, { status: 400 })
    const urlRow = await env.DB
      .prepare('SELECT COUNT(*) as count FROM listing_image_urls WHERE listing_id = ?')
      .bind(listingId)
      .first<{ count: number }>()
    const count = urlRow?.count ?? 0
    return Response.json({ count })
  }

  if (path === '/api/listings/backfill-images' && request.method === 'POST') {
    const listingIdFilter = parseOptionalInt(url.searchParams.get('listing_id'))
    const { queued, succeeded, failed } = await runImageBackfillForListings(env.DB, {
      listingIdFilter,
      logger: console.warn,
    })
    return Response.json({ ok: true, queued, succeeded, failed })
  }

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
        `SELECT ${LISTING_SELECT_COLUMNS}
         FROM listings WHERE ${whereSql}
         ORDER BY scraped_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...listParams)
      .all<Omit<Listing, 'displayName'>>()

    const listings = (rows.results ?? []).map(serializeListing)
    return Response.json({ listings, total })
  }

  const patchMatch = path.match(/^\/api\/listings\/(\d+)$/)
  if (patchMatch && request.method === 'PATCH') {
    const id = Number(patchMatch[1])
    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
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

    for (const key of NULLABLE_STRING_PATCH_KEYS) {
      if (!(key in body)) continue
      const v = body[key as string]
      if (v !== null && typeof v !== 'string') {
        return Response.json({ error: 'Invalid field value' }, { status: 400 })
      }
      if (v === null || v === '') {
        updates.push(`${key} = ?`)
        values.push(null)
      } else {
        updates.push(`${key} = ?`)
        values.push(v)
      }
    }

    if (!updates.length) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    values.push(id)
    await env.DB.prepare(`UPDATE listings SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()

    const row = await env.DB
      .prepare(`SELECT ${LISTING_SELECT_COLUMNS} FROM listings WHERE id = ?`)
      .bind(id)
      .first<Omit<Listing, 'displayName'>>()
    if (!row) return new Response('Not found', { status: 404 })
    return Response.json(serializeListing(row))
  }

  return new Response('Not found', { status: 404 })
}
