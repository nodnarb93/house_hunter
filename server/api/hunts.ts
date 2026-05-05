import type { Env } from '../types'

interface HouseHuntRow {
  id: number
  name: string
  created_at: string
}

function jsonHunt(row: HouseHuntRow) {
  return { id: row.id, name: row.name, created_at: row.created_at }
}

export async function handleHunts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const pathname = url.pathname.replace(/\/+$/, '') || '/'
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
      const id = r.meta.last_row_id
      const row = await env.DB.prepare('SELECT id, name, created_at FROM house_hunts WHERE id = ?').bind(id).first<HouseHuntRow>()
      if (!row) return Response.json({ error: 'Failed to load created hunt' }, { status: 500 })
      return Response.json(jsonHunt(row), { status: 201 })
    }
    return new Response('Method not allowed', { status: 405 })
  }

  if (idMatch) {
    const id = parseInt(idMatch[1], 10)
    if (Number.isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

    if (request.method === 'PUT') {
      let body: { name?: unknown }
      try {
        body = (await request.json()) as { name?: unknown }
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
      }
      const name = typeof body?.name === 'string' ? body.name.trim() : ''
      if (!name) return Response.json({ error: 'name is required' }, { status: 400 })
      const existing = await env.DB.prepare('SELECT id FROM house_hunts WHERE id = ?').bind(id).first<{ id: number }>()
      if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })
      await env.DB.prepare("UPDATE house_hunts SET name = ?, updated_at = datetime('now') WHERE id = ?").bind(name, id).run()
      const row = await env.DB.prepare('SELECT id, name, created_at FROM house_hunts WHERE id = ?').bind(id).first<HouseHuntRow>()
      if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
      return Response.json(jsonHunt(row))
    }

    if (request.method === 'DELETE') {
      const existing = await env.DB.prepare('SELECT id FROM house_hunts WHERE id = ?').bind(id).first<{ id: number }>()
      if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })
      await env.DB.prepare('DELETE FROM house_hunts WHERE id = ?').bind(id).run()
      return new Response(null, { status: 204 })
    }

    return new Response('Method not allowed', { status: 405 })
  }

  return new Response('Not found', { status: 404 })
}
