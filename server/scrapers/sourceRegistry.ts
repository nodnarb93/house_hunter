import type { ListingSource } from './listingSource'
import { RedfinSource } from './redfinSource'
import { RssSource } from './rssSource'

export function createDefaultSources(opts?: { redfinFetch?: typeof fetch }): ListingSource[] {
  return [new RedfinSource(opts?.redfinFetch), new RssSource()]
}

let active: ListingSource[] = createDefaultSources()

export function setSources(sources: ListingSource[]): void {
  active = sources
}

export function findSourceForUrl(url: string): ListingSource | null {
  return active.find((s) => s.matchesUrl(url)) ?? null
}

export function listSources(): ReadonlyArray<ListingSource> {
  return active
}
