import type { Env } from '../types'

export async function handleFilters(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT id, name, config, created_at FROM filter_presets ORDER BY created_at DESC').all()
    return Response.json(rows.results ?? [])
  }
  if (request.method === 'POST') {
    const body = (await request.json()) as { id?: number; name: string; config: string }
    if (!body.name || body.config == null) return Response.json({ error: 'name and config required' }, { status: 400 })
    const configStr = typeof body.config === 'string' ? body.config : JSON.stringify(body.config)
    if (body.id) {
      await env.DB.prepare('UPDATE filter_presets SET name = ?, config = ? WHERE id = ?').bind(body.name, configStr, body.id).run()
      return Response.json({ id: body.id, name: body.name, config: configStr })
    }
    const r = await env.DB.prepare('INSERT INTO filter_presets (name, config) VALUES (?, ?)').bind(body.name, configStr).run()
    return Response.json({ id: r.meta.last_row_id, name: body.name, config: configStr })
  }
  return new Response('Method not allowed', { status: 405 })
}
