import type { Env } from '../types'
import { buildHuntFilterWhereClause, type FilterState } from '../huntFilters'

/** SQL ORDER BY fragments; lookup is the only boundary — never interpolate raw user sort strings. */
export const SORT_KEYS = {
  price_asc: 'l.price_cents IS NULL, l.price_cents ASC, l.id ASC',
  price_desc: 'l.price_cents IS NULL, l.price_cents DESC, l.id DESC',
  scraped_desc: 'l.scraped_at DESC',
  scraped_asc: 'l.scraped_at ASC',
  bookmarked_first: 'l.bookmarked DESC, l.scraped_at DESC',
} as const

export type SortKey = keyof typeof SORT_KEYS

export const DEFAULT_SORT: SortKey = 'scraped_desc'

interface HouseHuntRow {
  id: number
  name: string
  created_at: string
}

interface FilterRow {
  hunt_id: number
  min_price: number | null
  max_price: number | null
  min_beds: number | null
  min_baths: number | null
  keywords: string | null
  keywords_exclude: string | null
  location_text: string | null
}

interface NotificationRow {
  id: number
  type: string
  destination: string
  enabled: number
}

const FILTER_COLS = [
  'min_price',
  'max_price',
  'min_beds',
  'min_baths',
  'keywords',
  'keywords_exclude',
  'location_text',
] as const

function emptyFilters(): FilterState {
  return {
    min_price: null,
    max_price: null,
    min_beds: null,
    min_baths: null,
    keywords: null,
    keywords_exclude: null,
    location_text: null,
  }
}

function rowToFilters(row: FilterRow | null): FilterState {
  if (!row) return emptyFilters()
  return {
    min_price: row.min_price,
    max_price: row.max_price,
    min_beds: row.min_beds,
    min_baths: row.min_baths,
    keywords: row.keywords,
    keywords_exclude: row.keywords_exclude,
    location_text: row.location_text,
  }
}

function jsonFilters(f: FilterState) {
  return {
    min_price: f.min_price,
    max_price: f.max_price,
    min_beds: f.min_beds,
    min_baths: f.min_baths,
    keywords: f.keywords,
    keywords_exclude: f.keywords_exclude,
    location_text: f.location_text,
  }
}

async function loadFilterState(env: Env, huntId: number): Promise<FilterState> {
  const row = await env.DB.prepare(
    'SELECT hunt_id, min_price, max_price, min_beds, min_baths, keywords, keywords_exclude, location_text FROM house_hunt_filters WHERE hunt_id = ?'
  )
    .bind(huntId)
    .first<FilterRow>()
  return rowToFilters(row)
}

async function buildHuntDetail(env: Env, huntId: number, hunt: HouseHuntRow | null) {
  if (!hunt) return null
  const filters = await loadFilterState(env, huntId)
  const scraperRows = await env.DB.prepare(
    'SELECT scraper_id FROM house_hunt_scrapers WHERE hunt_id = ? ORDER BY scraper_id'
  )
    .bind(huntId)
    .all<{ scraper_id: number }>()
  const scraper_ids = (scraperRows.results ?? []).map((r) => r.scraper_id)
  const notifRows = await env.DB.prepare(
    'SELECT id, type, destination, enabled FROM house_hunt_notifications WHERE hunt_id = ? ORDER BY id'
  )
    .bind(huntId)
    .all<NotificationRow>()
  const notifications = (notifRows.results ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    destination: n.destination,
    enabled: n.enabled === 1,
  }))
  return {
    id: hunt.id,
    name: hunt.name,
    created_at: hunt.created_at,
    filters: jsonFilters(filters),
    scraper_ids,
    notifications,
  }
}

async function loadDefaultListingSort(env: Env): Promise<SortKey | null> {
  const row = await env.DB
    .prepare("SELECT value FROM settings WHERE key = 'default_listing_sort'")
    .first<{ value: string }>()
  if (!row?.value) return null
  return row.value in SORT_KEYS ? (row.value as SortKey) : null
}

