import type { Env } from '../types'

export async function handleSchedule(_request: Request, _env: Env): Promise<Response> {
  return Response.json(
    {
      error: 'Global schedule endpoint removed — use PUT /api/scrapers/:id to set per-scraper time slots.',
    },
    { status: 410 }
  )
}
