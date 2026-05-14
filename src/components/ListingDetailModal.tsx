import { useEffect, useState } from 'react'
import { Modal } from './Modal'

const MODAL_STAGES = [
  { key: 'interested' as const, label: 'Interested' },
  { key: 'contacted' as const, label: 'Contacted' },
  { key: 'tour_scheduled' as const, label: 'Tour Scheduled' },
  { key: 'walkthrough' as const, label: 'Walkthrough' },
  { key: 'rejected' as const, label: 'Rejected' },
]

type ModalStageKey = (typeof MODAL_STAGES)[number]['key']

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

interface ListingDetailModalProps {
  listing: ListingDetailModalListing | null
  onClose: () => void
  onUpdate: (updated: ListingDetailModalListing) => void
}

async function patchListingField(
  id: number,
  field: string,
  value: string | null,
): Promise<ListingDetailModalListing | null> {
  const res = await fetch(`/api/listings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
  })
  if (!res.ok) return null
  return (await res.json()) as ListingDetailModalListing
}

function defaultExpandedStage(stage: string): ModalStageKey {
  const found = MODAL_STAGES.find((s) => s.key === stage)
  return found?.key ?? 'interested'
}

function toDatetimeLocalValue(raw: string | null): string {
  if (raw == null || raw === '') return ''
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return raw
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw.slice(0, 16)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function notesDbField(stage: ModalStageKey): 'interested_notes' | 'contacted_notes' | 'tour_notes' | 'walkthrough_notes' | 'rejection_reason' {
  if (stage === 'rejected') return 'rejection_reason'
  if (stage === 'tour_scheduled') return 'tour_notes'
  if (stage === 'interested') return 'interested_notes'
  if (stage === 'contacted') return 'contacted_notes'
  return 'walkthrough_notes'
}

function notesDefaultValue(listing: ListingDetailModalListing, stage: ModalStageKey): string {
  const col = notesDbField(stage)
  const v = listing[col]
  return v == null ? '' : String(v)
}

export function ListingDetailModal({ listing, onClose, onUpdate }: ListingDetailModalProps) {
  const [openSections, setOpenSections] = useState<Record<ModalStageKey, boolean>>(() => {
    const m = {} as Record<ModalStageKey, boolean>
    for (const s of MODAL_STAGES) m[s.key] = false
    return m
  })

  useEffect(() => {
    if (!listing) return
    const expanded = defaultExpandedStage(listing.stage)
    const next = {} as Record<ModalStageKey, boolean>
    for (const s of MODAL_STAGES) {
      next[s.key] = s.key === expanded
    }
    setOpenSections(next)
  }, [listing?.id])

  if (listing == null) return null

  const title = listing.displayName ?? listing.title

  const toggleSection = (key: ModalStageKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const saveNotesBlur = async (stage: ModalStageKey, value: string) => {
    const field = notesDbField(stage)
    const updated = await patchListingField(listing.id, field, value === '' ? null : value)
    if (updated) onUpdate(updated)
  }

  const saveTourAtBlur = async (value: string) => {
    const updated = await patchListingField(listing.id, 'tour_scheduled_at', value === '' ? null : value)
    if (updated) onUpdate(updated)
  }

  return (
    <Modal open={true} ariaLabel={`Listing ${title}`} onClose={onClose}>
      <h2 data-testid="listing-detail-title" className="mb-4 text-lg font-semibold text-white">
        {title}
      </h2>
      <div className="flex flex-col gap-2">
        {MODAL_STAGES.map((s) => {
          const isOpen = openSections[s.key]
          return (
            <div
              key={s.key}
              data-testid={`listing-detail-section-${s.key}`}
              className="rounded-md border border-white/10 bg-zinc-950/40"
            >
              <button
                type="button"
                data-testid={`listing-detail-section-toggle-${s.key}`}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-zinc-200 hover:bg-white/5"
                onClick={() => toggleSection(s.key)}
              >
                {s.label}
                <span className="text-xs text-zinc-500">{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen ? (
                <div className="border-t border-white/10 px-3 py-3">
                  {s.key === 'tour_scheduled' ? (
                    <div className="mb-3">
                      <label htmlFor={`listing-detail-tour-at-${listing.id}`} className="mb-1 block text-xs text-zinc-400">
                        Tour date & time
                      </label>
                      <input
                        id={`listing-detail-tour-at-${listing.id}`}
                        type="datetime-local"
                        data-testid="listing-detail-tour-scheduled-at"
                        className="w-full rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                        defaultValue={toDatetimeLocalValue(listing.tour_scheduled_at)}
                        onBlur={(e) => void saveTourAtBlur(e.currentTarget.value)}
                      />
                    </div>
                  ) : null}
                  {s.key === 'rejected' ? (
                    <label htmlFor={`listing-detail-notes-rejected-${listing.id}`} className="mb-1 block text-xs text-zinc-400">
                      Rejection reason
                    </label>
                  ) : null}
                  <textarea
                    id={s.key === 'rejected' ? `listing-detail-notes-rejected-${listing.id}` : undefined}
                    data-testid={s.key === 'rejected' ? 'listing-detail-notes-rejected' : `listing-detail-notes-${s.key}`}
                    className="mt-1 w-full rounded border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                    rows={4}
                    defaultValue={notesDefaultValue(listing, s.key)}
                    onBlur={(e) => void saveNotesBlur(s.key, e.currentTarget.value)}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