async function queryHuntResults(env: Env, huntId: number, sortQueryParam: string | null): Promise<Response> {
  const hunt = await env.DB.prepare('SELECT id FROM house_hunts WHERE id = ?').bind(huntId).first<{ id: number }>()
  if (!hunt) return Response.json({ error: 'Not found' }, { status: 404 })

  const f = await loadFilterState(env, huntId)
  const { clause, params } = buildHuntFilterWhereClause(f)

  let resolvedSort: SortKey
  if (sortQueryParam !== null) {
    if (!(sortQueryParam in SORT_KEYS)) {
      return Response.json({ error: 'Invalid sort key' }, { status: 400 })
    }
    resolvedSort = sortQueryParam as SortKey
  } else {
    resolvedSort = (await loadDefaultListingSort(env)) ?? DEFAULT_SORT
  }

  const orderBy = SORT_KEYS[resolvedSort]

  const sql = `SELECT l.id, l.title, l.link, l.price_cents, l.address, l.beds, l.baths, l.image_url, l.scraped_at, l.bookmarked, l.scraper_id
               FROM listings l
               INNER JOIN house_hunt_scrapers hhs
                 ON hhs.scraper_id = l.scraper_id AND hhs.hunt_id = ?
               WHERE ${clause}
               ORDER BY ${orderBy}`
  const rows = await env.DB.prepare(sql).bind(huntId, ...params).all<{
    id: number
    title: string
    link: string
    price_cents: number | null
    address: string | null
    beds: number | null
    baths: number | null
    image_url: string | null
    scraped_at: string
    bookmarked: number
    scraper_id: number
  }>()
  return Response.json(rows.results ?? [])
}

function parseOptionalInt(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isInteger(v)) return v
  if (typeof v === 'string' && v.trim() === '') return null
  if (typeof v === 'string') {
    const n = parseInt(v, 10)
    return Number.isNaN(n) ? null : n
  }
  return null
}

function parseOptionalFloat(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() === '') return null
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isNaN(n) ? null : n
  }
  return null
}

function parseOptionalString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

function mergeFiltersFromBody(base: FilterState, bodyFilters: Record<string, unknown>): FilterState {
  const out = { ...base }
  for (const col of FILTER_COLS) {
    if (!Object.prototype.hasOwnProperty.call(bodyFilters, col)) continue
    const val = bodyFilters[col]
    if (col === 'min_price' || col === 'max_price' || col === 'min_beds') {
      ;(out as Record<string, unknown>)[col] = parseOptionalInt(val)
    } else if (col === 'min_baths') {
      ;(out as Record<string, unknown>)[col] = parseOptionalFloat(val)
    } else {
      ;(out as Record<string, unknown>)[col] = parseOptionalString(val)
    }
  }
  return out
}

