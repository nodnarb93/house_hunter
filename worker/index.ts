import type { Env } from './types'
import { handleFilters } from './api/filters'
import { handleSchedule } from './api/schedule'
import { handleSettings } from './api/settings'
import { handleRun } from './api/run'
import { handleRuns } from './api/runs'
import { handleScrapers } from './api/scrapers'
import { runAllPresets } from './pipeline'

export interface WorkerEnv extends Env {
  ASSETS: Fetcher
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname.startsWith('/api/scrapers')) return handleScrapers(request, env)
      if (url.pathname === '/api/filters' || url.pathname === '/api/filters/') return handleFilters(request, env)
      if (url.pathname === '/api/schedule' || url.pathname === '/api/schedule/') return handleSchedule(request, env)
      if (url.pathname === '/api/settings' || url.pathname === '/api/settings/') return handleSettings(request, env)
      if (url.pathname === '/api/run' || url.pathname === '/api/run/') return handleRun(request, env)
      if (url.pathname === '/api/runs' || url.pathname === '/api/runs/') return handleRuns(request, env)
      return new Response('Not found', { status: 404 })
    }
    return env.ASSETS.fetch(request)
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runAllPresets(env.DB))
  },
}
