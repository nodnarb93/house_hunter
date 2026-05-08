import { useEffect, useState } from 'react'

import { getListingImageUrls } from '../api'

interface Props {
  listingId: number
  onOpenLightbox: (index: number, imageUrls: string[]) => void
}

export function ListingGallery({ listingId, onOpenLightbox }: Props) {
  const [urls, setUrls] = useState<string[] | null>(null)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    setUrls(null)
    setCurrent(0)
    void getListingImageUrls(listingId)
      .then(setUrls)
      .catch(() => setUrls([]))
  }, [listingId])

  if (urls === null) {
    return (
      <div
        data-testid="listing-gallery-loading"
        className="flex h-40 w-full items-center justify-center bg-zinc-800 text-zinc-500"
      >
        Loading…
      </div>
    )
  }
  if (urls.length === 0) {
    return (
      <div
        data-testid="listing-gallery-empty"
        className="flex h-40 w-full items-center justify-center bg-zinc-800 text-zinc-500"
      >
        No image
      </div>
    )
  }

  const count = urls.length

  const prev = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrent((c) => Math.max(0, c - 1))
  }
  const next = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrent((c) => Math.min(count - 1, c + 1))
  }

  const visibleIndices = Array.from(
    new Set([Math.max(0, current - 1), current, Math.min(count - 1, current + 1)])
  )

  return (
    <div data-testid="listing-gallery" className="relative h-40 w-full overflow-hidden">
      {visibleIndices.map((idx) => {
        const active = idx === current
        return (
          <img
            key={idx}
            {...(active ? { 'data-testid': 'listing-gallery-main-img' } : {})}
            src={urls[idx]}
            alt=""
            loading="lazy"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
              active ? 'z-10 cursor-pointer opacity-100' : 'z-0 pointer-events-none opacity-0'
            }`}
            onClick={active ? () => onOpenLightbox(current, urls) : undefined}
          />
        )
      })}
      {count > 1 ? (
        <>
          <button
            type="button"
            data-testid="listing-gallery-prev"
            onClick={prev}
            disabled={current === 0}
            className="absolute left-1 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-30"
            aria-label="Previous image"
          >
            ‹
          </button>
          <button
            type="button"
            data-testid="listing-gallery-next"
            onClick={next}
            disabled={current === count - 1}
            className="absolute right-1 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-30"
            aria-label="Next image"
          >
            ›
          </button>
          <span className="absolute bottom-1 right-2 z-20 rounded bg-black/40 px-1 text-xs text-white">
            {current + 1}/{count}
          </span>
        </>
      ) : null}
    </div>
  )
}
