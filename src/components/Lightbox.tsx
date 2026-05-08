import { useEffect, useState } from 'react'

interface Props {
  imageUrls: string[]
  initialIndex: number
  onClose: () => void
}

export function Lightbox({ imageUrls, initialIndex, onClose }: Props) {
  const [current, setCurrent] = useState(initialIndex)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const imageCount = imageUrls.length
  const src = imageUrls[current]

  return (
    <div
      data-testid="listing-lightbox-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85"
      onClick={onClose}
      role="presentation"
    >
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <img data-testid="listing-lightbox-img" src={src} alt="" className="max-h-[90vh] max-w-[90vw] object-contain" />
        {imageCount > 1 ? (
          <>
            <button
              type="button"
              data-testid="listing-lightbox-prev"
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
              className="absolute left-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl text-white disabled:opacity-30 sm:left-[-3rem]"
              aria-label="Previous image"
            >
              ‹
            </button>
            <button
              type="button"
              data-testid="listing-lightbox-next"
              onClick={() => setCurrent((c) => Math.min(imageCount - 1, c + 1))}
              disabled={current === imageCount - 1}
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl text-white disabled:opacity-30 sm:right-[-3rem]"
              aria-label="Next image"
            >
              ›
            </button>
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-sm text-white">
              {current + 1} / {imageCount}
            </span>
          </>
        ) : null}
        <button
          type="button"
          data-testid="listing-lightbox-close"
          onClick={onClose}
          className="absolute -right-1 -top-8 text-xl leading-none text-white sm:-top-10"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
