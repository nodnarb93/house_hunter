import type { Env } from '../types'

export async function handleRuns(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
  const url = new URL(request.url)
  const limit = Math.min(50, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20)
  const rows = await env.DB.prepare(
    'SELECT id, started_at, finished_at, feed_url, total_fetched, passed_filter_count, result_summary, preset_id FROM runs ORDER BY started_at DESC LIMIT ?'
  )
    .bind(limit)
    .all()
  return Response.json(rows.results ?? [])
}
