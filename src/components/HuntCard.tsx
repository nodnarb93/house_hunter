import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { HouseHunt } from '../api'

export interface HuntCardProps {
  hunt: HouseHunt
}

function formatFilterPriceK(cents: number): string {
  const k = cents / 100 / 1000
  return `$${Number.isInteger(k) ? k : k.toFixed(1)}k`
}

function formatLocationSummary(hunt: HouseHunt): string | null {
  const parts: string[] = []
  if (hunt.location_text) parts.push(hunt.location_text)
  if (hunt.min_beds != null) parts.push(`${hunt.min_beds}+ bd`)
  if (hunt.min_price != null && hunt.max_price != null) {
    parts.push(`${formatFilterPriceK(hunt.min_price)}–${formatFilterPriceK(hunt.max_price)}`)
  } else if (hunt.max_price != null) {
    parts.push(`Up to ${formatFilterPriceK(hunt.max_price)}`)
  } else if (hunt.min_price != null) {
    parts.push(`${formatFilterPriceK(hunt.min_price)}+`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = Math.max(0, now - then)
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return '>1w ago'
}

function ActivityThumb({
  huntId,
  index,
  src,
}: {
  huntId: number
  index: number
  src: string
}) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null
  return (
    <img
      src={src}
      alt=""
      className="h-14 w-14 shrink-0 rounded object-cover"
      data-testid={`hunt-card-activity-thumb-${huntId}-${index}`}
      onError={() => setHidden(true)}
    />
  )
}

function HousePlaceholderIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-10 w-10 text-zinc-600"
      aria-hidden
    >
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z" />
    </svg>
  )
}

export default function HuntCard({ hunt }: HuntCardProps) {
  const [imgError, setImgError] = useState(false)
  const locationSummary = formatLocationSummary(hunt)
  const lastScrapedLabel = hunt.last_scraped_at
    ? `Updated ${formatRelativeTime(hunt.last_scraped_at)}`
    : 'Not yet scraped'
  const status = hunt.is_paused ? 'paused' : 'active'

  return (
    <Link
      to={`/hunts/${hunt.id}`}
      data-testid={`hunt-card-${hunt.id}`}
      className="block overflow-hidden rounded-lg border border-white/10 bg-zinc-900 hover:bg-zinc-800/80"
    >
      {hunt.cover_image_url && !imgError ? (
        <img
          src={hunt.cover_image_url}
          alt=""
          className="aspect-video w-full object-cover"
          data-testid={`hunt-card-cover-${hunt.id}`}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className="flex aspect-video w-full items-center justify-center bg-zinc-800"
          data-testid={`hunt-card-cover-placeholder-${hunt.id}`}
        >
          <HousePlaceholderIcon />
        </div>
      )}
      {hunt.recent_listing_images.length > 0 ? (
        <div
          className="flex gap-1 px-4 pt-2"
          data-testid={`hunt-card-activity-strip-${hunt.id}`}
        >
          {hunt.recent_listing_images.map((url, index) => (
            <ActivityThumb key={`${hunt.id}-${index}`} huntId={hunt.id} index={index} src={url} />
          ))}
        </div>
      ) : null}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium text-white">{hunt.name}</h2>
          {hunt.unviewed_count > 0 ? (
            <span
              data-testid={`hunt-card-new-badge-${hunt.id}`}
              className="shrink-0 rounded px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-300"
            >
              {hunt.unviewed_count} new
            </span>
          ) : null}
        </div>
        {locationSummary ? (
          <p
            className="mt-1 text-sm text-zinc-400"
            data-testid={`hunt-card-location-${hunt.id}`}
          >
            {locationSummary}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-zinc-500">
          <span data-testid={`hunt-card-active-count-${hunt.id}`}>
            {hunt.active_listings_count ?? 0} active
          </span>
          {' · '}
          <span data-testid={`hunt-card-last-scraped-${hunt.id}`}>{lastScrapedLabel}</span>
          {' · '}
          <span
            data-testid={`hunt-card-status-${hunt.id}`}
            data-status={status}
            className={
              hunt.is_paused
                ? 'rounded px-1.5 py-0.5 text-zinc-400 bg-zinc-800'
                : 'rounded px-1.5 py-0.5 text-green-400 bg-zinc-800'
            }
          >
            {hunt.is_paused ? 'Paused' : 'Active'}
          </span>
        </p>
      </div>
    </Link>
  )
}
