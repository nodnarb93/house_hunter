import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getDashboard,
  type DashboardActionQueueItem,
  type DashboardListing,
  type DashboardResponse,
} from '../api'
import ListingDetailModal, { type ListingDetailModalListing } from '../components/ListingDetailModal'

function formatPrice(cents: number | null): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    cents / 100,
  )
}

function formatScrapedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return iso
  }
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

function formatTourTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const now = Date.now()
    const diffMs = d.getTime() - now
    const within7Days = diffMs >= 0 && diffMs <= 7 * 86_400_000
    const timePart = d
      .toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      .toLowerCase()
    if (within7Days) {
      const weekday = d.toLocaleString('en-US', { weekday: 'long' })
      return `${weekday} at ${timePart}`
    }
    const datePart = d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
    return `${datePart} at ${timePart}`
  } catch {
    return iso
  }
}

function HouseThumbPlaceholder() {
  return (
    <svg
      className="h-8 w-8 text-zinc-600"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.5Z" />
    </svg>
  )
}

async function fetchListingForModal(id: number): Promise<ListingDetailModalListing | null> {
  const r = await fetch('/api/listings?limit=500')
  if (!r.ok) return null
  const data = (await r.json()) as { listings: ListingDetailModalListing[] }
  return data.listings.find((l) => l.id === id) ?? null
}

