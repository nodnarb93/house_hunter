import type { Env } from '../types'
import { isRedfinUrl, parseRedfinUrl, fetchRedfinGisCsvCount } from '../scrapers/redfinAdapter'
import {
  configJsonToStructured,
  parseStructuredParamsBody,
  paramsToConfigJson,
  validateRedfinParams,
} from '../scrapers/redfinParams'
import { fetchAndParse } from '../scrapers/rssAdapter'
import { runScraperSource, type ScraperScheduleRow } from '../scheduler'

export interface ScraperSourceRow {
  id: number
  kind: string
  url: string
  config_json: string | null
  created_at: string
  last_tested_at: string | null
  last_test_ok: number | null
  schedule_slots: string | null
  last_run_at: string | null
}

function parseScheduleSlots(raw: string | null): string[] {
  if (raw == null || raw === '') return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((v) => String(v))
  } catch {
    return []
  }
}

/** Same grouping semantics as the Scrapers UI `scheduleGroupKey` — used for slot collision checks. */
function scheduleGroupKeyFromRow(row: { id: number; kind: string; url: string; config_json: string | null }): string {
  if (row.kind === 'redfin' && row.config_json) {
    try {
      const c = JSON.parse(row.config_json) as { market?: string }
      if (c.market) return `redfin:${String(c.market).toLowerCase()}`
    } catch {
      /* ignore */
    }
  }
  if (row.kind === 'rss' && row.url?.trim()) {
    try {
      return `rss:${new URL(row.url.trim()).hostname.toLowerCase()}`
    } catch {
      /* ignore */
    }
  }
  return `other:${row.kind}:${row.id}`
}

function scraperJsonRow(row: ScraperSourceRow) {
  return {
    ...row,
    schedule_slots: parseScheduleSlots(row.schedule_slots),
    last_run_at: row.last_run_at,
  }
}

async function persistScraperTestResult(env: Env, sourceId: number, testOk: 0 | 1): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.prepare('UPDATE scraper_sources SET last_tested_at = ?, last_test_ok = ? WHERE id = ?').bind(now, testOk, sourceId).run()
}

