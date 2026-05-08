import type { ListingSource, RawListing } from './listingSource'
import {
  REDFIN_FETCH_HEADERS,
  extractPhotoUrls,
  fetchRedfinGisCsvListings,
  parseRedfinUrl,
  type RedfinParams,
} from './redfinAdapter'

export class RedfinSource implements ListingSource {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  matchesUrl(url: string): boolean {
    try {
      const h = new URL(url.trim()).hostname.toLowerCase()
      return h === 'www.redfin.com' || h === 'redfin.com'
    } catch {
      return false
    }
  }

  parseUrl(url: string): unknown {
    return parseRedfinUrl(url)
  }

  async fetchListings(params: unknown): Promise<RawListing[]> {
    return fetchRedfinGisCsvListings(params as RedfinParams)
  }

  async extractPhotoUrls(listingUrl: string): Promise<string[]> {
    const res = await this.fetchImpl(listingUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...REDFIN_FETCH_HEADERS,
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []
    const html = await res.text()
    return extractPhotoUrls(html)
  }
}
