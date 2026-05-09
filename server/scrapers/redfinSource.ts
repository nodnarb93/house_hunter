import type { ListingSource, PhotoUrlHints, RawListing } from './listingSource'
import {
  fetchRedfinGisCsvListings,
  parseRedfinUrl,
  type RedfinParams,
} from './redfinAdapter'
import { fetchRedfinCdnPhotoUrls } from './redfinCdnPhotoFetcher'

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

  async extractPhotoUrls(_listingUrl: string, hints?: PhotoUrlHints): Promise<string[]> {
    const mls = hints?.mlsNumber
    if (mls == null || mls === '') {
      return []
    }
    return fetchRedfinCdnPhotoUrls(mls, { fetchImpl: this.fetchImpl })
  }
}