export async function handleScrapers(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const pathname = url.pathname.replace(/\/$/, '').replace('/api/scraper-sources', '/api/scrapers')

  if (pathname === '/api/scrapers/resolve-redfin') {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const body = (await request.json()) as { url?: string }
    const inputUrl = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!inputUrl) return Response.json({ error: 'url required' }, { status: 400 })
    if (!isRedfinUrl(inputUrl)) return Response.json({ error: 'Not a valid Redfin city or zip URL' }, { status: 400 })
    const params = parseRedfinUrl(inputUrl)
    if (!params) return Response.json({ error: 'Could not parse Redfin URL' }, { status: 400 })
    return Response.json({
      region_id: params.region_id,
      region_type: params.region_type,
      market: params.market,
    })
  }

  if (pathname === '/api/scrapers/test') {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const body = (await request.json()) as { url?: string; id?: number }
    const sourceId = typeof body?.id === 'number' ? body.id : undefined
    const inputUrl = typeof body?.url === 'string' ? body.url.trim() : ''

    if (sourceId != null) {
      const row = await env.DB
        .prepare(
          'SELECT id, kind, url, config_json, last_tested_at, last_test_ok, schedule_slots, last_run_at FROM scraper_sources WHERE id = ?'
        )
        .bind(sourceId)
        .first<ScraperSourceRow>()
      if (!row) return Response.json({ ok: false, error: 'Source not found' }, { status: 404 })
      if (row.kind === 'redfin' && row.config_json) {
        try {
          const params = JSON.parse(row.config_json) as { region_id: number; region_type: number; market: string; [k: string]: unknown }
          const count = await fetchRedfinGisCsvCount(params)
          await persistScraperTestResult(env, sourceId, 1)
          return Response.json({ ok: true, type: 'redfin', count })
        } catch (e) {
          await persistScraperTestResult(env, sourceId, 0)
          const message = e instanceof Error ? e.message : 'Redfin request failed'
          return Response.json({ ok: false, type: 'redfin', error: message }, { status: 502 })
        }
      }
      if (row.kind === 'rss' && row.url) {
        try {
          const entries = await fetchAndParse(row.url)
          await persistScraperTestResult(env, sourceId, 1)
          return Response.json({ ok: true, type: 'rss', count: entries.length })
        } catch (e) {
          await persistScraperTestResult(env, sourceId, 0)
          const message = e instanceof Error ? e.message : 'RSS fetch failed'
          return Response.json({ ok: false, type: 'rss', error: message }, { status: 502 })
        }
      }
      return Response.json({ ok: false, error: 'Unknown source type' }, { status: 400 })
    }

    if (!inputUrl) return Response.json({ ok: false, error: 'url or id required' }, { status: 400 })

    if (isRedfinUrl(inputUrl)) {
      const params = parseRedfinUrl(inputUrl)
      if (!params) return Response.json({ ok: false, error: 'Could not parse Redfin URL' }, { status: 400 })
      try {
        const count = await fetchRedfinGisCsvCount(params)
        return Response.json({ ok: true, type: 'redfin', count })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Redfin request failed'
        return Response.json({ ok: false, type: 'redfin', error: message }, { status: 502 })
      }
    }

    try {
      const entries = await fetchAndParse(inputUrl)
      return Response.json({ ok: true, type: 'rss', count: entries.length })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'RSS fetch failed'
      return Response.json({ ok: false, type: 'rss', error: message }, { status: 502 })
    }
  }

  if (pathname === '/api/scrapers') {
    if (request.method === 'GET') {
      const rows = await env.DB
        .prepare(
          'SELECT id, kind, url, config_json, created_at, last_tested_at, last_test_ok, schedule_slots, last_run_at FROM scraper_sources ORDER BY created_at ASC'
        )
        .all<ScraperSourceRow>()
      const list = (rows.results ?? []).map(scraperJsonRow)
      return Response.json(list)
    }

    if (request.method === 'POST') {
      const body = (await request.json()) as {
        url?: string
        kind?: string
        region_id?: number
        region_type?: number
        market?: string
        min_price?: number
        max_price?: number
        min_beds?: number
        max_beds?: number
        min_baths?: number
        max_baths?: number
        uipt?: string
        num_homes?: number
        page_number?: number
        status?: number
        v?: number
      }

      let kind = 'rss'
      let config_json: string | null = null
      let url = typeof body?.url === 'string' ? body.url.trim() : ''

      if (body?.kind === 'redfin') {
        const parsed = parseStructuredParamsBody(body)
        if ('error' in parsed) {
          return Response.json({ error: parsed.error }, { status: 400 })
        }
        const verr = validateRedfinParams(parsed.params)
        if (verr) {
          return Response.json({ error: verr }, { status: 400 })
        }
        kind = 'redfin'
        config_json = paramsToConfigJson(parsed.params)
        url = url || `Redfin: ${parsed.params.market}`
      } else if (url) {
        if (isRedfinUrl(url)) {
          const params = parseRedfinUrl(url)
          if (params) {
            kind = 'redfin'
            config_json = JSON.stringify(params)
          }
        }
      } else {
        return Response.json({ error: 'url required for RSS, or kind redfin with params' }, { status: 400 })
      }

      const r = await env.DB.prepare('INSERT INTO scraper_sources (kind, url, config_json) VALUES (?, ?, ?)').bind(kind, url, config_json).run()
      const row = await env.DB
        .prepare(
          'SELECT id, kind, url, config_json, created_at, last_tested_at, last_test_ok, schedule_slots, last_run_at FROM scraper_sources WHERE id = ?'
        )
        .bind(r.meta.last_row_id)
        .first<ScraperSourceRow>()
      if (!row) {
        return Response.json({
          id: r.meta.last_row_id,
          kind,
          url,
          config_json,
          created_at: new Date().toISOString(),
          last_tested_at: null,
          last_test_ok: null,
          schedule_slots: [],
          last_run_at: null,
        })
      }
      return Response.json(scraperJsonRow(row), { status: 201 })
    }

    return new Response('Method not allowed', { status: 405 })
  }

  const runMatch = pathname.match(/^\/api\/scrapers\/(\d+)\/run$/)
  if (runMatch && request.method === 'POST') {
    const id = parseInt(runMatch[1], 10)
    if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

    const row = await env.DB
      .prepare(
        'SELECT id, kind, url, config_json, schedule_slots, last_run_at FROM scraper_sources WHERE id = ?'
      )
      .bind(id)
      .first<ScraperScheduleRow>()
    if (!row) return Response.json({ error: 'Source not found' }, { status: 404 })

    try {
      const result = await runScraperSource(env.DB, row)
      const nowIso = new Date().toISOString()
      await env.DB.prepare('UPDATE scraper_sources SET last_run_at = ? WHERE id = ?').bind(nowIso, id).run()
      return Response.json({ ok: true, fetched: result.fetched, inserted: result.inserted })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Run failed'
      return Response.json({ ok: false, error: message }, { status: 502 })
    }
  }

  const idMatch = pathname.match(/^\/api\/scrapers\/(\d+)$/)
  if (idMatch && request.method === 'GET') {
    const id = parseInt(idMatch[1], 10)
    if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

    const row = await env.DB
      .prepare(
        'SELECT id, kind, url, config_json, created_at, last_tested_at, last_test_ok, schedule_slots, last_run_at FROM scraper_sources WHERE id = ?'
      )
      .bind(id)
      .first<ScraperSourceRow>()
    if (!row) return Response.json({ error: 'Source not found' }, { status: 404 })

    if (row.kind === 'redfin') {
      return Response.json({
        ...scraperJsonRow(row),
        params: configJsonToStructured(row.config_json),
      })
    }
    return Response.json(scraperJsonRow(row))
  }

  if (idMatch && request.method === 'PATCH') {
    const id = parseInt(idMatch[1], 10)
    if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

    const row = await env.DB
      .prepare(
        'SELECT id, kind, url, config_json, created_at, last_tested_at, last_test_ok, schedule_slots, last_run_at FROM scraper_sources WHERE id = ?'
      )
      .bind(id)
      .first<ScraperSourceRow>()
    if (!row) return Response.json({ error: 'Source not found' }, { status: 404 })
    if (row.kind !== 'redfin') {
      return Response.json(
        { error: 'Structured Redfin parameters can only be updated on Redfin scraper sources' },
        { status: 400 },
      )
    }

    let existing: Record<string, unknown> = {}
    if (row.config_json) {
      try {
        const parsed = JSON.parse(row.config_json) as unknown
        if (typeof parsed === 'object' && parsed !== null) {
          existing = parsed as Record<string, unknown>
        }
      } catch {
        return Response.json({ error: 'Existing config_json is invalid JSON' }, { status: 400 })
      }
    }

    const patchRaw = (await request.json()) as Record<string, unknown>
    const merged: Record<string, unknown> = { ...existing }
    for (const [k, v] of Object.entries(patchRaw)) {
      if (k === 'url' || k === 'kind') continue
      merged[k] = v
    }

    const parsed = parseStructuredParamsBody(merged)
    if ('error' in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }
    const verr = validateRedfinParams(parsed.params)
    if (verr) {
      return Response.json({ error: verr }, { status: 400 })
    }

    const nextConfig = paramsToConfigJson(parsed.params)
    const urlFromPatch = typeof patchRaw.url === 'string' ? patchRaw.url.trim() : ''
    const nextUrl = urlFromPatch || `Redfin: ${parsed.params.market}`

    await env.DB
      .prepare('UPDATE scraper_sources SET url = ?, config_json = ? WHERE id = ?')
      .bind(nextUrl, nextConfig, id)
      .run()

    const updated = await env.DB
      .prepare(
        'SELECT id, kind, url, config_json, created_at, last_tested_at, last_test_ok, schedule_slots, last_run_at FROM scraper_sources WHERE id = ?'
      )
      .bind(id)
      .first<ScraperSourceRow>()
    if (!updated) return Response.json({ error: 'Source not found' }, { status: 404 })

    return Response.json({
      ...scraperJsonRow(updated),
      params: configJsonToStructured(updated.config_json),
    })
  }

  if (idMatch && request.method === 'PUT') {
    const id = parseInt(idMatch[1], 10)
    if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

    const body = (await request.json()) as { schedule_slots?: string[] }
    const newSlots: string[] = Array.isArray(body?.schedule_slots) ? body.schedule_slots.map(String) : []

    const selfRow = await env.DB
      .prepare('SELECT id, kind, url, config_json FROM scraper_sources WHERE id = ?')
      .bind(id)
      .first<{ id: number; kind: string; url: string; config_json: string | null }>()
    if (!selfRow) return Response.json({ error: 'Source not found' }, { status: 404 })
    const selfKey = scheduleGroupKeyFromRow(selfRow)

    const others = await env.DB
      .prepare('SELECT id, kind, url, config_json, schedule_slots FROM scraper_sources WHERE id != ?')
      .bind(id)
      .all<{ id: number; kind: string; url: string; config_json: string | null; schedule_slots: string | null }>()
    const takenSlots = new Map<string, number>()
    for (const other of others.results ?? []) {
      if (scheduleGroupKeyFromRow(other) !== selfKey) continue
      for (const s of parseScheduleSlots(other.schedule_slots)) {
        takenSlots.set(s, other.id)
      }
    }
    for (const slot of newSlots) {
      const owner = takenSlots.get(slot)
      if (owner !== undefined) {
        return Response.json({ error: `Slot ${slot} already claimed by scraper ${owner}` }, { status: 409 })
      }
    }

    await env.DB
      .prepare('UPDATE scraper_sources SET schedule_slots = ? WHERE id = ?')
      .bind(JSON.stringify(newSlots), id)
      .run()
    const row = await env.DB
      .prepare(
        'SELECT id, kind, url, config_json, created_at, last_tested_at, last_test_ok, schedule_slots, last_run_at FROM scraper_sources WHERE id = ?'
      )
      .bind(id)
      .first<ScraperSourceRow>()
    if (!row) return Response.json({ error: 'Source not found' }, { status: 404 })
    return Response.json(scraperJsonRow(row))
  }

  if (idMatch && request.method === 'DELETE') {
    const id = parseInt(idMatch[1], 10)
    if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })
    await env.DB.prepare('DELETE FROM scraper_sources WHERE id = ?').bind(id).run()
    return Response.json({ ok: true })
  }

  return new Response('Not found', { status: 404 })
}
