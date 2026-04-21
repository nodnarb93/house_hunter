import type { Env } from '../types'
import { runPipeline, runAllPresets, notifyWebhook } from '../pipeline'

export async function handleRun(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const body = (await request.json().catch(() => ({}))) as { preset_id?: number } | undefined
  if (body?.preset_id != null) {
    const results = await runPipeline(env.DB, body.preset_id)
    for (const r of results) {
      if (r.passed > 0) await notifyWebhook(env.DB, r.runId, r.results)
    }
    return Response.json({ ok: true, runs: results })
  }
  await runAllPresets(env.DB)
  return Response.json({ ok: true })
}
