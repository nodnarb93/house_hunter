import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { HouseHuntDetail, HuntNotification, HuntResultListing, ScraperSource } from '../api'
import {
  getHouseHuntDetail,
  getHouseHuntResults,
  getScrapers,
  putHouseHunt,
} from '../api'
import { GearIcon } from '../components/GearIcon'

function formatPrice(cents: number | null): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    cents / 100
  )
}

type DraftNotification = Omit<HuntNotification, 'id'> & { id?: number }

export default function HuntDetail() {
  const { id: idParam } = useParams()
  const huntId = useMemo(() => {
    if (!idParam) return null
    const n = parseInt(idParam, 10)
    return Number.isNaN(n) ? null : n
  }, [idParam])

  const [detail, setDetail] = useState<HouseHuntDetail | null>(null)
  const [scrapers, setScrapers] = useState<ScraperSource[]>([])
  const [results, setResults] = useState<HuntResultListing[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [nameDraft, setNameDraft] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minBeds, setMinBeds] = useState('')
  const [minBaths, setMinBaths] = useState('')
  const [keywords, setKeywords] = useState('')
  const [keywordsExclude, setKeywordsExclude] = useState('')
  const [locationText, setLocationText] = useState('')
  const [scraperIds, setScraperIds] = useState<number[]>([])
  const [notificationsDraft, setNotificationsDraft] = useState<DraftNotification[]>([])
  const [newNotifType, setNewNotifType] = useState<HuntNotification['type']>('webhook')
  const [newNotifDest, setNewNotifDest] = useState('')

  const applyDetail = useCallback((d: HouseHuntDetail) => {
    setDetail(d)
    setNameDraft(d.name)
    const f = d.filters
    setMinPrice(f.min_price != null ? String(f.min_price) : '')
    setMaxPrice(f.max_price != null ? String(f.max_price) : '')
    setMinBeds(f.min_beds != null ? String(f.min_beds) : '')
    setMinBaths(f.min_baths != null ? String(f.min_baths) : '')
    setKeywords(f.keywords ?? '')
    setKeywordsExclude(f.keywords_exclude ?? '')
    setLocationText(f.location_text ?? '')
    setScraperIds([...d.scraper_ids])
    setNotificationsDraft(
      d.notifications.map((n) => ({
        id: n.id,
        type: n.type,
        destination: n.destination,
        enabled: n.enabled,
      }))
    )
  }, [])

  const load = useCallback(async () => {
    if (huntId == null) return
    setError(null)
    const [d, s, r] = await Promise.all([
      getHouseHuntDetail(huntId),
      getScrapers(),
      getHouseHuntResults(huntId),
    ])
    applyDetail(d)
    setScrapers(s)
    setResults(r)
  }, [huntId, applyDetail])

  useEffect(() => {
    if (huntId == null) {
      setError('Invalid hunt id')
      return
    }
    void load().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load hunt')
    })
  }, [huntId, load])

  async function run(op: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await op()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  function parseIntField(raw: string): number | null {
    const t = raw.trim()
    if (t === '') return null
    const n = parseInt(t, 10)
    return Number.isNaN(n) ? null : n
  }

  function parseFloatField(raw: string): number | null {
    const t = raw.trim()
    if (t === '') return null
    const n = parseFloat(t)
    return Number.isNaN(n) ? null : n
  }

  function filtersPayload() {
    return {
      min_price: parseIntField(minPrice),
      max_price: parseIntField(maxPrice),
      min_beds: parseIntField(minBeds),
      min_baths: parseFloatField(minBaths),
      keywords: keywords.trim() === '' ? null : keywords.trim(),
      keywords_exclude: keywordsExclude.trim() === '' ? null : keywordsExclude.trim(),
      location_text: locationText.trim() === '' ? null : locationText.trim(),
    }
  }

  async function saveName() {
    if (huntId == null) return
    const trimmed = nameDraft.trim()
    if (!trimmed) {
      setError('Name is required')
      return
    }
    await run(async () => {
      const d = await putHouseHunt(huntId, { name: trimmed })
      applyDetail(d)
    })
  }

  async function saveFilters() {
    if (huntId == null) return
    await run(async () => {
      const d = await putHouseHunt(huntId, { filters: filtersPayload() })
      applyDetail(d)
    })
  }

  async function saveScrapers() {
    if (huntId == null) return
    await run(async () => {
      const d = await putHouseHunt(huntId, { scraper_ids: scraperIds })
      applyDetail(d)
    })
  }

  async function saveNotifications() {
    if (huntId == null) return
    await run(async () => {
      const d = await putHouseHunt(huntId, {
        notifications: notificationsDraft.map((n) => ({
          type: n.type,
          destination: n.destination.trim(),
          enabled: n.enabled,
        })),
      })
      applyDetail(d)
    })
  }

  async function refreshResults() {
    if (huntId == null) return
    await run(async () => {
      setResults(await getHouseHuntResults(huntId))
    })
  }

  async function toggleResultBookmark(r: HuntResultListing) {
    const cur = r.bookmarked === 1 ? 1 : 0
    const next: 0 | 1 = cur === 1 ? 0 : 1
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/listings/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarked: next }),
      })
      if (!res.ok) {
        setError(await res.text())
        return
      }
      const updated = (await res.json()) as { bookmarked: number }
      setResults((prev) => prev.map((row) => (row.id === r.id ? { ...row, bookmarked: updated.bookmarked } : row)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  function toggleScraper(sid: number) {
    setScraperIds((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid].sort((a, b) => a - b)))
  }

  function addNotificationRow() {
    const dest = newNotifDest.trim()
    if (!dest) {
      setError('Destination is required')
      return
    }
    setNotificationsDraft((prev) => [...prev, { type: newNotifType, destination: dest, enabled: true }])
    setNewNotifDest('')
    setError(null)
  }

  function removeNotification(index: number) {
    setNotificationsDraft((prev) => prev.filter((_, i) => i !== index))
  }

  function toggleNotifEnabled(index: number) {
    setNotificationsDraft((prev) =>
      prev.map((n, i) => (i === index ? { ...n, enabled: !n.enabled } : n))
    )
  }

  if (huntId == null) {
    return <p className="text-zinc-400">Invalid hunt id.</p>
  }

  if (!detail && !error) {
    return <p className="text-zinc-400">Loading…</p>
  }

  const configDrawer = drawerOpen ? (
    <div
      className="fixed inset-y-0 right-0 z-50 w-96 overflow-y-auto border-l border-white/10 bg-zinc-900 shadow-xl"
      data-testid="hunt-config-drawer"
    >
      <div className="flex items-center justify-end border-b border-white/10 px-3 py-2">
        <button
          type="button"
          data-testid="close-config-drawer"
          onClick={() => setDrawerOpen(false)}
          className="rounded-md px-2 py-1 text-lg leading-none text-zinc-400 hover:bg-zinc-800 hover:text-white"
          aria-label="Close configuration"
        >
          ×
        </button>
      </div>
      <div className="space-y-6 p-4">
        <section className="rounded-lg border border-white/10 bg-zinc-950/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Name</h2>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm text-zinc-400">
              Hunt name
              <input
                data-testid="hunt-detail-name-input"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
              />
            </label>
            <button
              type="button"
              data-testid="hunt-detail-save-name"
              disabled={busy}
              onClick={() => void saveName()}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
            >
              Save name
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-zinc-950/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Filters</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-zinc-400">
              Min price ($)
              <input
                data-testid="hunt-detail-min-price"
                type="number"
                inputMode="numeric"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-400">
              Max price ($)
              <input
                data-testid="hunt-detail-max-price"
                type="number"
                inputMode="numeric"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-400">
              Min beds
              <input
                data-testid="hunt-detail-min-beds"
                type="number"
                inputMode="numeric"
                value={minBeds}
                onChange={(e) => setMinBeds(e.target.value)}
                className="rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-400">
              Min baths
              <input
                data-testid="hunt-detail-min-baths"
                type="number"
                inputMode="decimal"
                value={minBaths}
                onChange={(e) => setMinBaths(e.target.value)}
                className="rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-400 sm:col-span-2">
              Keywords (comma-separated)
              <input
                data-testid="hunt-detail-keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-400 sm:col-span-2">
              Exclude keywords (comma-separated)
              <input
                data-testid="hunt-detail-keywords-exclude"
                value={keywordsExclude}
                onChange={(e) => setKeywordsExclude(e.target.value)}
                className="rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-400 sm:col-span-2">
              Location
              <input
                data-testid="hunt-detail-location"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                className="rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
              />
            </label>
          </div>
          <button
            type="button"
            data-testid="hunt-detail-save-filters"
            disabled={busy}
            onClick={() => void saveFilters()}
            className="mt-3 rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
          >
            Save filters
          </button>
        </section>

        <section className="rounded-lg border border-white/10 bg-zinc-950/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Scrapers</h2>
          {scrapers.length === 0 ? (
            <p className="text-sm text-zinc-500">No scrapers configured yet.</p>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-y-auto">
              {scrapers.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    id={`hunt-scraper-${s.id}`}
                    data-testid={`hunt-detail-scraper-${s.id}`}
                    type="checkbox"
                    checked={scraperIds.includes(s.id)}
                    onChange={() => toggleScraper(s.id)}
                    className="rounded border-white/20 bg-zinc-950"
                  />
                  <label htmlFor={`hunt-scraper-${s.id}`} className="cursor-pointer text-zinc-300">
                    #{s.id} — {s.kind} — <span className="text-zinc-500">{s.url}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            data-testid="hunt-detail-save-scrapers"
            disabled={busy}
            onClick={() => void saveScrapers()}
            className="mt-3 rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
          >
            Save scrapers
          </button>
        </section>

        <section className="rounded-lg border border-white/10 bg-zinc-950/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Notifications</h2>
          <ul className="mb-3 space-y-2" data-testid="hunt-detail-notification-list">
            {notificationsDraft.map((n, i) => (
              <li
                key={n.id ?? `new-${i}-${n.destination}`}
                data-testid={`hunt-detail-notification-row-${i}`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-white/5 bg-zinc-950/80 px-3 py-2 text-sm"
              >
                <span className="text-zinc-400">{n.type}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-200">{n.destination}</span>
                <label className="flex items-center gap-1 text-zinc-400">
                  <input
                    type="checkbox"
                    checked={n.enabled}
                    onChange={() => toggleNotifEnabled(i)}
                    className="rounded border-white/20 bg-zinc-950"
                  />
                  enabled
                </label>
                <button
                  type="button"
                  onClick={() => removeNotification(i)}
                  className="text-xs text-red-400 hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
            <label className="text-sm text-zinc-400">
              Type
              <select
                data-testid="hunt-detail-notification-type"
                value={newNotifType}
                onChange={(e) => setNewNotifType(e.target.value as HuntNotification['type'])}
                className="ml-1 rounded-md border border-white/10 bg-zinc-950 px-2 py-1.5 text-white outline-none focus:border-zinc-500"
              >
                <option value="webhook">webhook</option>
                <option value="discord">discord</option>
                <option value="email">email</option>
              </select>
            </label>
            <input
              data-testid="hunt-detail-notification-destination"
              type="text"
              placeholder="Destination URL or address"
              value={newNotifDest}
              onChange={(e) => setNewNotifDest(e.target.value)}
              className="min-w-[12rem] flex-1 rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
            />
            <button
              type="button"
              data-testid="hunt-detail-add-notification"
              disabled={busy}
              onClick={addNotificationRow}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              Add notification
            </button>
          </div>
          <button
            type="button"
            data-testid="hunt-detail-save-notifications"
            disabled={busy}
            onClick={() => void saveNotifications()}
            className="mt-3 rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
          >
            Save notifications
          </button>
        </section>
      </div>
    </div>
  ) : null

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-zinc-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">{detail?.name ?? 'House hunt'}</h1>
          {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        </div>
        {detail ? (
          <button
            type="button"
            data-testid="open-config-drawer"
            disabled={busy}
            onClick={() => setDrawerOpen(true)}
            className="rounded-md border border-white/15 p-2 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            title="Configure hunt"
            aria-label="Open hunt configuration"
          >
            <GearIcon className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {detail ? (
        <>
          <div className="rounded-lg border border-white/10 bg-zinc-900/60">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Results</h2>
              <button
                type="button"
                data-testid="hunt-detail-results-refresh"
                disabled={busy}
                onClick={() => void refreshResults()}
                className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
            {results.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-4 py-24 text-center"
                data-testid="hunt-detail-results-empty"
              >
                <p className="text-lg text-zinc-400">No listings identified yet.</p>
                <button
                  type="button"
                  data-testid="configure-hunt-cta"
                  onClick={() => setDrawerOpen(true)}
                  className="rounded-md bg-sky-600 px-4 py-2 text-white hover:bg-sky-500"
                >
                  Configure Hunt
                </button>
              </div>
            ) : (
              <div
                data-testid="hunt-detail-results-grid"
                className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {results.map((r) => (
                  <div
                    key={r.id}
                    data-testid="hunt-result-card"
                    className="flex flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-950/40 shadow-sm"
                  >
                    {r.image_url ? (
                      <img src={r.image_url} alt={r.title} className="h-40 w-full object-cover" />
                    ) : (
                      <div className="flex h-40 w-full items-center justify-center bg-zinc-800 text-zinc-500">No image</div>
                    )}
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <p className="text-lg font-bold text-white">{formatPrice(r.price_cents)}</p>
                      <p className="text-sm text-zinc-400">
                        {[r.beds != null && `${r.beds} bd`, r.baths != null && `${r.baths} ba`].filter(Boolean).join(' · ')}
                      </p>
                      <p className="truncate text-sm text-zinc-500">{r.address ?? '—'}</p>
                    </div>
                    <div className="flex gap-2 border-t border-white/10 p-3">
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 rounded-md bg-sky-600 px-3 py-1.5 text-center text-sm text-white hover:bg-sky-500"
                      >
                        View Listing
                      </a>
                      <button
                        type="button"
                        title="Bookmark"
                        disabled={busy}
                        data-testid={`hunt-result-bookmark-${r.id}`}
                        onClick={() => void toggleResultBookmark(r)}
                        className="rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {r.bookmarked === 1 ? 'Saved' : 'Bookmark'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {configDrawer}
        </>
      ) : null}
    </div>
  )
}
