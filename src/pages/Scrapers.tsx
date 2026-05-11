import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { ScraperSource, RedfinParams } from '../api'
import {
  getScrapers,
  addScraper,
  addScraperRedfin,
  getScraperSource,
  patchScraperSource,
  redfinStructuredToParams,
  removeScraper,
  testScraperById,
  resolveRedfinUrl,
  updateScraperScheduleSlots,
} from '../api'
import { RedfinScraperForm } from '../components/RedfinScraperForm'
import { REGION_TYPE_OPTIONS } from '../redfinConstants'
import { parseRedfinUrl } from '../redfinUrlParse'

const defaultRedfinParams: RedfinParams = {
  region_id: 0,
  region_type: 6,
  market: '',
  num_homes: 350,
  page_number: 1,
  status: 9,
  v: 8,
}

type SelectedSourceType = 'rss' | 'redfin' | null

type TestOutput = { ok: boolean; count?: number; message?: string } | null

const SOURCE_OPTIONS = [
  { id: 'rss' as const, label: 'RSS Feed' },
  { id: 'redfin' as const, label: 'Redfin' },
]

/** Local day slots matching server `HH:MM` (30-minute steps). */
const ALL_DAY_SLOTS: string[] = (() => {
  const out: string[] = []
  for (let h = 0; h < 24; h += 1) {
    for (const m of [0, 30] as const) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return out
})()

const SLOT_COLORS = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-purple-600',
  'bg-amber-500',
  'bg-rose-600',
  'bg-cyan-600',
  'bg-orange-500',
] as const

const HOUR_LABELS = [
  { label: '12am', startSlot: 0 },
  { label: '2am', startSlot: 4 },
  { label: '4am', startSlot: 8 },
  { label: '6am', startSlot: 12 },
  { label: '8am', startSlot: 16 },
  { label: '10am', startSlot: 20 },
  { label: '12pm', startSlot: 24 },
  { label: '2pm', startSlot: 28 },
  { label: '4pm', startSlot: 32 },
  { label: '6pm', startSlot: 36 },
  { label: '8pm', startSlot: 40 },
  { label: '10pm', startSlot: 44 },
] as const

