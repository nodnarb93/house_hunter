import type { ListingSource, PhotoUrlHints, RawListing } from './listingSource'

function extractOgImageUrl(html: string): string | null {
  const ogMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  return ogMatch?.[1] ?? null
}

/**
 * Catch-all non-Redfin HTTP(S) listing pages (og:image). Redfin is matched first in the registry.
 * RSS feed ingestion remains in `scheduler` / `rssAdapter`; this class is the generic HTML listing surface.
 */
export class RssSource implements ListingSource {
  matchesUrl(url: string): boolean {
    try {
      const u = new URL(url.trim())
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
      const h = u.hostname.toLowerCase()
      if (h === 'www.redfin.com' || h === 'redfin.com') return false
      return true
    } catch {
      return false
    }
  }

  parseUrl(url: string): unknown {
    return { feedUrl: url.trim() }
  }

  async fetchListings(_params: unknown): Promise<RawListing[]> {
    return []
  }

  async extractPhotoUrls(listingUrl: string, _hints?: PhotoUrlHints): Promise<string[]> {
    try {
      const res = await fetch(listingUrl, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) return []
      const html = await res.text()
      const url = extractOgImageUrl(html)
      return url ? [url] : []
    } catch {
      return []
    }
  }
}
