import type { Env } from '../types'
import { notifyHuntsForNewListings } from '../huntNotifications'
import { replaceListingImageUrls } from '../listingImageUrls'
import { replaceListingImages } from '../listingImages'
import { buildRedfinBigPhotoCdnUrl, extractRedfinPropertyIdFromUrl } from '../scrapers/redfinAdapter'

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
    let preset_id: number | null = null
    if (typeof body.preset_id === 'number' && Number.isInteger(body.preset_id)) {
      preset_id = body.preset_id
    }
    let hunt_id: number | null = null
    if (typeof body.hunt_id === 'number' && Number.isInteger(body.hunt_id)) {
      hunt_id = body.hunt_id
    }
    const r = await env.DB.prepare(
      `INSERT INTO listings (preset_id, hunt_id, run_id, title, link, price_cents, address, beds, baths, image_url, scraped_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(preset_id, hunt_id, title, link, price_cents, address, beds, baths, image_url, scraped_at)
      .run()
    const id = r.meta.last_row_id
    return Response.json({ id }, { status: 201 })
  }

  if (p === '/api/test/seed-listing-images' && request.method === 'POST') {
    let body: { listing_id?: unknown; images_base64?: unknown }
    try {
      body = (await request.json()) as { listing_id?: unknown; images_base64?: unknown }
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const listingId = typeof body.listing_id === 'number' && Number.isInteger(body.listing_id) ? body.listing_id : null
    if (listingId == null) return Response.json({ error: 'listing_id required' }, { status: 400 })
    const exists = await env.DB.prepare('SELECT id FROM listings WHERE id = ?').bind(listingId).first<{ id: number }>()
    if (!exists) return Response.json({ error: 'listing not found' }, { status: 404 })
    const raw = body.images_base64
    if (!Array.isArray(raw) || raw.length === 0) {
      return Response.json({ error: 'images_base64 must be a non-empty string array' }, { status: 400 })
    }
    const buffers: Buffer[] = []
    for (const item of raw) {
      if (typeof item !== 'string' || item.trim() === '') {
        return Response.json({ error: 'each images_base64 entry must be a non-empty string' }, { status: 400 })
      }
      buffers.push(Buffer.from(item, 'base64'))
    }
    await replaceListingImages(env.DB, listingId, buffers)
    return Response.json({ ok: true, count: buffers.length })
  }

  if (p === '/api/test/replace-listing-image-urls' && request.method === 'POST') {
    let body: { listing_id?: unknown; urls?: unknown }
    try {
      body = (await request.json()) as { listing_id?: unknown; urls?: unknown }
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const listingId = typeof body.listing_id === 'number' && Number.isInteger(body.listing_id) ? body.listing_id : null
    if (listingId == null) return Response.json({ error: 'listing_id required' }, { status: 400 })
    const exists = await env.DB.prepare('SELECT id FROM listings WHERE id = ?').bind(listingId).first<{ id: number }>()
    if (!exists) return Response.json({ error: 'listing not found' }, { status: 404 })
    const raw = body.urls
    if (!Array.isArray(raw) || !raw.every((x) => typeof x === 'string')) {
      return Response.json({ error: 'urls must be an array of strings' }, { status: 400 })
    }
    const urls = raw as string[]
    await replaceListingImageUrls(env.DB, listingId, urls)
    const row = await env.DB
      .prepare('SELECT COUNT(*) as c FROM listing_image_urls WHERE listing_id = ?')
      .bind(listingId)
      .first<{ c: number }>()
    return Response.json({ ok: true, rowCount: row?.c ?? 0 })
  }

  if (p === '/api/test/redfin-property-id' && request.method === 'POST') {
    let body: { url?: unknown }
    try {
      body = (await request.json()) as { url?: unknown }
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const url = typeof body.url === 'string' ? body.url : ''
    if (!url) return Response.json({ error: 'url required' }, { status: 400 })
    return Response.json({ propertyId: extractRedfinPropertyIdFromUrl(url) })
  }

  if (p === '/api/test/redfin-cdn-bigphoto-url' && request.method === 'POST') {
    let body: { property_id?: unknown; index?: unknown }
    try {
      body = (await request.json()) as { property_id?: unknown; index?: unknown }
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const propertyId = typeof body.property_id === 'string' ? body.property_id : ''
    const index = typeof body.index === 'number' && Number.isInteger(body.index) ? body.index : null
    if (!propertyId || index == null) return Response.json({ error: 'property_id string and integer index required' }, { status: 400 })
    const built = buildRedfinBigPhotoCdnUrl(propertyId, index)
    if (!built) return Response.json({ error: 'invalid property_id or index' }, { status: 400 })
    return Response.json({ url: built })
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

  if (p === '/api/test/listings' && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM listings').run()
    return new Response(null, { status: 204 })
  }

  return new Response('Not found', { status: 404 })
}
