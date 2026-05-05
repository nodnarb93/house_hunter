import type { Env } from './types'
import { handleFilters } from './api/filters'
import { handleSchedule } from './api/schedule'
import { handleSettings } from './api/settings'
import { handleRun } from './api/run'
import { handleRuns } from './api/runs'
import { handleScrapers } from './api/scrapers'
import { handleListings } from './api/listings'
import { handleHunts } from './api/hunts'
import { handleTestRoutes } from './api/test'
import { runAllPresets } from './pipeline'

export async function dispatchApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const p = url.pathname

  if (p.startsWith('/api/test')) {
    const testRes = await handleTestRoutes(request, env)
    if (testRes.status !== 404) return testRes
  }

  if (p === '/api/run-all' || p === '/api/run-all/') {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    void Promise.resolve()
      .then(() => runAllPresets(env.DB))
      .catch(console.error)
    return Response.json({ ok: true })
  }

  if (p === '/api/filter-presets' || p === '/api/filter-presets/') return handleFilters(request, env)
  if (p.startsWith('/api/scraper-sources')) return handleScrapers(request, env)
  if (p.startsWith('/api/scrapers')) return handleScrapers(request, env)
  if (p === '/api/filters' || p === '/api/filters/') return handleFilters(request, env)
  if (p === '/api/schedule' || p === '/api/schedule/') return handleSchedule(request, env)
  if (p === '/api/settings' || p === '/api/settings/') return handleSettings(request, env)
  if (p === '/api/run' || p === '/api/run/') return handleRun(request, env)
  if (p === '/api/runs' || p === '/api/runs/') return handleRuns(request, env)
  if (p.startsWith('/api/listings')) return handleListings(request, env)
  if (p.startsWith('/api/house-hunts')) return handleHunts(request, env)

  return new Response('Not found', { status: 404 })
}