export async function handleHunts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const pathname = url.pathname.replace(/\/+$/, '') || '/'

  const resultsMatch = pathname.match(/^\/api\/house-hunts\/(\d+)\/results$/)
  if (resultsMatch) {
    const id = parseInt(resultsMatch[1], 10)
    if (Number.isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })
    if (request.method === 'GET') {
      const sortParam = url.searchParams.has('sort') ? url.searchParams.get('sort') : null
      return queryHuntResults(env, id, sortParam)
    }
    return new Response('Method not allowed', { status: 405 })
  }

  const idMatch = pathname.match(/^\/api\/house-hunts\/(\d+)$/)

  if (pathname === '/api/house-hunts') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT id, name, created_at FROM house_hunts ORDER BY created_at DESC').all<HouseHuntRow>()
      return Response.json(rows.results ?? [])
    }
    if (request.method === 'POST') {
      let body: { name?: unknown }
      try {
        body = (await request.json()) as { name?: unknown }
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
      }
      const name = typeof body?.name === 'string' ? body.name.trim() : ''
      if (!name) return Response.json({ error: 'name is required' }, { status: 400 })
      const r = await env.DB.prepare('INSERT INTO house_hunts (name) VALUES (?)').bind(name).run()
      const newId = r.meta.last_row_id
      const row = await env.DB.prepare('SELECT id, name, created_at FROM house_hunts WHERE id = ?').bind(newId).first<HouseHuntRow>()
      if (!row) return Response.json({ error: 'Failed to load created hunt' }, { status: 500 })
      return Response.json({ id: row.id, name: row.name, created_at: row.created_at }, { status: 201 })
    }
    return new Response('Method not allowed', { status: 405 })
  }

  if (idMatch) {
    const id = parseInt(idMatch[1], 10)
    if (Number.isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT id, name, created_at FROM house_hunts WHERE id = ?').bind(id).first<HouseHuntRow>()
      const detail = await buildHuntDetail(env, id, row)
      if (!detail) return Response.json({ error: 'Not found' }, { status: 404 })
      return Response.json(detail)
    }

    if (request.method === 'PUT') {
      let body: Record<string, unknown>
      try {
        body = (await request.json()) as Record<string, unknown>
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
      }

      const existing = await env.DB.prepare('SELECT id, name, created_at FROM house_hunts WHERE id = ?').bind(id).first<HouseHuntRow>()
      if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

      if (Object.prototype.hasOwnProperty.call(body, 'name')) {
        const nameRaw = body.name
        if (typeof nameRaw !== 'string' || nameRaw.trim() === '') {
          return Response.json({ error: 'name must be a non-empty string when provided' }, { status: 400 })
        }
        await env.DB.prepare("UPDATE house_hunts SET name = ?, updated_at = datetime('now') WHERE id = ?").bind(nameRaw.trim(), id).run()
      }

      if (Object.prototype.hasOwnProperty.call(body, 'filters')) {
        const filtersBody = body.filters
        if (filtersBody !== null && (typeof filtersBody !== 'object' || Array.isArray(filtersBody))) {
          return Response.json({ error: 'filters must be an object' }, { status: 400 })
        }
        const current = await loadFilterState(env, id)
        const merged =
          filtersBody === null ? current : mergeFiltersFromBody(current, filtersBody as Record<string, unknown>)
        await env.DB
          .prepare(
            `INSERT INTO house_hunt_filters (hunt_id, min_price, max_price, min_beds, min_baths, keywords, keywords_exclude, location_text)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(hunt_id) DO UPDATE SET
               min_price = excluded.min_price,
               max_price = excluded.max_price,
               min_beds = excluded.min_beds,
               min_baths = excluded.min_baths,
               keywords = excluded.keywords,
               keywords_exclude = excluded.keywords_exclude,
               location_text = excluded.location_text`
          )
          .bind(
            id,
            merged.min_price,
            merged.max_price,
            merged.min_beds,
            merged.min_baths,
            merged.keywords,
            merged.keywords_exclude,
            merged.location_text
          )
          .run()
      }

      if (Object.prototype.hasOwnProperty.call(body, 'scraper_ids')) {
        const sid = body.scraper_ids
        if (!Array.isArray(sid) || !sid.every((x) => typeof x === 'number' && Number.isInteger(x))) {
          return Response.json({ error: 'scraper_ids must be an array of integers' }, { status: 400 })
        }
        const ids = sid as number[]
        for (const scraperId of ids) {
          const ok = await env.DB.prepare('SELECT id FROM scraper_sources WHERE id = ?').bind(scraperId).first<{ id: number }>()
          if (!ok) return Response.json({ error: `scraper_id ${scraperId} not found` }, { status: 400 })
        }
        await env.DB.prepare('DELETE FROM house_hunt_scrapers WHERE hunt_id = ?').bind(id).run()
        for (const scraperId of ids) {
          await env.DB.prepare('INSERT INTO house_hunt_scrapers (hunt_id, scraper_id) VALUES (?, ?)').bind(id, scraperId).run()
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, 'notifications')) {
        const raw = body.notifications
        if (!Array.isArray(raw)) {
          return Response.json({ error: 'notifications must be an array' }, { status: 400 })
        }
        const allowed = new Set(['webhook', 'discord', 'email'])
        for (const item of raw) {
          if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            return Response.json({ error: 'each notification must be an object' }, { status: 400 })
          }
          const o = item as Record<string, unknown>
          const type = o.type
          const dest = o.destination
          if (typeof type !== 'string' || !allowed.has(type)) {
            return Response.json({ error: 'notification type must be webhook, discord, or email' }, { status: 400 })
          }
          if (typeof dest !== 'string' || dest.trim() === '') {
            return Response.json({ error: 'notification destination required' }, { status: 400 })
          }
        }
        await env.DB.prepare('DELETE FROM house_hunt_notifications WHERE hunt_id = ?').bind(id).run()
        for (const item of raw) {
          const o = item as Record<string, unknown>
          const enabled = o.enabled === false ? 0 : 1
          await env.DB
            .prepare(
              'INSERT INTO house_hunt_notifications (hunt_id, type, destination, enabled) VALUES (?, ?, ?, ?)'
            )
            .bind(id, o.type, String(o.destination).trim(), enabled)
            .run()
        }
      }

      const row = await env.DB.prepare('SELECT id, name, created_at FROM house_hunts WHERE id = ?').bind(id).first<HouseHuntRow>()
      const detail = await buildHuntDetail(env, id, row)
      if (!detail) return Response.json({ error: 'Not found' }, { status: 404 })
      return Response.json(detail)
    }

    if (request.method === 'DELETE') {
      const ex = await env.DB.prepare('SELECT id FROM house_hunts WHERE id = ?').bind(id).first<{ id: number }>()
      if (!ex) return Response.json({ error: 'Not found' }, { status: 404 })
      await env.DB.prepare('DELETE FROM house_hunts WHERE id = ?').bind(id).run()
      return new Response(null, { status: 204 })
    }

    return new Response('Method not allowed', { status: 405 })
  }

  return new Response('Not found', { status: 404 })
}
