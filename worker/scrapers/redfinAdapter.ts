/**
 * Redfin URL detection and stingray GIS-CSV API. Detects Redfin city/zip search
 * URLs and builds the stingray request for testing and scheduled scrapes.
 * See redfin_api_guide.md for parameters.
 */

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

const REDFIN_ORIGIN = 'https://www.redfin.com'

/**
 * Returns true if the URL looks like a Redfin search/saved-feed page (city or zip).
 */
export function isRedfinUrl(inputUrl: string): boolean {
  try {
    const u = new URL(inputUrl.trim())
    const host = u.hostname.toLowerCase()
    if (host !== 'www.redfin.com' && host !== 'redfin.com') return false
    const path = u.pathname
    return /^\/city\/\d+\/[A-Za-z]{2}\/[^/]+/.test(path) || /^\/zip\/\d+/.test(path)
  } catch {
    return false
  }
}

/**
 * Parse a Redfin city or zip URL into stingray params. City: /city/4664/OH/Columbus
 * -> region_type=6, region_id=4664, market=columbus. Zip: /zip/43215 or
 * /zip/43215/OH/Columbus -> region_type=2, region_id from path.
 */
export function parseRedfinUrl(inputUrl: string): RedfinParams | null {
  try {
    const u = new URL(inputUrl.trim())
    const path = u.pathname
    const segments = path.split('/').filter(Boolean)

    if (segments[0] === 'city' && segments.length >= 4) {
      const region_id = parseInt(segments[1], 10)
      const cityName = segments[3]
      const market = cityName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      if (isNaN(region_id) || !market) return null
      const params: RedfinParams = {
        region_id,
        region_type: 6,
        market,
        num_homes: 350,
        page_number: 1,
        status: 9,
        v: 8,
      }
      const min_price = u.searchParams.get('min_price') ?? u.searchParams.get('min-price')
      const max_price = u.searchParams.get('max_price') ?? u.searchParams.get('max-price')
      const min_beds = u.searchParams.get('min_beds') ?? u.searchParams.get('min-beds')
      const max_beds = u.searchParams.get('max_beds') ?? u.searchParams.get('max-beds')
      const min_baths = u.searchParams.get('min_baths') ?? u.searchParams.get('min-baths')
      const max_baths = u.searchParams.get('max_baths') ?? u.searchParams.get('max-baths')
      const uipt = u.searchParams.get('uipt')
      if (min_price != null) params.min_price = parseInt(min_price, 10)
      if (max_price != null) params.max_price = parseInt(max_price, 10)
      if (min_beds != null) params.min_beds = parseInt(min_beds, 10)
      if (max_beds != null) params.max_beds = parseInt(max_beds, 10)
      if (min_baths != null) params.min_baths = parseInt(min_baths, 10)
      if (max_baths != null) params.max_baths = parseInt(max_baths, 10)
      if (uipt != null) params.uipt = uipt
      return params
    }

    if (segments[0] === 'zip' && segments.length >= 2) {
      const zipOrId = segments[1]
      const region_id = parseInt(zipOrId, 10)
      if (isNaN(region_id)) return null
      const market = segments.length >= 4 ? segments[3].toLowerCase().replace(/\s+/g, '-') : `zip-${zipOrId}`
      const params: RedfinParams = {
        region_id,
        region_type: 2,
        market,
        num_homes: 350,
        page_number: 1,
        status: 9,
        v: 8,
      }
      const min_price = u.searchParams.get('min_price') ?? u.searchParams.get('min-price')
      const max_price = u.searchParams.get('max_price') ?? u.searchParams.get('max-price')
      if (min_price != null) params.min_price = parseInt(min_price, 10)
      if (max_price != null) params.max_price = parseInt(max_price, 10)
      return params
    }

    return null
  } catch {
    return null
  }
}

/**
 * Build the stingray GIS-CSV request URL from parsed params.
 */
export function buildStingrayGisCsvUrl(params: RedfinParams): string {
  const search = new URLSearchParams()
  search.set('al', '1')
  search.set('market', params.market)
  search.set('num_homes', String(params.num_homes ?? 350))
  search.set('page_number', String(params.page_number ?? 1))
  search.set('region_id', String(params.region_id))
  search.set('region_type', String(params.region_type))
  search.set('status', String(params.status ?? 9))
  search.set('v', String(params.v ?? 8))
  if (params.min_price != null) search.set('min_price', String(params.min_price))
  if (params.max_price != null) search.set('max_price', String(params.max_price))
  if (params.min_beds != null) search.set('min_beds', String(params.min_beds))
  if (params.max_beds != null) search.set('max_beds', String(params.max_beds))
  if (params.min_baths != null) search.set('min_baths', String(params.min_baths))
  if (params.max_baths != null) search.set('max_baths', String(params.max_baths))
  if (params.uipt != null) search.set('uipt', params.uipt)
  return `${REDFIN_ORIGIN}/stingray/api/gis-csv?${search.toString()}`
}

/**
 * Fetch stingray GIS-CSV and return the number of listing rows (excluding header).
 * Used for test endpoint; pipeline can use same URL and parse CSV into FeedEntry[].
 */
export async function fetchRedfinGisCsvCount(params: RedfinParams): Promise<number> {
  const url = buildStingrayGisCsvUrl(params)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
  })
  if (!res.ok) throw new Error(`Redfin GIS-CSV failed: ${res.status} ${url}`)
  const text = await res.text()
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length <= 1) return 0
  return lines.length - 1
}