function formatSlotAmPm(hhmm: string): string {
  const [hs, ms] = hhmm.split(':')
  const h = Number(hs)
  const m = Number(ms)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`
}

function slotToMinutes(hhmm: string): number {
  const [hs, ms] = hhmm.split(':')
  const h = Number(hs)
  const m = Number(ms)
  if (Number.isNaN(h) || Number.isNaN(m)) return -1
  return h * 60 + m
}

/** Group scrapers for the “within 15 minutes” soft warning (same logical source). */
function scheduleGroupKey(s: ScraperSource): string {
  if (s.kind === 'redfin' && s.config_json) {
    try {
      const c = JSON.parse(s.config_json) as { market?: string }
      if (c.market) return `redfin:${String(c.market).toLowerCase()}`
    } catch {
      /* ignore */
    }
  }
  if (s.kind === 'rss' && s.url?.trim()) {
    try {
      return `rss:${new URL(s.url.trim()).hostname.toLowerCase()}`
    } catch {
      /* ignore */
    }
  }
  return `other:${s.kind}:${s.id}`
}

function slotHeldByOther(
  slot: string,
  sources: ScraperSource[],
  self: ScraperSource,
): { id: number; label: string } | null {
  const selfKey = scheduleGroupKey(self)
  for (const o of sources) {
    if (o.id === self.id) continue
    if (scheduleGroupKey(o) !== selfKey) continue
    const slots = o.schedule_slots ?? []
    if (slots.includes(slot)) return { id: o.id, label: rowLabel(o) }
  }
  return null
}

function proximityWarning(
  self: ScraperSource,
  draftSlots: string[],
  sources: ScraperSource[],
): boolean {
  const g = scheduleGroupKey(self)
  const selfMins = new Set(draftSlots.map(slotToMinutes).filter((n) => n >= 0))
  if (selfMins.size === 0) return false
  for (const o of sources) {
    if (o.id === self.id) continue
    if (scheduleGroupKey(o) !== g) continue
    for (const slot of o.schedule_slots ?? []) {
      const om = slotToMinutes(slot)
      if (om < 0) continue
      for (const sm of selfMins) {
        const d = Math.abs(sm - om)
        if (d > 0 && d <= 15) return true
      }
    }
  }
  return false
}

function scrapersForSlot(slot: string, sources: ScraperSource[]): ScraperSource[] {
  return sources.filter((s) => (s.schedule_slots ?? []).includes(slot))
}

const btnCompact = 'rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50'
const inputBase =
  'w-full rounded-md border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/50 focus:outline-none focus:ring-1 focus:ring-blue-400/30'

function sortSourcesRecentFirst(list: ScraperSource[]): ScraperSource[] {
  return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function rowLabel(s: ScraperSource): string {
  if (s.url?.trim()) return s.url.trim()
  if (s.kind === 'rss') return '(no URL)'
  if (s.config_json) {
    try {
      const c = JSON.parse(s.config_json) as { market?: string }
      if (c.market) return `Redfin · ${c.market}`
    } catch {
      /* ignore */
    }
  }
  return `Source ${s.id}`
}

function statusDotClass(s: ScraperSource, testingId: number | null): string {
  const base = 'mt-0.5 h-2 w-2 shrink-0 rounded-full'
  if (testingId === s.id) return `${base} animate-pulse bg-green-500`
  if (s.last_tested_at == null || s.last_tested_at === '') return `${base} bg-amber-500`
  if (s.last_test_ok === 1) return `${base} bg-green-500`
  return `${base} bg-red-500`
}

function statusDotTitle(s: ScraperSource, testingId: number | null): string {
  if (testingId === s.id) return 'Testing…'
  if (s.last_tested_at == null || s.last_tested_at === '') return 'Never tested'
  if (s.last_test_ok === 1) return 'Last test passed'
  return 'Last test failed'
}

function lastTestedDisplay(s: ScraperSource): string {
  if (s.last_tested_at != null && s.last_tested_at !== '') return formatWhen(s.last_tested_at)
  return 'Never tested'
}

function ScraperSourceTypeDropdown({
  value,
  onChange,
}: {
  value: SelectedSourceType
  onChange: (v: SelectedSourceType) => void
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const displayLabel = value ? (SOURCE_OPTIONS.find((o) => o.id === value)?.label ?? 'Select source type…') : 'Select source type…'

  useEffect(() => {
    if (!open) return
    const idx = SOURCE_OPTIONS.findIndex((o) => o.id === value)
    setHighlight(idx >= 0 ? idx : 0)
  }, [open, value])

  useEffect(() => {
    if (open) {
      const t = requestAnimationFrame(() => listRef.current?.focus())
      return () => cancelAnimationFrame(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const node = e.target as Node
      if (!rootRef.current?.contains(node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selectOption = (id: 'rss' | 'redfin') => {
    onChange(id)
    setOpen(false)
    btnRef.current?.focus()
  }

  const onKeyDownButton = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen((o) => !o)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    }
  }

  const onKeyDownList = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      btnRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % SOURCE_OPTIONS.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h - 1 + SOURCE_OPTIONS.length) % SOURCE_OPTIONS.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectOption(SOURCE_OPTIONS[highlight].id)
    }
  }

  return (
    <div ref={rootRef} className="relative max-w-[280px]" data-testid="scraper-source-type-dropdown">
      <button
        type="button"
        ref={btnRef}
        id="scrapers-type-trigger"
        className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-zinc-800 px-3 py-1.5 text-left text-sm text-white hover:bg-zinc-700"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="scrapers-type-listbox"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDownButton}
      >
        <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
        <span className="shrink-0 text-zinc-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul
          ref={listRef}
          id="scrapers-type-listbox"
          role="listbox"
          aria-labelledby="scrapers-type-trigger"
          tabIndex={0}
          className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-auto rounded-md border border-white/10 bg-zinc-900 py-1 shadow-lg outline-none"
          onKeyDown={onKeyDownList}
        >
          {SOURCE_OPTIONS.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={value === o.id}
              className={`cursor-pointer px-3 py-2 text-sm ${
                highlight === i ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800/50'
              }`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectOption(o.id)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ScheduleOverview({ sources }: { sources: ScraperSource[] }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const timePercent = (currentMinutes / 1440) * 100
  const timeLabel = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  const colorMap = new Map(
    [...sources].sort((a, b) => a.id - b.id).map((s, i) => [s.id, SLOT_COLORS[i % SLOT_COLORS.length]]),
  )
  const colorFor = (id: number) => colorMap.get(id) ?? 'bg-zinc-800'
  const activeSources = sources
    .filter((s) => (s.schedule_slots?.length ?? 0) > 0)
    .sort((a, b) => a.id - b.id)

  return (
    <section className="mt-8 max-w-full" data-testid="schedule-overview" aria-labelledby="schedule-overview-heading">
      <div className="flex items-start justify-between">
        <div>
          <h2 id="schedule-overview-heading" className="text-sm font-semibold text-zinc-300">
            Schedule Overview
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-zinc-500">
            Local time, 30-minute slots (read-only). A scraper runs when the clock matches one of its selected slots.
          </p>
        </div>
        <span className="mt-0 text-xs text-zinc-400" data-testid="current-time-label">
          {timeLabel}
        </span>
      </div>
      <div className="mt-3 w-full min-w-0 overflow-hidden rounded-md border border-white/10 bg-zinc-900 p-1">
        <div className="relative">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(48, minmax(0, 1fr))' }}>
            {HOUR_LABELS.map(({ label }) => (
              <div
                key={label}
                data-testid="hour-label"
                style={{ gridColumn: 'span 4' }}
                className="truncate pl-0.5 text-[9px] text-zinc-500"
              >
                {label}
              </div>
            ))}
          </div>
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(48, minmax(0, 1fr))' }}
            role="list"
            aria-label="Twenty-four hour scraper schedule"
          >
            {ALL_DAY_SLOTS.map((slot) => {
              const owners = scrapersForSlot(slot, sources)
              return (
                <div
                  key={slot}
                  data-testid={`schedule-slot-cell-${slot}`}
                  title={owners.length > 0 ? owners.map(rowLabel).join(' / ') : slot}
                  className="h-14 overflow-hidden border border-transparent"
                  role="listitem"
                >
                  {owners.length === 0 ? (
                    <div className="flex h-full items-center justify-center bg-zinc-950 text-[10px] text-zinc-600">
                      <span aria-hidden>·</span>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col">
                      {owners.map((o) => (
                        <div key={o.id} className={`${colorFor(o.id)} flex-1`} style={{ minHeight: 0 }} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div
            data-testid="current-time-indicator"
            style={{ left: `${timePercent}%` }}
            className="pointer-events-none absolute inset-y-0 w-px bg-white/70 z-10"
          />
        </div>
      </div>
      {activeSources.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {activeSources.map((src) => (
            <div key={src.id} className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className={`inline-block h-3 w-3 flex-shrink-0 rounded-sm ${colorFor(src.id)}`} />
              <span>
                {rowLabel(src)} —{' '}
                {[...(src.schedule_slots ?? [])]
                  .sort((a, b) => ALL_DAY_SLOTS.indexOf(a) - ALL_DAY_SLOTS.indexOf(b))
                  .map(formatSlotAmPm)
                  .join(', ')}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-600">No scrapers have scheduled slots.</p>
      )}
    </section>
  )
}

export default function Scrapers() {
  const [sources, setSources] = useState<ScraperSource[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSourceType, setSelectedSourceType] = useState<SelectedSourceType>(null)
  const [redfinCreateInitial, setRedfinCreateInitial] = useState<RedfinParams>({ ...defaultRedfinParams })
  const [redfinFormKey, setRedfinFormKey] = useState(0)
  const [redfinCreateBusy, setRedfinCreateBusy] = useState(false)
  const [redfinLocationUrl, setRedfinLocationUrl] = useState('')
  const [resolvingLocation, setResolvingLocation] = useState(false)
  const [resolvedLocationLabel, setResolvedLocationLabel] = useState<string | null>(null)
  const [paramsEditorId, setParamsEditorId] = useState<number | null>(null)
  const [paramsEditorInitial, setParamsEditorInitial] = useState<RedfinParams | null>(null)
  const [paramsEditorLoading, setParamsEditorLoading] = useState(false)
  const [paramsEditorBusy, setParamsEditorBusy] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [testOutput, setTestOutput] = useState<TestOutput>(null)
  const [testingId, setTestingId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftSlots, setDraftSlots] = useState<string[]>([])
  const [savingScheduleId, setSavingScheduleId] = useState<number | null>(null)
  const [activeScrapersOpen, setActiveScrapersOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const sortedSources = useMemo(() => sortSourcesRecentFirst(sources), [sources])

  const slotOrder = useMemo(() => new Map(ALL_DAY_SLOTS.map((s, i) => [s, i])), [])

  const sortDraftSlots = (slots: string[]) =>
    [...slots].sort((a, b) => (slotOrder.get(a) ?? 0) - (slotOrder.get(b) ?? 0))

  const resolveLocation = async () => {
    setError('')
    setResolvedLocationLabel(null)
    const url = redfinLocationUrl.trim()
    if (!url) {
      setError('Paste a Redfin city or zip URL first')
      return
    }
    setResolvingLocation(true)
    try {
      const resolved = await resolveRedfinUrl(url)
      const fromUrl = parseRedfinUrl(url)
      if (fromUrl) {
        setRedfinCreateInitial(fromUrl)
      } else {
        setRedfinCreateInitial({
          ...defaultRedfinParams,
          region_id: resolved.region_id,
          region_type: resolved.region_type,
          market: resolved.market,
        })
      }
      setRedfinFormKey((k) => k + 1)
      const typeLabel = REGION_TYPE_OPTIONS.find((o) => o.value === resolved.region_type)?.label ?? 'location'
      setResolvedLocationLabel(`${resolved.market} (${typeLabel.toLowerCase()})`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resolve URL')
    } finally {
      setResolvingLocation(false)
    }
  }

  useEffect(() => {
    getScrapers()
      .then(setSources)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const addRss = async () => {
    setError('')
    setSuccess('')
    const url = newUrl.trim()
    if (!url) {
      setError('Enter a feed URL')
      return
    }
    try {
      await addScraper(url)
      setNewUrl('')
      setSuccess('Feed added.')
      setSources(await getScrapers())
      setActiveScrapersOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add')
    }
  }

  const remove = async (id: number) => {
    setError('')
    setSuccess('')
    try {
      await removeScraper(id)
      setSuccess('Source removed.')
      setSources(await getScrapers())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove')
    }
  }

  const test = async (source: ScraperSource) => {
    setTestOutput(null)
    setError('')
    setTestingId(source.id)
    let testOk = false
    try {
      const result = await testScraperById(source.id)
      testOk = result.ok
      if (result.ok) {
        setTestOutput({ ok: true, count: result.count ?? 0 })
      } else {
        setTestOutput({ ok: false, message: result.error ?? 'Test failed' })
      }
    } catch (e) {
      setTestOutput({ ok: false, message: e instanceof Error ? e.message : 'Test failed' })
    } finally {
      setTestingId(null)
      const now = new Date().toISOString()
      setSources((prev) =>
        prev.map((s) =>
          s.id === source.id ? { ...s, last_tested_at: now, last_test_ok: testOk ? 1 : 0 } : s,
        ),
      )
    }
  }

  if (loading) {
    return <p className="text-zinc-400">Loading…</p>
  }

  return (
    <>
      <h1 className="text-xl font-semibold text-white">Scrapers</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-400">
        Data sources used by the pipeline. Test sparingly—hitting a feed too often can get you blocked.
      </p>

      <ScheduleOverview sources={sources} />

      <section className="mt-8" aria-labelledby="scrapers-active-heading">
        <div className="flex items-center gap-1">
          <h2
            id="scrapers-active-heading"
            className="cursor-pointer text-sm font-semibold text-zinc-300"
            onClick={() => setActiveScrapersOpen((o) => !o)}
          >
            Active Scrapers
          </h2>
          <button
            type="button"
            data-testid="scrapers-active-toggle"
            aria-expanded={activeScrapersOpen}
            aria-controls="scrapers-active-list"
            className="text-xs text-zinc-400 hover:text-white"
            onClick={() => setActiveScrapersOpen((o) => !o)}
          >
            {activeScrapersOpen ? '▲' : '▼'}
          </button>
        </div>
        {activeScrapersOpen && (
          <div id="scrapers-active-list">
            {sortedSources.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No scrapers configured yet.</p>
            ) : (
              <ul className="mt-3 list-none p-0">
                {sortedSources.map((s) => {
                  const editing = editingId === s.id
                  const warnNear = editing && proximityWarning(s, draftSlots, sources)
                  return (
                    <li key={s.id} className="border-b border-white/10 py-3">
                      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-4">
                        <div className="flex w-full min-w-0 items-start gap-3 sm:flex-1">
                          <span
                            className={statusDotClass(s, testingId)}
                            title={statusDotTitle(s, testingId)}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <div className="break-words text-sm text-white">{rowLabel(s)}</div>
                            {!editing && (s.schedule_slots?.length ?? 0) > 0 && (
                              <p className="mt-1 text-xs text-zinc-500">
                                Slots: {sortDraftSlots(s.schedule_slots).map(formatSlotAmPm).join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-zinc-500 sm:ml-auto">{lastTestedDisplay(s)}</span>
                        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
                          {s.kind === 'redfin' && (
                            <button
                              type="button"
                              className={btnCompact}
                              data-testid={`scraper-edit-params-${s.id}`}
                              onClick={async () => {
                                if (paramsEditorId === s.id) {
                                  setParamsEditorId(null)
                                  setParamsEditorInitial(null)
                                  return
                                }
                                setError('')
                                setParamsEditorId(s.id)
                                setParamsEditorInitial(null)
                                setParamsEditorLoading(true)
                                try {
                                  const row = await getScraperSource(s.id)
                                  if (row.kind !== 'redfin' || !row.params) {
                                    setError('Could not load Redfin parameters for this source.')
                                    setParamsEditorId(null)
                                    return
                                  }
                                  setParamsEditorInitial(redfinStructuredToParams(row.params))
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : 'Failed to load scraper')
                                  setParamsEditorId(null)
                                } finally {
                                  setParamsEditorLoading(false)
                                }
                              }}
                            >
                              {paramsEditorId === s.id ? 'Close params' : 'Edit params'}
                            </button>
                          )}
                          <button
                            type="button"
                            className={btnCompact}
                            data-testid={`scraper-edit-${s.id}`}
                            onClick={() => {
                              if (editingId === s.id) {
                                setEditingId(null)
                              } else {
                                setEditingId(s.id)
                                setDraftSlots(sortDraftSlots([...(s.schedule_slots ?? [])]))
                              }
                            }}
                          >
                            {editing ? 'Close' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            className={btnCompact}
                            onClick={() => test(s)}
                            disabled={testingId !== null}
                            title="Test sparingly (max ~1/hour per source)"
                          >
                            {testingId === s.id ? 'Testing…' : 'Test'}
                          </button>
                          <button
                            type="button"
                            className="rounded-md bg-red-700 px-2.5 py-1.5 text-xs text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                            data-testid={`scraper-delete-${s.id}`}
                            onClick={() => setDeleteConfirmId(s.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {editing && (
                        <div className="mt-4 pl-8">
                          {warnNear && (
                            <p
                              className="mb-3 inline-flex max-w-xl rounded-md border border-amber-500/40 bg-amber-950/40 px-2 py-1 text-xs text-amber-200"
                              data-testid="schedule-proximity-warning"
                            >
                              Another scraper on the same source is scheduled within 15 minutes of one of your slots (overlap
                              is still allowed).
                            </p>
                          )}
                          <fieldset>
                            <legend className="text-xs font-medium text-zinc-400">Run schedule (local time)</legend>
                            <div
                              className="mt-2 grid max-w-4xl grid-cols-8 gap-1 sm:grid-cols-12"
                              data-testid="scraper-slot-picker"
                              role="group"
                              aria-label="Time slots"
                            >
                              {ALL_DAY_SLOTS.map((slot) => {
                                const held = slotHeldByOther(slot, sources, s)
                                const selected = draftSlots.includes(slot)
                                const disabled = held !== null
                                return (
                                  <button
                                    key={slot}
                                    type="button"
                                    data-testid={`slot-option-${slot}`}
                                    disabled={disabled}
                                    title={
                                      disabled && held
                                        ? `Held by ${held.label}`
                                        : `${formatSlotAmPm(slot)} — click to ${selected ? 'remove' : 'add'}`
                                    }
                                    aria-pressed={selected}
                                    onClick={() => {
                                      if (disabled) return
                                      setDraftSlots((prev) =>
                                        sortDraftSlots(
                                          prev.includes(slot) ? prev.filter((x) => x !== slot) : [...prev, slot],
                                        ),
                                      )
                                    }}
                                    className={`min-h-[2.25rem] rounded border px-0.5 py-1 text-[10px] leading-tight ${
                                      disabled
                                        ? 'cursor-not-allowed border-white/5 bg-zinc-950/80 text-zinc-600 line-through'
                                        : selected
                                          ? 'border-blue-400/60 bg-blue-950/40 text-blue-100'
                                          : 'border-white/10 bg-zinc-900 text-zinc-300 hover:border-white/20 hover:bg-zinc-800'
                                    }`}
                                  >
                                    {formatSlotAmPm(slot)}
                                  </button>
                                )
                              })}
                            </div>
                          </fieldset>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={btnCompact}
                              disabled={savingScheduleId !== null}
                              onClick={async () => {
                                setError('')
                                setSavingScheduleId(s.id)
                                try {
                                  await updateScraperScheduleSlots(s.id, draftSlots)
                                  setSources(await getScrapers())
                                  setSuccess('Schedule updated.')
                                  setEditingId(null)
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : 'Failed to save schedule')
                                } finally {
                                  setSavingScheduleId(null)
                                }
                              }}
                            >
                              {savingScheduleId === s.id ? 'Saving…' : 'Save schedule'}
                            </button>
                            <button
                              type="button"
                              className={btnCompact}
                              disabled={savingScheduleId !== null}
                              onClick={() => {
                                setEditingId(null)
                                setDraftSlots([])
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {s.kind === 'redfin' && paramsEditorId === s.id && (
                        <div className="mt-4 border-t border-white/5 pt-4 pl-8">
                          {paramsEditorLoading && <p className="text-sm text-zinc-400">Loading parameters…</p>}
                          {!paramsEditorLoading && paramsEditorInitial && (
                            <RedfinScraperForm
                              key={`edit-${s.id}-${paramsEditorInitial.region_id}-${paramsEditorInitial.market}`}
                              mode="edit"
                              initial={paramsEditorInitial}
                              busy={paramsEditorBusy}
                              onCancel={() => {
                                setParamsEditorId(null)
                                setParamsEditorInitial(null)
                              }}
                              onSubmit={async (p) => {
                                setError('')
                                setParamsEditorBusy(true)
                                try {
                                  await patchScraperSource(s.id, p)
                                  setSuccess('Redfin parameters updated.')
                                  setSources(await getScrapers())
                                  setParamsEditorId(null)
                                  setParamsEditorInitial(null)
                                } catch (e) {
                                  throw e instanceof Error ? e : new Error('Failed to save')
                                } finally {
                                  setParamsEditorBusy(false)
                                }
                              }}
                            />
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {(testingId !== null || testOutput !== null) && (
        <section className="mt-8" aria-label="Test output">
          <h2 className="text-sm font-semibold text-zinc-300">Test Output</h2>
          <div className="mt-2 min-h-[2.5rem] rounded-md border border-white/10 bg-zinc-900 px-4 py-3 font-mono text-sm">
            {testingId !== null && <span className="text-sky-400">Running test…</span>}
            {testOutput !== null && testingId === null && (
              <span className={testOutput.ok ? 'text-green-400' : 'text-red-400'}>
                {testOutput.ok
                  ? `▶ Test passed — ${testOutput.count ?? 0} listing(s) found`
                  : `✗ Test failed: ${testOutput.message ?? 'Unknown error'}`}
              </span>
            )}
          </div>
        </section>
      )}

      <section className="mt-10" aria-labelledby="scrapers-add-heading">
        <h2 id="scrapers-add-heading" className="text-sm font-semibold text-zinc-300">
          Add New Scraper
        </h2>
        <div className="mt-4 max-w-xl">
          <label htmlFor="scrapers-type-trigger" className="mb-1 block text-sm text-zinc-400">
            Source type
          </label>
          <ScraperSourceTypeDropdown
            value={selectedSourceType}
            onChange={(v) => {
              setSelectedSourceType(v)
              setError('')
              setSuccess('')
            }}
          />
        </div>

        {selectedSourceType === 'rss' && (
          <div className="mt-4 max-w-xl">
            <p className="mb-3 text-sm text-zinc-500">Paste a full feed URL. Generic RSS and Atom feeds are supported.</p>
            <label htmlFor="scrapers-new-rss-url" className="mb-1 block text-sm text-zinc-400">
              Feed URL
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="scrapers-new-rss-url"
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
                className={`${inputBase} min-w-[200px] flex-1`}
              />
              <button type="button" className={btnCompact} onClick={addRss}>
                Add feed
              </button>
            </div>
          </div>
        )}

        {selectedSourceType === 'redfin' && (
          <div className="mt-4">
            <RedfinScraperForm
              key={`create-${redfinFormKey}`}
              mode="create"
              initial={redfinCreateInitial}
              busy={redfinCreateBusy}
              location={{
                url: redfinLocationUrl,
                onUrlChange: setRedfinLocationUrl,
                onResolve: () => void resolveLocation(),
                resolving: resolvingLocation,
                resolvedLabel: resolvedLocationLabel,
              }}
              onSubmit={async (params) => {
                setError('')
                setSuccess('')
                setRedfinCreateBusy(true)
                try {
                  await addScraperRedfin(params)
                  setSuccess('Redfin source added.')
                  setSources(await getScrapers())
                  setActiveScrapersOpen(true)
                  setRedfinLocationUrl('')
                  setResolvedLocationLabel(null)
                  setRedfinCreateInitial({ ...defaultRedfinParams })
                  setRedfinFormKey((k) => k + 1)
                } catch (e) {
                  throw e instanceof Error ? e : new Error('Failed to add')
                } finally {
                  setRedfinCreateBusy(false)
                }
              }}
            />
          </div>
        )}
      </section>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {success && <p className="mt-4 text-sm text-green-400">{success}</p>}

      {deleteConfirmId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          data-testid="delete-confirm-modal"
        >
          <div className="rounded-lg bg-zinc-800 p-6 shadow-xl">
            <p className="text-sm font-semibold text-white">Delete this Scraper?</p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                className={btnCompact}
                data-testid="delete-cancel-btn"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-red-700 px-2.5 py-1.5 text-xs text-white hover:bg-red-600"
                data-testid="delete-confirm-btn"
                onClick={async () => {
                  const id = deleteConfirmId
                  setDeleteConfirmId(null)
                  await remove(id)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
