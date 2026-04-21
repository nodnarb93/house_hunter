import type { Env } from '../types'

export async function handleSettings(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
    const out: Record<string, string> = {}
    for (const r of rows.results ?? []) out[r.key] = r.value
    return Response.json(out)
  }
  if (request.method === 'PUT') {
    const body = (await request.json()) as { webhook_url?: string; webhook_enabled?: boolean }
    if (body.webhook_url !== undefined) {
      await env.DB
        .prepare("INSERT INTO settings (key, value) VALUES ('webhook_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(body.webhook_url)
        .run()
    }
    if (body.webhook_enabled !== undefined) {
      await env.DB
        .prepare("INSERT INTO settings (key, value) VALUES ('webhook_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(body.webhook_enabled ? '1' : '0')
        .run()
    }
    const rows = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
    const out: Record<string, string> = {}
    for (const r of rows.results ?? []) out[r.key] = r.value
    return Response.json(out)
  }
  return new Response('Method not allowed', { status: 405 })
}
