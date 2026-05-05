import { test, expect } from '@playwright/test'

function scheduleGroupKey(s: {
  id: number
  kind: string
  url: string
  config_json: string | null
}): string {
  if (s.kind === 'redfin' && s.config_json) {
    try {
      const c = JSON.parse(s.config_json) as { market?: string }
      if (c.market) return `redfin:${String(c.market).toLowerCase()}`
    } catch {
      /* ignore */
    }
  }
  if (s.kind === 'rss' && s.url?.trim()) {
    try {
      return `rss:${new URL(s.url.trim()).hostname.toLowerCase()}`
    } catch {
      /* ignore */
    }
  }
  return `other:${s.kind}:${s.id}`
}

test('GET /api/scrapers exposes schedule_slots arrays without same-group slot collisions', async ({ request }) => {
  const r = await request.get('/api/scrapers')
  expect(r.status()).toBe(200)
  const scrapers = (await r.json()) as Array<{
    id: number
    kind: string
    url: string
    config_json: string | null
    schedule_slots: unknown
    last_run_at: string | null | undefined
  }>

  const slotOwnersByGroup = new Map<string, Map<string, number>>()

  for (const s of scrapers) {
    expect(Array.isArray(s.schedule_slots), `scraper ${s.id} schedule_slots should be an array`).toBe(true)
    expect(s.last_run_at === null || typeof s.last_run_at === 'string').toBe(true)

    const g = scheduleGroupKey(s)
    for (const slot of s.schedule_slots as string[]) {
      let groups = slotOwnersByGroup.get(slot)
      if (!groups) {
        groups = new Map()
        slotOwnersByGroup.set(slot, groups)
      }
      const prev = groups.get(g)
      expect(
        prev === undefined,
        `time slot ${slot} must not be shared by two scrapers in the same schedule group (owners ${prev} and ${s.id}, group ${g})`,
      ).toBe(true)
      groups.set(g, s.id)
    }
  }
})
