import type { Env } from '../types'

export async function handleSchedule(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT id, interval_hours, active, updated_at FROM schedule WHERE id = 1').first()
    if (!row) return Response.json({ interval_hours: 6, active: 1, updated_at: null })
    return Response.json(row)
  }
  if (request.method === 'PUT') {
    const body = (await request.json()) as { interval_hours?: number; active?: number }
    const interval = body.interval_hours ?? 6
    const active = body.active ?? 1
    const updated = new Date().toISOString()
    await env.DB.prepare('UPDATE schedule SET interval_hours = ?, active = ?, updated_at = ? WHERE id = 1').bind(interval, active, updated).run()
    return Response.json({ interval_hours: interval, active, updated_at: updated })
  }
  return new Response('Method not allowed', { status: 405 })
}
