import type { Env } from '../types'

export async function handleActivitySummary(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const unviewedRow = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM listings WHERE seen = 0',
  ).first<{ c: number }>()

  const huntsRow = await env.DB.prepare(
    `SELECT COUNT(DISTINCT hunt_id) AS c
     FROM listings
     WHERE seen = 0 AND hunt_id IS NOT NULL`,
  ).first<{ c: number }>()

  return Response.json({
    unviewedMatchesCount: Math.max(0, Number(unviewedRow?.c ?? 0)),
    huntsWithNewListingsCount: Math.max(0, Number(huntsRow?.c ?? 0)),
  })
}
