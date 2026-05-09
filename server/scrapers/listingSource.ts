/**
 * Common listing-source contract for Redfin, RSS, and future scrapers (BIZ-69).
 * `RawListing` is the overlap of `RedfinParsedListing` and RSS `FeedEntry` shapes.
 */
export interface PhotoUrlHints {
  mlsNumber?: string | null
}

export interface RawListing {
  title: string
  link: string
  description?: string
  address?: string
  price_cents?: number | null
  beds?: number | null
  baths?: number | null
  mls_number?: string | null
  raw?: string
}

export interface ListingSource {
  matchesUrl(url: string): boolean
  parseUrl(url: string): unknown
  fetchListings(params: unknown): Promise<RawListing[]>
  extractPhotoUrls(listingUrl: string, hints?: PhotoUrlHints): Promise<string[]>
}
