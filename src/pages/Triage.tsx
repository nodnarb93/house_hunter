import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import type { HouseHunt } from '../api'
import { getHouseHunts } from '../api'

const STAGES = [
  { key: 'interested' as const, label: 'Interested' },
  { key: 'contacted' as const, label: 'Contacted' },
  { key: 'tour_scheduled' as const, label: 'Tour Scheduled' },
  { key: 'walkthrough' as const, label: 'Walkthrough' },
  { key: 'rejected' as const, label: 'Rejected' },
]

interface ListingRow {
  id: number
  preset_id: number | null
  hunt_id: number | null
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
  stage: string
  nickname: string | null
  displayName?: string
}

function formatPrice(cents: number | null): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
}

function formatScrapedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return iso
  }
}

function PencilIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-zinc-500 hover:text-zinc-300"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
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

export default function Triage() {
  const [listings, setListings] = useState<ListingRow[]>([])
  const [hunts, setHunts] = useState<HouseHunt[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStage, setActiveStage] = useState<(typeof STAGES)[number]['key']>('interested')
  const [editingNicknameId, setEditingNicknameId] = useState<number | null>(null)
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [brokenThumbIds, setBrokenThumbIds] = useState<Record<number, true>>({})
  const skipBlurSaveRef = useRef(false)

  const huntMap = useMemo(() => new Map(hunts.map((h) => [h.id, h.name])), [hunts])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, huntList] = await Promise.all([fetch('/api/listings?bookmarked=1'), getHouseHunts()])
      if (!r.ok) throw new Error(await r.text())
      const data = (await r.json()) as { listings: ListingRow[] }
      setListings(data.listings ?? [])
      setHunts(huntList)
    } catch {
      setListings([])
      setHunts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const prev = document.title
    document.title = 'Triage · House Hunter'
    return () => {
      document.title = prev
    }
  }, [])

  const byStage = useMemo(() => {
    const m = new Map<string, ListingRow[]>()
    for (const s of STAGES) m.set(s.key, [])
    for (const l of listings) {
      const k = STAGES.some((s) => s.key === l.stage) ? l.stage : 'interested'
      const arr = m.get(k) ?? []
      arr.push(l)
      m.set(k, arr)
    }
    return m
  }, [listings])

  const moveToStage = async (listingId: number, stage: string) => {
    const r = await fetch(`/api/listings/${listingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
    if (!r.ok) return
    const updated = (await r.json()) as ListingRow
    setListings((prev) => prev.map((l) => (l.id === listingId ? updated : l)))
  }

  const saveNickname = async (listingId: number, raw: string) => {
    const r = await fetch(`/api/listings/${listingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: raw }),
    })
    setEditingNicknameId(null)
    setNicknameDraft('')
    if (!r.ok) return
    const updated = (await r.json()) as ListingRow
    setListings((prev) => prev.map((l) => (l.id === listingId ? updated : l)))
  }

  const onDragStart = (e: DragEvent, listingId: number) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(listingId))
  }

  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const onDropColumn = (e: DragEvent, stageKey: string) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('text/plain')
    const id = Number.parseInt(raw, 10)
    if (!Number.isFinite(id)) return
    void moveToStage(id, stageKey)
  }

  const empty = !loading && listings.length === 0

  const renderSecondaryLine = (l: ListingRow) => {
    const allNull = l.beds == null && l.baths == null && (l.address == null || l.address === '')
    if (allNull) {
      return (
        <div data-testid={`triage-tile-secondary-${l.id}`} className="mt-0.5 text-xs text-zinc-400">
          &nbsp;
        </div>
      )
    }
    const bedsPart = l.beds != null ? `${l.beds} bd` : '— bd'
    const bathsPart = l.baths != null ? `${l.baths} ba` : '— ba'
    const addrPart = l.address != null && l.address !== '' ? l.address : '—'
    return (
      <div data-testid={`triage-tile-secondary-${l.id}`} className="mt-0.5 line-clamp-2 text-xs text-zinc-400">
        {bedsPart} · {bathsPart} · {addrPart}
      </div>
    )
  }

  const renderTriageTile = (l: ListingRow) => {
    const showImg = l.image_url != null && !brokenThumbIds[l.id]
    const label = l.displayName ?? l.title

    const onNicknameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        skipBlurSaveRef.current = true
        setEditingNicknameId(null)
        setNicknameDraft('')
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        void saveNickname(l.id, nicknameDraft)
      }
    }

    const onNicknameBlur = () => {
      if (skipBlurSaveRef.current) {
        skipBlurSaveRef.current = false
        return
      }
      void saveNickname(l.id, nicknameDraft)
    }

    return (
      <div className="flex flex-row gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-zinc-800">
          {showImg ? (
            <img
              src={l.image_url!}
              alt=""
              data-testid="triage-tile-thumb-img"
              className="h-full w-full object-cover"
              onError={() => setBrokenThumbIds((prev) => ({ ...prev, [l.id]: true }))}
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
        <div className="flex min-w-0 flex-1 flex-col">
          {l.hunt_id != null ? (
            <span
              data-testid="hunt-name-badge"
              className="mb-1 self-start rounded-full bg-zinc-100/10 px-2 py-0.5 text-xs text-zinc-400"
            >
              {huntMap.get(l.hunt_id) ?? 'Unknown Hunt'}
            </span>
          ) : null}
          {editingNicknameId === l.id ? (
            <input
              data-testid={`triage-tile-nickname-input-${l.id}`}
              autoFocus
              className="mt-0.5 w-full rounded border border-white/15 bg-zinc-950 px-1.5 py-0.5 text-sm font-medium text-white"
              value={nicknameDraft}
              onChange={(e) => setNicknameDraft(e.target.value)}
              onKeyDown={onNicknameKeyDown}
              onBlur={onNicknameBlur}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex items-center gap-1">
              <span
                data-testid={`triage-tile-displayname-${l.id}`}
                className="line-clamp-1 text-sm font-medium text-white"
              >
                {label}
              </span>
              <button
                type="button"
                data-testid={`triage-tile-nickname-edit-${l.id}`}
                aria-label="Edit nickname"
                className="inline-flex shrink-0 rounded p-0.5 hover:bg-white/5"
                onClick={(e) => {
                  e.stopPropagation()
                  skipBlurSaveRef.current = false
                  setEditingNicknameId(l.id)
                  setNicknameDraft(l.nickname ?? '')
                }}
              >
                <PencilIcon />
              </button>
            </div>
          )}
          {renderSecondaryLine(l)}
          <div className="mt-1 text-xs text-zinc-400">{formatPrice(l.price_cents)}</div>
          <div className="mt-0.5 text-xs text-zinc-500">{formatScrapedDate(l.scraped_at)}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-white">Triage</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Bookmarked listings by pipeline stage. On mobile, tap a tab to switch stages; on desktop, drag cards between
          columns.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-400">Loading…</div>
      ) : (
        <div data-testid="triage-board" className="flex min-h-0 flex-1 flex-col gap-3">
          {empty ? (
            <div
              data-testid="triage-empty"
              className="rounded-md border border-white/10 bg-zinc-900/30 px-4 py-8 text-center text-sm text-zinc-400"
            >
              No bookmarked listings yet — bookmark a listing from the Results page.
            </div>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-3 md:hidden">
                <div
                  role="tablist"
                  data-testid="triage-mobile-tabs"
                  className="flex gap-1 overflow-x-auto rounded-md border border-white/10 bg-zinc-900/30 p-1"
                >
                  {STAGES.map((s) => {
                    const count = (byStage.get(s.key) ?? []).length
                    const selected = activeStage === s.key
                    return (
                      <button
                        key={s.key}
                        type="button"
                        role="tab"
                        data-testid={`triage-tab-${s.key}`}
                        aria-selected={selected}
                        onClick={() => setActiveStage(s.key)}
                        className={`flex shrink-0 items-center justify-center gap-1.5 rounded px-2 py-2 text-xs font-medium transition-colors ${
                          selected
                            ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-white/10'
                            : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                        }`}
                      >
                        <span>{s.label}</span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                            selected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700/80 text-zinc-300'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div data-testid="triage-mobile-list" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                  {(byStage.get(activeStage) ?? []).map((l) => (
                    <div
                      key={l.id}
                      className="flex flex-col rounded-md border border-white/10 bg-zinc-900 px-3 py-2"
                    >
                      {renderTriageTile(l)}
                      <label className="mt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                        Stage
                        <select
                          data-testid={`triage-mobile-stage-select-${l.id}`}
                          className="mt-1 w-full rounded border border-white/10 bg-zinc-950 px-2 py-1.5 text-xs text-white"
                          value={STAGES.some((s) => s.key === l.stage) ? l.stage : 'interested'}
                          onChange={(e) => void moveToStage(l.id, e.target.value)}
                        >
                          {STAGES.map((s) => (
                            <option key={s.key} value={s.key}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div
                data-testid="triage-desktop-kanban"
                className="hidden min-h-[420px] flex-1 grid-cols-5 gap-3 md:grid"
              >
                {STAGES.map((col) => (
                  <div
                    key={col.key}
                    data-testid={`triage-column-${col.key}`}
                    className="flex min-h-0 flex-col rounded-md border border-white/10 bg-zinc-900/30"
                    onDragOver={onDragOver}
                    onDrop={(e) => onDropColumn(e, col.key)}
                  >
                    <div className="border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {col.label}
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                      {(byStage.get(col.key) ?? []).map((l) => (
                        <div
                          key={l.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, l.id)}
                          className="flex cursor-grab flex-col rounded-md border border-white/10 bg-zinc-900 px-3 py-2 active:cursor-grabbing"
                        >
                          {renderTriageTile(l)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
