/**
 * Client copy of Redfin city/zip URL parsing (`server/scrapers/redfinAdapter.ts`).
 * Keep in sync when server `parseRedfinUrl` / `isRedfinUrl` change.
 */

import type { RedfinParams } from './api'

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
      const statusParam = u.searchParams.get('status')
      const uipt = u.searchParams.get('uipt')
      if (min_price != null) params.min_price = parseInt(min_price, 10)
      if (max_price != null) params.max_price = parseInt(max_price, 10)
      if (min_beds != null) params.min_beds = parseInt(min_beds, 10)
      if (max_beds != null) params.max_beds = parseInt(max_beds, 10)
      if (min_baths != null) params.min_baths = parseInt(min_baths, 10)
      if (max_baths != null) params.max_baths = parseInt(max_baths, 10)
      if (statusParam != null) {
        const st = parseInt(statusParam, 10)
        if (!Number.isNaN(st)) params.status = st
      }
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
      const min_beds = u.searchParams.get('min_beds') ?? u.searchParams.get('min-beds')
      const max_beds = u.searchParams.get('max_beds') ?? u.searchParams.get('max-beds')
      const min_baths = u.searchParams.get('min_baths') ?? u.searchParams.get('min-baths')
      const max_baths = u.searchParams.get('max_baths') ?? u.searchParams.get('max-baths')
      const statusParam = u.searchParams.get('status')
      const uipt = u.searchParams.get('uipt')
      if (min_price != null) params.min_price = parseInt(min_price, 10)
      if (max_price != null) params.max_price = parseInt(max_price, 10)
      if (min_beds != null) params.min_beds = parseInt(min_beds, 10)
      if (max_beds != null) params.max_beds = parseInt(max_beds, 10)
      if (min_baths != null) params.min_baths = parseInt(min_baths, 10)
      if (max_baths != null) params.max_baths = parseInt(max_baths, 10)
      if (statusParam != null) {
        const st = parseInt(statusParam, 10)
        if (!Number.isNaN(st)) params.status = st
      }
      if (uipt != null) params.uipt = uipt
      return params
    }

    return null
  } catch {
    return null
  }
}
