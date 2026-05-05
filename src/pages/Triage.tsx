import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import type { HouseHunt } from '../api'
import { getHouseHunts } from '../api'

const STAGES = [
  { key: 'interested' as const, label: 'Interested' },
  { key: 'contacted' as const, label: 'Contacted' },
  { key: 'tour_scheduled' as const, label: 'Tour Scheduled' },
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

export default function Triage() {
  const [listings, setListings] = useState<ListingRow[]>([])
  const [hunts, setHunts] = useState<HouseHunt[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-white">Triage</h1>
        <p className="mt-1 text-sm text-zinc-400">Bookmarked listings by pipeline stage. Drag cards between columns.</p>
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
          ) : null}
          <div className="grid min-h-[420px] flex-1 grid-cols-4 gap-3">
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
                      {l.hunt_id != null ? (
                        <span
                          data-testid="hunt-name-badge"
                          className="mb-1 self-start rounded-full bg-zinc-100/10 px-2 py-0.5 text-xs text-zinc-400"
                        >
                          {huntMap.get(l.hunt_id) ?? 'Unknown Hunt'}
                        </span>
                      ) : null}
                      <div className="line-clamp-1 text-sm font-medium text-white" title={l.title}>
                        {l.title}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">{formatPrice(l.price_cents)}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">{formatScrapedDate(l.scraped_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