function actionRowLabel(item: DashboardActionQueueItem): string {
  if (item.stage === 'interested') {
    const days = Math.floor((Date.now() - new Date(item.stageChangedAt).getTime()) / 86_400_000)
    if (days < 1) return 'Reach out — saved today'
    return `Reach out — saved ${days}d ago`
  }
  return `Tour ${formatTourTime(item.tourScheduledAt)}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailListing, setDetailListing] = useState<ListingDetailModalListing | null>(null)
  const [brokenThumbIds, setBrokenThumbIds] = useState<Record<number, true>>({})
  const [brokenActionThumbIds, setBrokenActionThumbIds] = useState<Record<number, true>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await getDashboard())
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const onFocus = () => {
      void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  useEffect(() => {
    const prev = document.title
    document.title = 'Dashboard · House Hunter'
    return () => {
      document.title = prev
    }
  }, [])

  const openListingModal = async (id: number) => {
    const listing = await fetchListingForModal(id)
    if (listing) setDetailListing(listing)
  }

  if (loading) {
    return (
      <p className="text-zinc-400" data-testid="dashboard-loading">
        Loading…
      </p>
    )
  }

  if (error || !data) {
    return (
      <div data-testid="dashboard-error" className="rounded-lg border border-red-500/30 bg-red-950/20 p-4">
        <p className="text-sm text-red-300">{error || 'Failed to load dashboard'}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-700"
        >
          Retry
        </button>
      </div>
    )
  }

  const { hunts, actionQueue, health } = data
  const failingCount = health.failingScrapers.length

  return (
    <div data-testid="dashboard-page" className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold text-white">Dashboard</h1>

      <button
        type="button"
        data-testid="dashboard-health-strip"
        onClick={() => navigate('/runs')}
        className="w-full rounded-lg border border-white/10 bg-zinc-900/80 px-4 py-3 text-left text-sm text-zinc-300 hover:bg-zinc-800/80"
      >
        <p>
          Last scrape{' '}
          <span data-testid="dashboard-health-last-scrape" className="text-white">
            {health.lastSuccessfulScrapeAt == null
              ? 'No successful scrapes yet'
              : formatRelative(health.lastSuccessfulScrapeAt)}
          </span>
          {' · '}
          {health.newListingsLast24h} new in 24h
          {' · '}
          {failingCount === 0 ? 'All scrapers healthy' : `${failingCount} scrapers failing`}
        </p>
        {failingCount > 0 ? (
          <ul className="mt-2 list-inside list-disc text-xs text-zinc-500">
            {health.failingScrapers.map((s) => (
              <li key={s.id}>{s.name}</li>
            ))}
          </ul>
        ) : null}
      </button>

      <section data-testid="dashboard-action-queue">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Action queue</h2>
        {actionQueue.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing waiting</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {actionQueue.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  data-testid={`dashboard-action-row-${item.id}`}
                  onClick={() => navigate(`/triage?listing=${item.id}`)}
                  className="flex w-full gap-3 rounded-md border border-white/10 bg-zinc-900 p-2 text-left hover:bg-zinc-800"
                >
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-800">
                    {item.image_url && !brokenActionThumbIds[item.id] ? (
                      <img
                        src={item.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={() =>
                          setBrokenActionThumbIds((prev) => ({ ...prev, [item.id]: true }))
                        }
                      />
                    ) : (
                      <div
                        data-testid="triage-tile-thumb-placeholder"
                        className="flex h-full w-full items-center justify-center"
                      >
                        <HouseThumbPlaceholder />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {item.hunt_name ? (
                      <span
                        data-testid="hunt-name-badge"
                        className="mb-1 inline-block rounded-full bg-zinc-100/10 px-2 py-0.5 text-xs text-zinc-400"
                      >
                        {item.hunt_name}
                      </span>
                    ) : null}
                    <div className="text-sm font-medium text-white">{item.title}</div>
                    {item.address ? <div className="text-xs text-zinc-400">{item.address}</div> : null}
                    <div className="mt-1 text-xs text-zinc-500">{actionRowLabel(item)}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-8">
        {hunts.map((hunt) => (
          <section key={hunt.id}>
            <h2 className="mb-3 text-base font-semibold text-white">{hunt.name}</h2>
            {hunt.listings.length === 0 ? (
              <p
                data-testid={`dashboard-hunt-empty-${hunt.id}`}
                className="rounded-lg border border-dashed border-white/10 py-8 text-center text-sm text-zinc-500"
              >
                All caught up
              </p>
            ) : (
              <div
                data-testid={`dashboard-hunt-strip-${hunt.id}`}
                className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2"
              >
                {hunt.listings.map((listing) => (
                  <DashboardListingCard
                    key={listing.id}
                    listing={listing}
                    broken={!!brokenThumbIds[listing.id]}
                    onBroken={() => setBrokenThumbIds((prev) => ({ ...prev, [listing.id]: true }))}
                    onOpen={() => void openListingModal(listing.id)}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <ListingDetailModal
        open={detailListing !== null}
        listing={detailListing}
        onClose={() => setDetailListing(null)}
        onPatched={(updated) => setDetailListing(updated)}
      />
    </div>
  )
}

function DashboardListingCard(props: {
  listing: DashboardListing
  broken: boolean
  onBroken: () => void
  onOpen: () => void
}) {
  const { listing, broken, onBroken, onOpen } = props
  const bedsPart = listing.beds != null ? `${listing.beds} bd` : '— bd'
  const bathsPart = listing.baths != null ? `${listing.baths} ba` : '— ba'

  return (
    <button
      type="button"
      data-testid={`dashboard-listing-card-${listing.id}`}
      onClick={onOpen}
      className="snap-start shrink-0 w-64 overflow-hidden rounded-lg border border-white/10 bg-zinc-900 text-left hover:border-white/20"
    >
      <div className="flex h-32 items-center justify-center bg-zinc-950">
        {listing.image_url && !broken ? (
          <img
            src={listing.image_url}
            alt=""
            className="h-full w-full object-cover"
            onError={onBroken}
          />
        ) : (
          <HouseThumbPlaceholder />
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="text-sm font-medium text-white">{formatPrice(listing.price_cents)}</p>
        <p className="line-clamp-2 text-xs text-zinc-400">{listing.address ?? listing.title}</p>
        <p className="text-xs text-zinc-500">
          {bedsPart} · {bathsPart} · {formatScrapedDate(listing.scraped_at)}
        </p>
      </div>
    </button>
  )
}
