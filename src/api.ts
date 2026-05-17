const API = '/api'

export interface HouseHunt {
  id: number
  name: string
  created_at: string
  total_listings: number
}

export interface HuntFilters {
  min_price: number | null
  max_price: number | null
  min_beds: number | null
  min_baths: number | null
  keywords: string | null
  keywords_exclude: string | null
  location_text: string | null
}

export interface HuntNotification {
  id: number
  type: 'webhook' | 'discord' | 'email'
  destination: string
  enabled: boolean
}

export interface HouseHuntDetail extends HouseHunt {
  filters: HuntFilters
  scraper_ids: number[]
  notifications: HuntNotification[]
}

export type HouseHuntPutBody = {
  name?: string
  filters?: Partial<HuntFilters> | null
  scraper_ids?: number[]
  notifications?: Array<{ type: HuntNotification['type']; destination: string; enabled?: boolean }>
}

export async function getHouseHunts(): Promise<HouseHunt[]> {
  const r = await fetch(`${API}/house-hunts`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function createHouseHunt(name: string): Promise<HouseHunt> {
  const r = await fetch(`${API}/house-hunts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getHouseHuntDetail(id: number): Promise<HouseHuntDetail> {
  const r = await fetch(`${API}/house-hunts/${id}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function putHouseHunt(id: number, body: HouseHuntPutBody): Promise<HouseHuntDetail> {
  const r = await fetch(`${API}/house-hunts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function updateHouseHunt(id: number, name: string): Promise<HouseHuntDetail> {
  return putHouseHunt(id, { name })
}

export interface HuntResultListing {
  id: number
  title: string
  link: string
  price_cents: number | null
  address: string | null
  beds: number | null
  baths: number | null
  image_url: string | null
  scraped_at: string
  bookmarked: number
  scraper_id: number
}

export const LISTING_SORT_KEYS = [
  'price_asc',
  'price_desc',
  'scraped_desc',
  'scraped_asc',
  'bookmarked_first',
] as const

export type ListingSortKey = (typeof LISTING_SORT_KEYS)[number]

export function isListingSortKey(v: unknown): v is ListingSortKey {
  return typeof v === 'string' && (LISTING_SORT_KEYS as readonly string[]).includes(v)
}

export async function getHouseHuntResults(id: number, sort?: ListingSortKey): Promise<HuntResultListing[]> {
  const q = sort != null ? `?sort=${encodeURIComponent(sort)}` : ''
  const r = await fetch(`${API}/house-hunts/${id}/results${q}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function deleteHouseHunt(id: number): Promise<void> {
  const r = await fetch(`${API}/house-hunts/${id}`, { method: 'DELETE' })
  if (r.status === 204) return
  if (!r.ok) throw new Error(await r.text())
}

export async function getSettings(): Promise<Record<string, string>> {
  const r = await fetch(`${API}/settings`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export type PutSettingsBody = {
  webhook_url?: string
  webhook_enabled?: boolean
  default_listing_sort?: ListingSortKey
}

export async function putSettings(body: PutSettingsBody): Promise<Record<string, string>> {
  const r = await fetch(`${API}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

export interface DashboardListing {
  id: number
  link: string
  title: string
  address: string | null
  price_cents: number | null
  beds: number | null
  baths: number | null
  image_url: string | null
  scraped_at: string
  seen: 0 | 1
}

export type DashboardActionQueueItem =
  | {
      id: number
      stage: 'interested'
      title: string
      address: string | null
      stageChangedAt: string
      image_url: string | null
      hunt_id: number | null
      hunt_name: string | null
    }
  | {
      id: number
      stage: 'tour_scheduled'
      title: string
      address: string | null
      tourScheduledAt: string
      image_url: string | null
      hunt_id: number | null
      hunt_name: string | null
    }

export interface DashboardResponse {
  hunts: Array<{
    id: number
    name: string
    listings: DashboardListing[]
  }>
  actionQueue: DashboardActionQueueItem[]
  health: {
    lastSuccessfulScrapeAt: string | null
    newListingsLast24h: number
    failingScrapers: Array<{ id: number; name: string; lastError: string }>
  }
}

export async function getDashboard(): Promise<DashboardResponse> {
  const r = await fetch(`${API}/dashboard`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export interface ScraperSource {
  id: number
  kind: string
  url: string
  config_json: string | null
  created_at: string
  last_tested_at: string | null
  last_test_ok: number | null
  schedule_slots: string[]
  last_run_at: string | null
}

function coerceScraperSource(s: ScraperSource): ScraperSource {
  return {
    ...s,
    schedule_slots: Array.isArray(s.schedule_slots) ? s.schedule_slots : [],
    last_run_at: s.last_run_at ?? null,
  }
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

/** Structured Redfin params returned by `GET /api/scraper-sources/:id` (redfin rows). */
export interface RedfinStructuredParams {
  region_id: number
  region_type: number
  market: string
  min_price: number | null
  max_price: number | null
  min_beds: number | null
  max_beds: number | null
  min_baths: number | null
  max_baths: number | null
  uipt: string | null
  num_homes: number
  page_number: number
  status: number
  v: number
}

export type ScraperSourceDetail = ScraperSource & { params?: RedfinStructuredParams | null }

export function redfinStructuredToParams(p: RedfinStructuredParams): RedfinParams {
  const out: RedfinParams = {
    region_id: p.region_id,
    region_type: p.region_type,
    market: p.market,
    num_homes: p.num_homes,
    page_number: p.page_number,
    status: p.status,
    v: p.v,
  }
  if (p.min_price != null) out.min_price = p.min_price
  if (p.max_price != null) out.max_price = p.max_price
  if (p.min_beds != null) out.min_beds = p.min_beds
  if (p.max_beds != null) out.max_beds = p.max_beds
  if (p.min_baths != null) out.min_baths = p.min_baths
  if (p.max_baths != null) out.max_baths = p.max_baths
  if (p.uipt != null && p.uipt !== '') out.uipt = p.uipt
  return out
}

async function readApiErrorMessage(r: Response): Promise<string> {
  const t = await r.text()
  try {
    const j = JSON.parse(t) as { error?: string }
    if (typeof j.error === 'string' && j.error.trim() !== '') return j.error
  } catch {
    /* ignore */
  }
  return t.trim() !== '' ? t : `HTTP ${r.status}`
}

export async function getScrapers(): Promise<ScraperSource[]> {
  const r = await fetch(`${API}/scraper-sources`)
  if (!r.ok) throw new Error(await r.text())
  const list = (await r.json()) as ScraperSource[]
  return list.map(coerceScraperSource)
}

export async function addScraper(url: string): Promise<ScraperSource> {
  const r = await fetch(`${API}/scraper-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() }),
  })
  if (!r.ok) throw new Error(await r.text())
  return coerceScraperSource((await r.json()) as ScraperSource)
}

export async function addScraperRedfin(params: RedfinParams): Promise<ScraperSource> {
  const r = await fetch(`${API}/scraper-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'redfin', ...params }),
  })
  if (!r.ok) throw new Error(await readApiErrorMessage(r))
  return coerceScraperSource((await r.json()) as ScraperSource)
}

export async function getScraperSource(id: number): Promise<ScraperSourceDetail> {
  const r = await fetch(`${API}/scraper-sources/${id}`)
  if (!r.ok) throw new Error(await readApiErrorMessage(r))
  return (await r.json()) as ScraperSourceDetail
}

export async function patchScraperSource(id: number, body: RedfinParams): Promise<ScraperSourceDetail> {
  const r = await fetch(`${API}/scraper-sources/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await readApiErrorMessage(r))
  return (await r.json()) as ScraperSourceDetail
}

export async function removeScraper(id: number): Promise<void> {
  const r = await fetch(`${API}/scraper-sources/${id}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(await r.text())
}

export async function updateScraperScheduleSlots(id: number, schedule_slots: string[]): Promise<ScraperSource> {
  const r = await fetch(`${API}/scraper-sources/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schedule_slots }),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || `HTTP ${r.status}`)
  }
  return coerceScraperSource((await r.json()) as ScraperSource)
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

export async function getListingImageUrls(listingId: number): Promise<string[]> {
  const r = await fetch(`${API}/listings/${listingId}/images`)
  if (!r.ok) throw new Error(await r.text())
  const data = (await r.json()) as { urls?: unknown }
  return Array.isArray(data.urls) ? (data.urls as string[]) : []
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
