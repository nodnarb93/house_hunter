const API = '/api'

export interface FilterConfig {
  feedUrls: string[]
  minPrice?: number
  maxPrice?: number
  keywordsInclude?: string[]
  keywordsExclude?: string[]
  locationKeywords?: string[]
}

export interface FilterPreset {
  id: number
  name: string
  config: string
  created_at: string
}

export async function getFilters(): Promise<FilterPreset[]> {
  const r = await fetch(`${API}/filter-presets`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function saveFilter(preset: { id?: number; name: string; config: FilterConfig }): Promise<FilterPreset> {
  const body = preset.id ? { id: preset.id, name: preset.name, config: JSON.stringify(preset.config) } : { name: preset.name, config: JSON.stringify(preset.config) }
  const r = await fetch(`${API}/filter-presets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getSchedule(): Promise<{ interval_hours: number; active: number; updated_at: string | null }> {
  const r = await fetch(`${API}/schedule`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function putSchedule(interval_hours: number, active: number): Promise<{ interval_hours: number; active: number; updated_at: string }> {
  const r = await fetch(`${API}/schedule`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interval_hours, active }) })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getSettings(): Promise<{ webhook_url?: string; webhook_enabled?: string }> {
  const r = await fetch(`${API}/settings`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function putSettings(webhook_url?: string, webhook_enabled?: boolean): Promise<Record<string, string>> {
  const r = await fetch(`${API}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhook_url, webhook_enabled }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function runNow(presetId?: number): Promise<{ ok: boolean; runs?: unknown[] }> {
  const r = await fetch(`${API}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(presetId != null ? { preset_id: presetId } : {}),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export interface RunRow {
  id: number
  started_at: string
  finished_at: string
  feed_url: string
  total_fetched: number
  passed_filter_count: number
  result_summary: string | null
  preset_id: number | null
}

export async function getRuns(limit = 20): Promise<RunRow[]> {
  const r = await fetch(`${API}/runs?limit=${limit}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export interface ScraperSource {
  id: number
  kind: string
  url: string
  config_json: string | null
  created_at: string
}

export interface RedfinParams {
  region_id: number
  region_type: number
  market: string
  min_price?: number
  max_price?: number
  min_beds?: number
  max_beds?: number
  min_baths?: number
  max_baths?: number
  uipt?: string
  num_homes?: number
  page_number?: number
  status?: number
  v?: number
}

export async function getScrapers(): Promise<ScraperSource[]> {
  const r = await fetch(`${API}/scraper-sources`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function addScraper(url: string): Promise<ScraperSource> {
  const r = await fetch(`${API}/scraper-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function addScraperRedfin(params: RedfinParams): Promise<ScraperSource> {
  const r = await fetch(`${API}/scraper-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'redfin', ...params }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function removeScraper(id: number): Promise<void> {
  const r = await fetch(`${API}/scraper-sources/${id}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(await r.text())
}

export async function testScraper(url: string): Promise<{ ok: boolean; type?: string; count?: number; error?: string }> {
  const r = await fetch(`${API}/scraper-sources/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() }),
  })
  const data = await r.json()
  if (!r.ok) return { ok: false, error: (data as { error?: string })?.error ?? 'Request failed' }
  return data as { ok: boolean; type?: string; count?: number; error?: string }
}

export async function testScraperById(id: number): Promise<{ ok: boolean; type?: string; count?: number; error?: string }> {
  const r = await fetch(`${API}/scraper-sources/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const data = await r.json()
  if (!r.ok) return { ok: false, error: (data as { error?: string })?.error ?? 'Request failed' }
  return data as { ok: boolean; type?: string; count?: number; error?: string }
}

export async function resolveRedfinUrl(
  url: string
): Promise<{ region_id: number; region_type: number; market: string }> {
  const r = await fetch(`${API}/scraper-sources/resolve-redfin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() }),
  })
  if (!r.ok) {
    const data = await r.json().catch(() => ({}))
    throw new Error((data as { error?: string })?.error ?? 'Failed to resolve URL')
  }
  return r.json()
}
