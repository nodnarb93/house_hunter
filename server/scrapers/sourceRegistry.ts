import type { ListingSource } from './listingSource'
import { RedfinSource } from './redfinSource'
import { RssSource } from './rssSource'

const sources: ListingSource[] = [new RedfinSource(), new RssSource()]

export function findSourceForUrl(url: string): ListingSource | null {
  return sources.find((s) => s.matchesUrl(url)) ?? null
}

export function listSources(): ReadonlyArray<ListingSource> {
  return sources
}
