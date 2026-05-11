import type { RedfinParams } from './redfinAdapter'
import type { RedfinStructuredParams } from '../types'

export const REDFIN_STATUS_OPTIONS = [
  { value: 9, label: 'Active' },
  { value: 1, label: 'Active + Pending + Coming Soon' },
] as const

export const REDFIN_PROPERTY_TYPES = [
  { value: 1, label: 'House' },
  { value: 2, label: 'Condo' },
  { value: 3, label: 'Townhouse' },
  { value: 4, label: 'Multi-family' },
  { value: 5, label: 'Manufactured' },
  { value: 6, label: 'Other' },
] as const

const ALLOWED_STATUS = new Set(REDFIN_STATUS_OPTIONS.map((o) => o.value))

function numOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

function strOrUndef(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'string') {
    const t = v.trim()
    return t === '' ? undefined : t
  }
  return String(v)
}

/**
 * Parse POST/PATCH JSON into `RedfinParams`. Ignores unrelated keys (`kind`, `url`, …).
 */
export function parseStructuredParamsBody(body: unknown): { params: RedfinParams } | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Body must be an object' }
  }
  const b = body as Record<string, unknown>
  const region_id = Number(b.region_id)
  const region_type = Number(b.region_type)
  const marketRaw = typeof b.market === 'string' ? b.market.trim() : ''
  if (!marketRaw || Number.isNaN(region_id) || Number.isNaN(region_type)) {
    return { error: 'Redfin requires region_id, region_type, and market' }
  }
  const market = marketRaw.toLowerCase().replace(/\s+/g, '-')

  const params: RedfinParams = {
    region_id,
    region_type,
    market,
    num_homes: numOrUndef(b.num_homes) ?? 350,
    page_number: numOrUndef(b.page_number) ?? 1,
    status: numOrUndef(b.status) ?? 9,
    v: numOrUndef(b.v) ?? 8,
  }

  const min_price = numOrUndef(b.min_price)
  const max_price = numOrUndef(b.max_price)
  const min_beds = numOrUndef(b.min_beds)
  const max_beds = numOrUndef(b.max_beds)
  const min_baths = numOrUndef(b.min_baths)
  const max_baths = numOrUndef(b.max_baths)
  if (min_price !== undefined) params.min_price = min_price
  if (max_price !== undefined) params.max_price = max_price
  if (min_beds !== undefined) params.min_beds = min_beds
  if (max_beds !== undefined) params.max_beds = max_beds
  if (min_baths !== undefined) params.min_baths = min_baths
  if (max_baths !== undefined) params.max_baths = max_baths

  const uipt = strOrUndef(b.uipt)
  if (uipt !== undefined) params.uipt = uipt

  return { params }
}

export function paramsToConfigJson(params: RedfinParams): string {
  const stored: Record<string, unknown> = {
    region_id: params.region_id,
    region_type: params.region_type,
    market: params.market,
    num_homes: params.num_homes ?? 350,
    page_number: params.page_number ?? 1,
    status: params.status ?? 9,
    v: params.v ?? 8,
  }
  if (params.min_price != null) stored.min_price = params.min_price
  if (params.max_price != null) stored.max_price = params.max_price
  if (params.min_beds != null) stored.min_beds = params.min_beds
  if (params.max_beds != null) stored.max_beds = params.max_beds
  if (params.min_baths != null) stored.min_baths = params.min_baths
  if (params.max_baths != null) stored.max_baths = params.max_baths
  if (params.uipt != null && params.uipt !== '') stored.uipt = params.uipt
  return JSON.stringify(stored)
}

export function configJsonToStructured(raw: string | null): RedfinStructuredParams | null {
  if (raw == null || raw.trim() === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const o = parsed as Record<string, unknown>
  const region_id = Number(o.region_id)
  const region_type = Number(o.region_type)
  const market = typeof o.market === 'string' ? o.market : ''
  if (Number.isNaN(region_id) || Number.isNaN(region_type) || !market) return null

  const numHomes = o.num_homes != null ? Number(o.num_homes) : 350
  const pageNumber = o.page_number != null ? Number(o.page_number) : 1
  const status = o.status != null ? Number(o.status) : 9
  const v = o.v != null ? Number(o.v) : 8

  const min_price = o.min_price != null && o.min_price !== '' ? Number(o.min_price) : null
  const max_price = o.max_price != null && o.max_price !== '' ? Number(o.max_price) : null
  const min_beds = o.min_beds != null && o.min_beds !== '' ? Number(o.min_beds) : null
  const max_beds = o.max_beds != null && o.max_beds !== '' ? Number(o.max_beds) : null
  const min_baths = o.min_baths != null && o.min_baths !== '' ? Number(o.min_baths) : null
  const max_baths = o.max_baths != null && o.max_baths !== '' ? Number(o.max_baths) : null

  let uipt: string | null = null
  if (o.uipt != null && String(o.uipt).trim() !== '') {
    uipt = String(o.uipt).trim()
  }

  return {
    region_id,
    region_type,
    market,
    min_price: Number.isNaN(min_price as number) ? null : min_price,
    max_price: Number.isNaN(max_price as number) ? null : max_price,
    min_beds: Number.isNaN(min_beds as number) ? null : min_beds,
    max_beds: Number.isNaN(max_beds as number) ? null : max_beds,
    min_baths: Number.isNaN(min_baths as number) ? null : min_baths,
    max_baths: Number.isNaN(max_baths as number) ? null : max_baths,
    uipt,
    num_homes: Number.isNaN(numHomes) ? 350 : numHomes,
    page_number: Number.isNaN(pageNumber) ? 1 : pageNumber,
    status: Number.isNaN(status) ? 9 : status,
    v: Number.isNaN(v) ? 8 : v,
  }
}

function validateUipt(uipt: string | undefined): string | null {
  if (uipt == null || uipt.trim() === '') return null
  const parts = uipt.split(',').map((p) => p.trim())
  for (const p of parts) {
    if (p === '') return 'uipt must be a comma-separated list of integers from 1 to 6'
    if (!/^\d+$/.test(p)) return 'uipt must be a comma-separated list of integers from 1 to 6'
    const n = parseInt(p, 10)
    if (n < 1 || n > 6) return 'uipt must be a comma-separated list of integers from 1 to 6'
  }
  return null
}

/** First validation error message, or `null` when valid. */
export function validateRedfinParams(params: RedfinParams): string | null {
  const nh = params.num_homes ?? 350
  if (nh < 1 || nh > 350) return 'num_homes must be between 1 and 350'

  const pn = params.page_number ?? 1
  if (pn < 1 || pn > 10) return 'page_number must be between 1 and 10'

  const st = params.status ?? 9
  if (!ALLOWED_STATUS.has(st)) return 'status must be a supported Redfin status value'

  const uiptErr = validateUipt(params.uipt)
  if (uiptErr) return uiptErr

  if (
    params.min_price != null &&
    params.max_price != null &&
    params.min_price > params.max_price
  ) {
    return 'min_price is greater than max_price'
  }
  if (params.min_beds != null && params.max_beds != null && params.min_beds > params.max_beds) {
    return 'min_beds is greater than max_beds'
  }
  if (params.min_baths != null && params.max_baths != null && params.min_baths > params.max_baths) {
    return 'min_baths is greater than max_baths'
  }

  return null
}
