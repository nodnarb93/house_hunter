import type { Env } from '../types'
import { notifyHuntsForNewListings } from '../huntNotifications'

export async function handleTestRoutes(request: Request, env: Env): Promise<Response> {
  if (process.env.PLAYWRIGHT_TEST !== '1') {
    return new Response('Not found', { status: 404 })
  }
  const url = new URL(request.url)
  const p = url.pathname.replace(/\/+$/, '') || '/'

  if (p === '/api/test/seed-listing' && request.method === 'POST') {
    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const title = typeof body.title === 'string' ? body.title : ''
    const link = typeof body.link === 'string' ? body.link : ''
    if (!title || !link) return Response.json({ error: 'title and link required' }, { status: 400 })
    const price_cents = typeof body.price_cents === 'number' ? body.price_cents : null
    const address = typeof body.address === 'string' ? body.address : null
    const beds = typeof body.beds === 'number' ? body.beds : null
    const baths = typeof body.baths === 'number' ? body.baths : null
    const image_url = typeof body.image_url === 'string' ? body.image_url : null
    const scraped_at = typeof body.scraped_at === 'string' ? body.scraped_at : new Date().toISOString()
    const r = await env.DB.prepare(
      `INSERT INTO listings (preset_id, run_id, title, link, price_cents, address, beds, baths, image_url, scraped_at)
       VALUES (NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(title, link, price_cents, address, beds, baths, image_url, scraped_at)
      .run()
    const id = r.meta.last_row_id
    return Response.json({ id }, { status: 201 })
  }

  if (p === '/api/test/evaluate-notifications' && request.method === 'POST') {
    let body: { listing_ids?: unknown }
    try {
      body = (await request.json()) as { listing_ids?: unknown }
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const ids = body.listing_ids
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'number' && Number.isInteger(x))) {
      return Response.json({ error: 'listing_ids must be integer array' }, { status: 400 })
    }
    await notifyHuntsForNewListings(env.DB, ids as number[])
    return Response.json({ ok: true })
  }

  if (p.startsWith('/api/test/listings/') && request.method === 'DELETE') {
    const id = parseInt(p.split('/').pop() ?? '', 10)
    if (!Number.isFinite(id)) return Response.json({ error: 'invalid id' }, { status: 400 })
    await env.DB.prepare('DELETE FROM listings WHERE id = ?').bind(id).run()
    return new Response(null, { status: 204 })
  }

  return new Response('Not found', { status: 404 })
}
