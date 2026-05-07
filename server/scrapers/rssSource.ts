import type { ListingSource, RawListing } from './listingSource'

/** RSS/Atom placeholder; registry + `extractPhotoUrls` behavior ship in BIZ-69 child 3. */
export class RssSource implements ListingSource {
  matchesUrl(_url: string): boolean {
    return false
  }

  parseUrl(url: string): unknown {
    return { feedUrl: url.trim() }
  }

  async fetchListings(_params: unknown): Promise<RawListing[]> {
    return []
  }

  async extractPhotoUrls(_listingUrl: string): Promise<string[]> {
    return []
  }
}
