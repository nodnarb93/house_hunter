import type { AppDatabase } from './db/d1-shim'
import type { FilterConfig, FeedEntry } from './types'
import { fetchAndParse } from './scrapers/rssAdapter'

function parseFilterConfig(configJson: string): FilterConfig {
  try {
    return JSON.parse(configJson) as FilterConfig
  } catch {
    return { feedUrls: [] }
  }
}

function matchesFilters(entry: FeedEntry, config: FilterConfig): boolean {
  const text = `${entry.title} ${entry.description}`.toLowerCase()
  const priceRe = /\$?\s*([\d,]+)/g
  let match
  const prices: number[] = []
  while ((match = priceRe.exec(text)) !== null) {
    const n = parseInt(match[1].replace(/,/g, ''), 10)
    if (!isNaN(n)) prices.push(n)
  }
  const maxPrice = config.maxPrice
  const minPrice = config.minPrice
  if (maxPrice != null && prices.length > 0) {
    const minFound = Math.min(...prices)
    if (minFound > maxPrice) return false
  }
  if (minPrice != null && prices.length > 0) {
    const maxFound = Math.max(...prices)
    if (maxFound < minPrice) return false
  }
  if (config.keywordsInclude?.length) {
    const hasInclude = config.keywordsInclude.some((k) => text.includes(k.toLowerCase()))
    if (!hasInclude) return false
  }
  if (config.keywordsExclude?.length) {
    const hasExclude = config.keywordsExclude.some((k) => text.includes(k.toLowerCase()))
    if (hasExclude) return false
  }
  if (config.locationKeywords?.length) {
    const hasLocation = config.locationKeywords.some((k) => text.includes(k.toLowerCase()))
    if (!hasLocation) return false
  }
  return true
}

export async function runPipeline(
  db: AppDatabase,
  presetId: number
): Promise<{ runId: number; passed: number; results: { title: string; link: string }[] }[]> {
  const preset = await db
    .prepare('SELECT id, name, config FROM filter_presets WHERE id = ?')
    .bind(presetId)
    .first<{ id: number; name: string; config: string }>()
  if (!preset) return []
  const config = parseFilterConfig(preset.config)
  if (!config.feedUrls?.length) return []
  const runResults: { runId: number; passed: number; results: { title: string; link: string }[] }[] = []
  for (const feedUrl of config.feedUrls) {
    const startedAt = new Date().toISOString()
    let totalFetched = 0
    let passed: FeedEntry[] = []
    try {
      const entries = await fetchAndParse(feedUrl)
      totalFetched = entries.length
      passed = entries.filter((e) => matchesFilters(e, config))
    } catch (err) {
      const finishedAt = new Date().toISOString()
      await db
        .prepare(
          'INSERT INTO runs (started_at, finished_at, feed_url, total_fetched, passed_filter_count, result_summary, preset_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(startedAt, finishedAt, feedUrl, 0, 0, JSON.stringify({ error: String(err) }), presetId)
        .run()
      continue
    }
    const finishedAt = new Date().toISOString()
    const resultSummary = JSON.stringify(passed.map((e) => ({ title: e.title, link: e.link })))
    const insert = await db
      .prepare(
        'INSERT INTO runs (started_at, finished_at, feed_url, total_fetched, passed_filter_count, result_summary, preset_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(startedAt, finishedAt, feedUrl, totalFetched, passed.length, resultSummary, presetId)
      .run()
    const runId = insert.meta.last_row_id as number
    runResults.push({
      runId,
      passed: passed.length,
      results: passed.map((e) => ({ title: e.title, link: e.link })),
    })
  }
  return runResults
}

export async function runAllPresets(db: AppDatabase): Promise<void> {
  const presets = await db.prepare('SELECT id FROM filter_presets').all<{ id: number }>()
  for (const row of presets.results ?? []) {
    const runResults = await runPipeline(db, row.id)
    for (const r of runResults) {
      if (r.passed > 0) await notifyWebhook(db, r.runId, r.results)
    }
  }
}

export async function notifyWebhook(
  db: AppDatabase,
  runId: number,
  results: { title: string; link: string }[]
): Promise<void> {
  const enabled = await db.prepare("SELECT value FROM settings WHERE key = 'webhook_enabled'").first<{ value: string }>()
  if (!enabled || enabled.value !== '1') return
  const url = await db.prepare("SELECT value FROM settings WHERE key = 'webhook_url'").first<{ value: string }>()
  if (!url?.value?.startsWith('http')) return
  await fetch(url.value, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `House Hunter: ${results.length} match(es)`,
      run_id: String(runId),
      results,
    }),
  })
}
