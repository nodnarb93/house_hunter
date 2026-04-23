import type { Env } from '../types'
import { isRedfinUrl, parseRedfinUrl, fetchRedfinGisCsvCount } from '../scrapers/redfinAdapter'
import { fetchAndParse } from '../scrapers/rssAdapter'

export interface ScraperSourceRow {
  id: number
  kind: string
  url: string
  config_json: string | null
  created_at: string
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
      const row = await env.DB.prepare('SELECT id, kind, url, config_json FROM scraper_sources WHERE id = ?').bind(sourceId).first<ScraperSourceRow>()
      if (!row) return Response.json({ ok: false, error: 'Source not found' }, { status: 404 })
      if (row.kind === 'redfin' && row.config_json) {
        try {
          const params = JSON.parse(row.config_json) as { region_id: number; region_type: number; market: string; [k: string]: unknown }
          const count = await fetchRedfinGisCsvCount(params)
          return Response.json({ ok: true, type: 'redfin', count })
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Redfin request failed'
          return Response.json({ ok: false, type: 'redfin', error: message }, { status: 502 })
        }
      }
      if (row.kind === 'rss' && row.url) {
        try {
          const entries = await fetchAndParse(row.url)
          return Response.json({ ok: true, type: 'rss', count: entries.length })
        } catch (e) {
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
      const rows = await env.DB.prepare('SELECT id, kind, url, config_json, created_at FROM scraper_sources ORDER BY created_at ASC').all<ScraperSourceRow>()
      return Response.json(rows.results ?? [])
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
        const region_id = Number(body.region_id)
        const region_type = Number(body.region_type)
        const market = typeof body.market === 'string' ? body.market.trim() : ''
        if (!market || isNaN(region_id) || isNaN(region_type)) {
          return Response.json({ error: 'Redfin requires region_id, region_type, and market' }, { status: 400 })
        }
        kind = 'redfin'
        const params = {
          region_id,
          region_type,
          market: market.toLowerCase().replace(/\s+/g, '-'),
          num_homes: body.num_homes != null ? Number(body.num_homes) : 350,
          page_number: body.page_number != null ? Number(body.page_number) : 1,
          status: body.status != null ? Number(body.status) : 9,
          v: body.v != null ? Number(body.v) : 8,
        } as Record<string, unknown>
        if (body.min_price != null) params.min_price = Number(body.min_price)
        if (body.max_price != null) params.max_price = Number(body.max_price)
        if (body.min_beds != null) params.min_beds = Number(body.min_beds)
        if (body.max_beds != null) params.max_beds = Number(body.max_beds)
        if (body.min_baths != null) params.min_baths = Number(body.min_baths)
        if (body.max_baths != null) params.max_baths = Number(body.max_baths)
        if (body.uipt != null && body.uipt !== '') params.uipt = String(body.uipt)
        config_json = JSON.stringify(params)
        url = url || `Redfin: ${params.market}`
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
        .prepare('SELECT id, kind, url, config_json, created_at FROM scraper_sources WHERE id = ?')
        .bind(r.meta.last_row_id)
        .first<ScraperSourceRow>()
      return Response.json(row ?? { id: r.meta.last_row_id, kind, url, config_json, created_at: new Date().toISOString() })
    }

    return new Response('Method not allowed', { status: 405 })
  }

  const idMatch = pathname.match(/^\/api\/scrapers\/(\d+)$/)
  if (idMatch && request.method === 'DELETE') {
    const id = parseInt(idMatch[1], 10)
    if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })
    await env.DB.prepare('DELETE FROM scraper_sources WHERE id = ?').bind(id).run()
    return Response.json({ ok: true })
  }

  return new Response('Not found', { status: 404 })
}
