import type { Env } from '../types'
import { SORT_KEYS, type SortKey } from './hunts'

export async function handleSettings(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
    const out: Record<string, string> = {}
    for (const r of rows.results ?? []) out[r.key] = r.value
    return Response.json(out)
  }
  if (request.method === 'PUT') {
    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (body.webhook_url !== undefined) {
      await env.DB
        .prepare("INSERT INTO settings (key, value) VALUES ('webhook_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(body.webhook_url as string)
        .run()
    }
    if (body.webhook_enabled !== undefined) {
      await env.DB
        .prepare("INSERT INTO settings (key, value) VALUES ('webhook_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(body.webhook_enabled ? '1' : '0')
        .run()
    }
    if (Object.prototype.hasOwnProperty.call(body, 'default_listing_sort')) {
      const v = body.default_listing_sort
      if (typeof v !== 'string' || !(v in SORT_KEYS)) {
        return Response.json({ error: 'Invalid default_listing_sort' }, { status: 400 })
      }
      await env.DB
        .prepare(
          "INSERT INTO settings (key, value) VALUES ('default_listing_sort', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        )
        .bind(v as SortKey)
        .run()
    }
    const rows = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
    const out: Record<string, string> = {}
    for (const r of rows.results ?? []) out[r.key] = r.value
    return Response.json(out)
  }
  return new Response('Method not allowed', { status: 405 })
}
