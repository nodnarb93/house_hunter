/**
 * Redfin URL detection and stingray GIS-CSV API. Detects Redfin city/zip search
 * URLs and builds the stingray request for testing and scheduled scrapes.
 * See redfin_api_guide.md for parameters.
 */

import { fetchImageBuffer, toWebp } from './imageUtils'

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

const REDFIN_CDN_ORIGIN = 'https://ssl.cdn-redfin.com'

const REDFIN_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
} as const

/**
 * Extract the numeric Redfin property id from a listing URL (`.../home/<id>`).
 * Uses the last `/home/<digits>` segment when multiple appear in the string.
 */
export function extractRedfinPropertyIdFromUrl(listingUrl: string): string | null {
  let last: string | null = null
  const re = /\/home\/(\d+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(listingUrl)) !== null) {
    last = m[1]
  }
  return last
}

/**
 * Build a candidate full-size photo URL on Redfin's CDN (bigphoto layout).
 * Pattern verified against public examples: `/photo/1/bigphoto/{id % 1000}/{id}_{index}.jpg`.
 */
export function buildRedfinBigPhotoCdnUrl(propertyId: string, photoIndex: number): string | null {
  const idNum = Number(propertyId)
  if (!Number.isFinite(idNum) || idNum <= 0 || !Number.isInteger(idNum)) return null
  if (!Number.isFinite(photoIndex) || photoIndex < 0 || !Number.isInteger(photoIndex)) return null
  const bucket = idNum % 1000
  return `${REDFIN_CDN_ORIGIN}/photo/1/bigphoto/${bucket}/${propertyId}_${photoIndex}.jpg`
}

async function redfinCdnResourceExists(url: string): Promise<boolean> {
  try {
    const base = {
      headers: { ...REDFIN_FETCH_HEADERS },
      signal: AbortSignal.timeout(10_000),
    } as const
    let res = await fetch(url, { method: 'HEAD', ...base })
    if (res.ok) return true
    if (res.status === 405 || res.status === 501 || res.status === 403) {
      res = await fetch(url, {
        method: 'GET',
        headers: { ...base.headers, Range: 'bytes=0-0' },
        signal: base.signal,
      })
      return res.ok || res.status === 206
    }
    return false
  } catch {
    return false
  }
}

async function fetchRedfinListingImagesFromCdn(listingUrl: string, maxImages: number): Promise<Buffer[]> {
  const propertyId = extractRedfinPropertyIdFromUrl(listingUrl)
  if (!propertyId) return []

  const confirmed: string[] = []
  for (let i = 0; i < maxImages; i++) {
    const candidate = buildRedfinBigPhotoCdnUrl(propertyId, i)
    if (!candidate) break
    if (await redfinCdnResourceExists(candidate)) confirmed.push(candidate)
    await new Promise((r) => setTimeout(r, 150))
  }

  const buffers: Buffer[] = []
  for (const url of confirmed) {
    const buf = await fetchImageBuffer(url)
    if (buf) buffers.push(await toWebp(buf))
    await new Promise((r) => setTimeout(r, 500))
  }
  return buffers
}

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

export interface RedfinParsedListing {
  title: string
  link: string
  address: string
  price_cents: number | null
  beds: number | null
  baths: number | null
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let i = 0
  let cur = ''
  let inQuotes = false
  while (i < line.length) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cur += c
      i++
    } else {
      if (c === '"') {
        inQuotes = true
        i++
      } else if (c === ',') {
        out.push(cur)
        cur = ''
        i++
      } else {
        cur += c
        i++
      }
    }
  }
  out.push(cur)
  return out
}

function findUrlColumnIndex(headers: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].trim().toUpperCase().startsWith('URL')) return i
  }
  return -1
}

function colIndex(headers: string[], name: string): number {
  const upper = name.toUpperCase()
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].trim().toUpperCase() === upper) return i
  }
  return -1
}

function parsePriceCents(raw: string): number | null {
  const s = raw.trim().replace(/[$,]/g, '')
  if (!s) return null
  const n = parseInt(s, 10)
  if (Number.isNaN(n)) return null
  return n * 100
}

/**
 * Parse stingray GIS-CSV body into structured listings (excludes the header row).
 */
