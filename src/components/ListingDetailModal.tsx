import { useEffect, useState, type FocusEvent } from 'react'
import Modal from './Modal'

const STAGE_SECTIONS = [
  { key: 'interested', label: 'Interested', fields: ['interested_notes'] as const },
  { key: 'contacted', label: 'Contacted', fields: ['contacted_notes'] as const },
  { key: 'tour_scheduled', label: 'Tour Scheduled', fields: ['tour_scheduled_at', 'tour_notes'] as const },
  { key: 'walkthrough', label: 'Walkthrough', fields: ['walkthrough_notes'] as const },
  { key: 'rejected', label: 'Rejected', fields: ['rejection_reason'] as const },
] as const

export interface ListingDetailModalListing {
  id: number
  title: string
  nickname: string | null
  displayName?: string
  stage: string
  interested_notes: string | null
  contacted_notes: string | null
  tour_scheduled_at: string | null
  tour_notes: string | null
  walkthrough_notes: string | null
  rejection_reason: string | null
}

export interface ListingDetailModalProps {
  open: boolean
  listing: ListingDetailModalListing | null
  onClose: () => void
  onPatched: (updated: ListingDetailModalListing) => void
}

export default function ListingDetailModal({ open, listing, onClose, onPatched }: ListingDetailModalProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open || !listing) return
    const next: Record<string, boolean> = {}
    for (const s of STAGE_SECTIONS) next[s.key] = s.key === listing.stage
    setExpanded(next)
  }, [open, listing?.id, listing?.stage])

  if (!listing) return null

  const toggle = (k: string) => setExpanded((prev) => ({ ...prev, [k]: !prev[k] }))

  const patchField = async (field: string, raw: string) => {
    const body: Record<string, string | null> = { [field]: raw === '' ? null : raw }
    const r = await fetch(`/api/listings/${listing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) return
    const updated = (await r.json()) as ListingDetailModalListing
    onPatched(updated)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabelledBy="listing-modal-title"
      testId="triage-listing-modal"
    >
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <h2
          id="listing-modal-title"
          className="text-lg font-semibold text-white"
          data-testid="triage-listing-modal-title"
        >
          {listing.displayName ?? listing.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          data-testid="triage-listing-modal-close"
          className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col divide-y divide-white/10">
        {STAGE_SECTIONS.map((s) => {
          const isOpen = !!expanded[s.key]
          return (
            <section key={s.key} data-testid={`triage-detail-section-${s.key}`}>
              <button
                type="button"
                aria-expanded={isOpen}
                data-testid={`triage-detail-section-header-${s.key}`}
                onClick={() => toggle(s.key)}
                className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-medium text-white hover:bg-white/5"
              >
                <span>
                  {s.label}
                  {s.key === listing.stage ? ' (current)' : ''}
                </span>
                <span aria-hidden className="text-zinc-500">
                  {isOpen ? '−' : '+'}
                </span>
              </button>
              {isOpen ? (
                <div
                  data-testid={`triage-detail-section-body-${s.key}`}
                  className="flex flex-col gap-3 px-5 pb-4"
                >
                  {s.fields.map((field) => renderField(field, listing, patchField))}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
    </Modal>
  )
}

function renderField(
  field: string,
  listing: ListingDetailModalListing,
  patch: (field: string, raw: string) => Promise<void>,
) {
  const onBlur = (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    void patch(field, e.currentTarget.value)
  }

  if (field === 'tour_scheduled_at') {
    return (
      <label key={field} className="flex flex-col gap-1 text-xs text-zinc-400">
        Tour date/time
        <input
          type="datetime-local"
          data-testid={`triage-detail-field-${field}`}
          defaultValue={listing.tour_scheduled_at ?? ''}
          onBlur={onBlur}
          className="rounded border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
        />
      </label>
    )
  }

  const labelMap: Record<string, string> = {
    interested_notes: "Why I'm interested",
    contacted_notes: 'Contact notes',
    tour_notes: 'Tour notes',
    walkthrough_notes: 'Walkthrough notes',
    rejection_reason: 'Why rejected',
  }
  const value = (listing as unknown as Record<string, string | null>)[field] ?? ''

  return (
    <label key={field} className="flex flex-col gap-1 text-xs text-zinc-400">
      {labelMap[field] ?? field}
      <textarea
        data-testid={`triage-detail-field-${field}`}
        defaultValue={value}
        onBlur={onBlur}
        rows={4}
        className="rounded border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
      />
    </label>
  )
}
