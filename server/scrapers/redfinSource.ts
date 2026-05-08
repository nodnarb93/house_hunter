import type { ListingSource, RawListing } from './listingSource'
import {
  REDFIN_FETCH_HEADERS,
  extractPhotoUrls,
  fetchRedfinGisCsvListings,
  isWafChallengeBody,
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
    if (res.status === 202 && res.headers.get('x-amzn-waf-action') === 'challenge') {
      console.error('[redfin] WAF challenge response — image fetch blocked for ' + listingUrl)
      return []
    }
    if (!res.ok) return []
    const html = await res.text()
    if (isWafChallengeBody(html)) {
      console.error('[redfin] WAF challenge response — image fetch blocked for ' + listingUrl)
      return []
    }
    return extractPhotoUrls(html)
  }
}