export function parseRedfinCsvListings(csvText: string): RedfinParsedListing[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 2) return []

  const headerCells = parseCsvLine(lines[0]).map((h) => h.trim())
  const idxAddress = colIndex(headerCells, 'ADDRESS')
  const idxCity = colIndex(headerCells, 'CITY')
  const idxState = colIndex(headerCells, 'STATE OR PROVINCE')
  const idxZip = colIndex(headerCells, 'ZIP OR POSTAL CODE')
  const idxPrice = colIndex(headerCells, 'PRICE')
  const idxBeds = colIndex(headerCells, 'BEDS')
  const idxBaths = colIndex(headerCells, 'BATHS')
  const idxPropType = colIndex(headerCells, 'PROPERTY TYPE')
  const idxUrl = findUrlColumnIndex(headerCells)

  if (
    idxAddress < 0 ||
    idxCity < 0 ||
    idxState < 0 ||
    idxPrice < 0 ||
    idxBeds < 0 ||
    idxBaths < 0 ||
    idxPropType < 0 ||
    idxUrl < 0
  ) {
    return []
  }

  const out: RedfinParsedListing[] = []
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r])
    const get = (idx: number) => (idx < cells.length ? cells[idx].trim() : '')

    const link = get(idxUrl)
    if (!link) continue

    const addressStreet = get(idxAddress)
    const city = get(idxCity)
    const state = get(idxState)
    const zip = idxZip >= 0 ? get(idxZip) : ''
    const address =
      zip.length > 0 ? `${addressStreet}, ${city}, ${state} ${zip}` : `${addressStreet}, ${city}, ${state}`

    const bedsRaw = get(idxBeds)
    const bathsRaw = get(idxBaths)
    const priceRaw = get(idxPrice)
    const propType = get(idxPropType)

    const bedsParsed = parseInt(bedsRaw, 10)
    const beds = Number.isNaN(bedsParsed) ? null : bedsParsed
    const bathsParsed = parseFloat(bathsRaw)
    const baths = Number.isNaN(bathsParsed) ? null : bathsParsed

    const bathLabel = baths == null ? '?' : String(baths)
    const bedLabel = beds == null ? '?' : String(beds)
    const title = `${bedLabel}bd/${bathLabel}ba ${propType} at ${addressStreet}, ${city}, ${state}`

    out.push({
      title,
      link,
      address,
      price_cents: parsePriceCents(priceRaw),
      beds,
      baths,
    })
  }
  return out
}

export async function fetchRedfinGisCsvListings(params: RedfinParams): Promise<RedfinParsedListing[]> {
  const url = buildStingrayGisCsvUrl(params)
  const res = await fetch(url, { headers: { ...REDFIN_FETCH_HEADERS } })
  if (!res.ok) throw new Error(`Redfin GIS-CSV failed: ${res.status} ${url}`)
  const text = await res.text()
  return parseRedfinCsvListings(text)
}

export async function fetchRedfinGisCsvCount(params: RedfinParams): Promise<number> {
  const url = buildStingrayGisCsvUrl(params)
  const res = await fetch(url, {
    headers: { ...REDFIN_FETCH_HEADERS },
  })
  if (!res.ok) throw new Error(`Redfin GIS-CSV failed: ${res.status} ${url}`)
  const text = await res.text()
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length <= 1) return 0
  return lines.length - 1
}

/**
 * Fetch listing photos: try CDN bigphoto URLs derived from `/home/<propertyId>` first (no listing HTML),
 * then fall back to listing-page scraping (og:image + embedded JSON).
 */
export async function fetchRedfinListingImages(listingUrl: string, maxImages = 10): Promise<Buffer[]> {
  const fromCdn = await fetchRedfinListingImagesFromCdn(listingUrl, maxImages)
  if (fromCdn.length > 0) return fromCdn

  try {
    const res = await fetch(listingUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...REDFIN_FETCH_HEADERS,
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.warn(
        `[redfin] listing page fetch failed — ${listingUrl}: HTTP ${res.status} ${res.statusText || ''}`.trim(),
      )
      return []
    }
    const html = await res.text()

    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)

    const photoUrls = new Set<string>()
    if (ogMatch?.[1]) photoUrls.add(ogMatch[1])

    const photoMatches = html.matchAll(/"photoUrl"\s*:\s*"([^"]+)"/g)
    for (const m of photoMatches) {
      photoUrls.add(m[1])
      if (photoUrls.size >= maxImages) break
    }

    const urlMatches = html.matchAll(/"url"\s*:\s*"(https:\/\/ssl\.cdn-redfin\.com\/[^"]+)"/g)
    for (const m of urlMatches) {
      photoUrls.add(m[1])
      if (photoUrls.size >= maxImages) break
    }

    const buffers: Buffer[] = []
    for (const url of Array.from(photoUrls).slice(0, maxImages)) {
      const buf = await fetchImageBuffer(url)
      if (buf) buffers.push(await toWebp(buf))
      await new Promise((r) => setTimeout(r, 500))
    }
    return buffers
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(`[redfin] listing page fetch failed — ${listingUrl}: ${reason}`)
    return []
  }
}
