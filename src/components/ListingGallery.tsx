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

  useEffect(() => {
    if (urls == null || urls.length < 1) return
    for (const u of urls) {
      const im = new Image()
      im.src = u
    }
  }, [listingId, urls])

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

  return (
    <div data-testid="listing-gallery" className="relative h-40 w-full overflow-hidden">
      <img
        data-testid="listing-gallery-main-img"
        src={urls[current]}
        alt=""
        className="h-40 w-full cursor-pointer object-cover"
        onClick={() => onOpenLightbox(current, urls)}
      />
      {count > 1 ? (
        <>
          <button
            type="button"
            data-testid="listing-gallery-prev"
            onClick={prev}
            disabled={current === 0}
            className="absolute left-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-30"
            aria-label="Previous image"
          >
            ‹
          </button>
          <button
            type="button"
            data-testid="listing-gallery-next"
            onClick={next}
            disabled={current === count - 1}
            className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-30"
            aria-label="Next image"
          >
            ›
          </button>
          <span className="absolute bottom-1 right-2 rounded bg-black/40 px-1 text-xs text-white">
            {current + 1}/{count}
          </span>
        </>
      ) : null}
    </div>
  )
}
