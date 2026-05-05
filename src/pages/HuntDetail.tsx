import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { HouseHuntDetail, HuntNotification, HuntResultListing, ScraperSource } from '../api'
import {
  getHouseHuntDetail,
  getHouseHuntResults,
  getScrapers,
  putHouseHunt,
} from '../api'

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

  return (
    <div className="mx-auto max-w-4xl space-y-8 text-zinc-100">
      <div>
        <h1 className="mb-4 text-xl font-semibold text-white">House hunt</h1>
        {error ? <p className="mb-2 text-sm text-red-400">{error}</p> : null}
      </div>

      {detail ? (
        <>
          <section className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
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

          <section className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
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

          <section className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
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

          <section className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
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

          <section className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
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
              <p className="text-sm text-zinc-500" data-testid="hunt-detail-results-empty">
                No matching results
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table data-testid="hunt-detail-results-table" className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-zinc-500">
                      <th className="py-2 pr-2">Title</th>
                      <th className="py-2 pr-2">Price</th>
                      <th className="py-2 pr-2">Beds / baths</th>
                      <th className="py-2 pr-2">Address</th>
                      <th className="py-2">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row) => (
                      <tr key={row.id} className="border-b border-white/5">
                        <td className="py-2 pr-2 text-zinc-200">{row.title}</td>
                        <td className="py-2 pr-2 text-zinc-300">{formatPrice(row.price_cents)}</td>
                        <td className="py-2 pr-2 text-zinc-400">
                          {row.beds ?? '—'} / {row.baths ?? '—'}
                        </td>
                        <td className="py-2 pr-2 text-zinc-400">{row.address ?? '—'}</td>
                        <td className="py-2">
                          <a href={row.link} className="text-sky-400 hover:underline" target="_blank" rel="noreferrer">
                            Open
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
