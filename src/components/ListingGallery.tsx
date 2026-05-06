import { useEffect, useState } from 'react'

interface Props {
  listingId: number
  onOpenLightbox: (index: number, count: number) => void
}

export function ListingGallery({ listingId, onOpenLightbox }: Props) {
  const [count, setCount] = useState<number | null>(null)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    setCount(null)
    setCurrent(0)
    void fetch(`/api/listings/${listingId}/images/count`)
      .then((r) => r.json())
      .then((d: { count: number }) => setCount(d.count))
      .catch(() => setCount(0))
  }, [listingId])

  useEffect(() => {
    if (count === null || count < 1) return
    for (let i = 0; i < count; i++) {
      const im = new Image()
      im.src = `/api/listings/${listingId}/images/${i}`
    }
  }, [listingId, count])

  if (count === null) {
    return (
      <div
        data-testid="listing-gallery-loading"
        className="flex h-40 w-full items-center justify-center bg-zinc-800 text-zinc-500"
      >
        Loading…
      </div>
    )
  }
  if (count === 0) {
    return (
      <div
        data-testid="listing-gallery-empty"
        className="flex h-40 w-full items-center justify-center bg-zinc-800 text-zinc-500"
      >
        No image
      </div>
    )
  }

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
        src={`/api/listings/${listingId}/images/${current}`}
        alt=""
        className="h-40 w-full cursor-pointer object-cover"
        onClick={() => onOpenLightbox(current, count)}
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
