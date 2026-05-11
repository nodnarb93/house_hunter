import { useEffect, useRef, useState } from 'react'

export type RedfinParamsInfoButtonProps = {
  variant: 'create' | 'edit'
}

export function RedfinParamsInfoButton({ variant }: RedfinParamsInfoButtonProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const prevOpen = useRef(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  useEffect(() => {
    if (open) {
      closeBtnRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (prevOpen.current && !open) {
      triggerRef.current?.focus()
    }
    prevOpen.current = open
  }, [open])

  const marketDesc =
    variant === 'edit'
      ? 'Locked from the URL entered at scraper creation. To change, create a new scraper.'
      : 'Will be set from the location URL you resolve.'
  const regionDesc =
    variant === 'edit'
      ? 'Locked from the URL entered at scraper creation. To change, create a new scraper. Covers both region_id and region_type.'
      : 'Will be set from the location URL you resolve. Covers both region_id and region_type.'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="redfin-params-info-button"
        aria-label="About these parameters"
        title="About these parameters"
        className="inline-flex shrink-0 text-zinc-400 hover:text-zinc-200"
        onClick={() => setOpen(true)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[18px] w-[18px]"
          aria-hidden="true"
        >
          <path d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            data-testid="redfin-params-info-modal"
            className="relative mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-md border border-white/10 bg-zinc-900 p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
            aria-labelledby="redfin-params-info-title"
          >
            <button
              ref={closeBtnRef}
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 z-20 text-xl leading-none text-zinc-400 hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
            <h2 id="redfin-params-info-title" className="mb-4 pr-10 text-lg font-semibold text-zinc-100">
              About these parameters
            </h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-zinc-200">Market</dt>
                <dd className="mt-0.5 text-zinc-400">{marketDesc}</dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-200">Region</dt>
                <dd className="mt-0.5 text-zinc-400">{regionDesc}</dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-200">Status</dt>
                <dd className="mt-0.5 text-zinc-400">
                  Listing statuses returned by Redfin. Default: Active. Other option: Active + Coming Soon + Pending.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-200">Number of homes</dt>
                <dd className="mt-0.5 text-zinc-400">
                  Page size; how many listings Redfin returns per page. Default: 350.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-200">Min price / Max price</dt>
                <dd className="mt-0.5 text-zinc-400">
                  Price band sent to Redfin. Listings outside the band are also filtered server-side after fetch.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-200">Min beds / Max beds</dt>
                <dd className="mt-0.5 text-zinc-400">Bedroom band.</dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-200">Min baths</dt>
                <dd className="mt-0.5 text-zinc-400">
                  Bathroom floor. Note: Redfin&apos;s config exposes no max-baths counterpart (confirmed in BIZ-114).
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-200">Min sqft / Max sqft</dt>
                <dd className="mt-0.5 text-zinc-400">Square-footage band.</dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-200">Property types (uipt)</dt>
                <dd className="mt-0.5 text-zinc-400">
                  Comma-separated integers 1–6: 1 = House, 2 = Condo, 3 = Townhouse, 4 = Multi-family, 5 =
                  Manufactured, 6 = Other.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}
    </>
  )
}
