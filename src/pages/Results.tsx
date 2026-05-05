import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

interface ListingRow {
  id: number
  preset_id: number | null
  run_id: number | null
  title: string
  link: string
  price_cents: number | null
  address: string | null
  beds: number | null
  baths: number | null
  image_url: string | null
  scraped_at: string
  seen: number
  bookmarked: number
}

const btnCompact = 'rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50'

function formatPrice(cents: number | null): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return iso
  }
}

export default function Results() {
  const [searchParams] = useSearchParams()
  const presetParam = searchParams.get('preset')
  const presetId = presetParam != null && presetParam !== '' ? Number.parseInt(presetParam, 10) : undefined
  const presetQuery = presetId != null && Number.isFinite(presetId) ? `preset_id=${presetId}` : ''

  const [listings, setListings] = useState<ListingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = presetQuery ? `?${presetQuery}` : ''
      const r = await fetch(`/api/listings${q}`)
      if (!r.ok) throw new Error(await r.text())
      const data = (await r.json()) as { listings: ListingRow[] }
      setListings(data.listings ?? [])
    } catch {
      setListings([])
    } finally {
      setLoading(false)
    }
  }, [presetQuery])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const prev = document.title
    document.title = 'Hunt Results · House Hunter'
    return () => {
      document.title = prev
    }
  }, [])

  const selected = useMemo(() => listings.find((l) => l.id === selectedId) ?? null, [listings, selectedId])

  const patchListing = async (id: number, body: { seen?: 0 | 1; bookmarked?: 0 | 1 }) => {
    const r = await fetch(`/api/listings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) return
    const updated = (await r.json()) as ListingRow
    setListings((prev) => prev.map((l) => (l.id === id ? updated : l)))
  }

  const onSelectCard = async (listing: ListingRow) => {
    setSelectedId(listing.id)
    if (listing.seen === 0) await patchListing(listing.id, { seen: 1 })
  }

  const toggleBookmark = async () => {
    if (!selected) return
    const next: 0 | 1 = selected.bookmarked === 1 ? 0 : 1
    await patchListing(selected.id, { bookmarked: next })
  }

  const emptyCopy = 'No listings yet — run a scrape to populate results.'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-white">Hunt Results</h1>
        <p className="mt-1 text-sm text-zinc-400">Matches from your scrapes, filtered by preset.</p>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-400">Loading…</div>
      ) : (
        <div className="flex min-h-[480px] flex-1 gap-4 overflow-hidden rounded-md border border-white/10 bg-zinc-900/30">
          <div
            data-testid="results-list"
            className="flex w-[30%] flex-col overflow-y-auto border-r border-white/10 bg-zinc-950/40 p-2"
          >
            {listings.length === 0 ? (
              <p data-testid="results-empty" className="px-2 py-6 text-center text-sm text-zinc-400">
                {emptyCopy}
              </p>
            ) : (
              listings.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => void onSelectCard(l)}
                  className={`mb-2 w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    selectedId === l.id
                      ? 'border-blue-400/40 bg-zinc-800'
                      : 'border-white/10 bg-zinc-900 hover:bg-zinc-800/80'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {l.seen === 0 ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-400" aria-hidden />
                    ) : (
                      <span className="mt-1 h-2 w-2 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-white">{l.title}</div>
                      <div className="mt-0.5 text-xs text-zinc-400">
                        {formatPrice(l.price_cents)} · {formatRelative(l.scraped_at)}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div data-testid="results-detail" className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
            {listings.length === 0 ? (
              <p className="text-sm text-zinc-400">{emptyCopy}</p>
            ) : !selected ? (
              <p className="text-sm text-zinc-400">Select a listing to view details</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-white">{selected.title}</h2>
                    <a
                      href={selected.link}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block truncate text-sm text-blue-400 hover:text-blue-300"
                    >
                      {selected.link}
                    </a>
                  </div>
                  <button type="button" className={btnCompact} onClick={() => void toggleBookmark()}>
                    {selected.bookmarked === 1 ? 'Bookmarked' : 'Bookmark'}
                  </button>
                </div>

                {selected.image_url ? (
                  <img src={selected.image_url} alt="" className="max-h-64 w-full rounded-md border border-white/10 object-cover" />
                ) : null}

                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-zinc-500">Price</dt>
                    <dd className="text-zinc-200">{formatPrice(selected.price_cents)}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Scraped</dt>
                    <dd className="text-zinc-200">{formatRelative(selected.scraped_at)}</dd>
                  </div>
                  {selected.address ? (
                    <div className="sm:col-span-2">
                      <dt className="text-zinc-500">Address</dt>
                      <dd className="text-zinc-200">{selected.address}</dd>
                    </div>
                  ) : null}
                  {selected.beds != null || selected.baths != null ? (
                    <div>
                      <dt className="text-zinc-500">Beds / baths</dt>
                      <dd className="text-zinc-200">
                        {selected.beds != null ? `${selected.beds} bd` : '—'}
                        {selected.beds != null || selected.baths != null ? ' · ' : ''}
                        {selected.baths != null ? `${selected.baths} ba` : ''}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
