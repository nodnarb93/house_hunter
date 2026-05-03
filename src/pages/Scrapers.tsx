import { useEffect, useMemo, useState } from 'react'
import type { ScraperSource, RedfinParams } from '../api'
import {
  getScrapers,
  addScraper,
  addScraperRedfin,
  removeScraper,
  testScraperById,
  resolveRedfinUrl,
} from '../api'

const REGION_TYPE_OPTIONS = [
  { value: 6, label: 'City' },
  { value: 2, label: 'Zip code' },
] as const

const PROPERTY_TYPE_OPTIONS = [
  { value: '1', label: 'House' },
  { value: '2', label: 'Condo' },
  { value: '3', label: 'Townhouse' },
  { value: '4', label: 'Multi-family' },
  { value: '5', label: 'Land' },
  { value: '6', label: 'Other' },
] as const

const defaultRedfinParams: RedfinParams = {
  region_id: 0,
  region_type: 6,
  market: '',
  num_homes: 350,
  page_number: 1,
  status: 9,
  v: 8,
}

type AddKind = 'rss' | 'redfin' | null

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

function primaryLabel(s: ScraperSource): string {
  if (s.kind === 'rss') return s.url || '(no URL)'
  if (s.url?.trim()) return s.url
  if (s.config_json) {
    try {
      const c = JSON.parse(s.config_json) as { market?: string }
      if (c.market) return `Redfin · ${c.market}`
    } catch {
      /* ignore */
    }
  }
  return `Redfin source #${s.id}`
}

function statusDotClass(s: ScraperSource, testingId: number | null): string {
  if (testingId === s.id) return 'scrapers-status-dot scrapers-status-dot-pending'
  if (s.last_tested_at == null || s.last_tested_at === '') return 'scrapers-status-dot scrapers-status-dot-unknown'
  if (s.last_test_ok === 1) return 'scrapers-status-dot scrapers-status-dot-ok'
  return 'scrapers-status-dot scrapers-status-dot-fail'
}

function statusDotTitle(s: ScraperSource, testingId: number | null): string {
  if (testingId === s.id) return 'Testing…'
  if (s.last_tested_at == null || s.last_tested_at === '') return 'Never tested'
  if (s.last_test_ok === 1) return 'Last test passed'
  return 'Last test failed'
}

export default function Scrapers() {
  const [sources, setSources] = useState<ScraperSource[]>([])
  const [loading, setLoading] = useState(true)
  const [addKind, setAddKind] = useState<AddKind>(null)
  const [redfinParams, setRedfinParams] = useState<RedfinParams>({ ...defaultRedfinParams })
  const [redfinLocationUrl, setRedfinLocationUrl] = useState('')
  const [resolvingLocation, setResolvingLocation] = useState(false)
  const [resolvedLocationLabel, setResolvedLocationLabel] = useState<string | null>(null)
  const [newUrl, setNewUrl] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [testingId, setTestingId] = useState<number | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const sortedSources = useMemo(() => sortSourcesRecentFirst(sources), [sources])

  const selectedPropertyTypes = (redfinParams.uipt ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const togglePropertyType = (value: string) => {
    const set = new Set(selectedPropertyTypes)
    if (set.has(value)) set.delete(value)
    else set.add(value)
    const uipt = [...set].sort().join(',') || undefined
    setRedfinParams((p) => ({ ...p, uipt }))
  }

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
      setRedfinParams((p) => ({
        ...p,
        region_id: resolved.region_id,
        region_type: resolved.region_type,
        market: resolved.market,
      }))
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

  const addRedfin = async () => {
    setError('')
    setSuccess('')
    const market = redfinParams.market?.trim()
    if (!market) {
      setError('Resolve a Redfin location URL first, or enter a market name.')
      return
    }
    if (!redfinParams.region_id || Number.isNaN(Number(redfinParams.region_id))) {
      setError('Resolve a Redfin location URL to set region (region ID is resolved from the URL).')
      return
    }
    try {
      await addScraperRedfin({
        ...redfinParams,
        market: market.toLowerCase().replace(/\s+/g, '-'),
      })
      setSuccess('Redfin source added.')
      setSources(await getScrapers())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add')
    }
  }

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
    setError('')
    setSuccess('')
    setTestingId(source.id)
    try {
      const result = await testScraperById(source.id)
      if (result.ok) {
        setSuccess(`Test passed — ${result.count ?? 0} listing(s) found`)
      } else {
        setError(result.error ?? 'Test failed')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setTestingId(null)
      try {
        setSources(await getScrapers())
      } catch {
        /* ignore refresh errors */
      }
    }
  }

  if (loading) return <p>Loading...</p>

  return (
    <>
      <h1>Scrapers</h1>
      <p className="scrapers-lede">
        Data sources used by the pipeline. Test sparingly—hitting a feed too often can get you blocked.
      </p>

      <section className="scrapers-section" aria-labelledby="scrapers-active-heading">
        <h2 id="scrapers-active-heading" className="scrapers-section-title">
          Active sources
        </h2>
        {sortedSources.length === 0 ? (
          <p className="scrapers-empty">No sources configured yet. Add an RSS feed or a Redfin region below.</p>
        ) : (
          <ul className="scrapers-active-list">
            {sortedSources.map((s) => {
              const isRss = s.kind === 'rss'
              const lastTestedLine =
                s.last_tested_at != null && s.last_tested_at !== ''
                  ? `Last tested: ${formatWhen(s.last_tested_at)}`
                  : 'Never tested'
              return (
                <li key={s.id} className="scrapers-row">
                  <div className="scrapers-row-main">
                    <span
                      className={statusDotClass(s, testingId)}
                      title={statusDotTitle(s, testingId)}
                      aria-hidden
                    />
                    <span className={isRss ? 'scrapers-badge scrapers-badge-rss' : 'scrapers-badge scrapers-badge-redfin'}>
                      {isRss ? 'RSS' : 'Redfin'}
                    </span>
                    <div className="scrapers-row-text">
                      <div className="scrapers-row-title">{primaryLabel(s)}</div>
                      <div className="scrapers-row-meta">Added {formatWhen(s.created_at)}</div>
                      <div className="scrapers-row-meta">{lastTestedLine}</div>
                    </div>
                  </div>
                  <div className="scrapers-row-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => test(s)}
                      disabled={testingId !== null}
                      title="Test sparingly (max ~1/hour per source)"
                    >
                      {testingId === s.id ? 'Testing…' : 'Test'}
                    </button>
                    <button type="button" className="secondary" onClick={() => remove(s.id)}>
                      Remove
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="scrapers-section" aria-labelledby="scrapers-add-heading">
        <h2 id="scrapers-add-heading" className="scrapers-section-title">
          Add source
        </h2>
        <div className="scrapers-type-tabs" role="tablist" aria-label="Source type">
          <button
            type="button"
            role="tab"
            aria-selected={addKind === 'rss'}
            className={addKind === 'rss' ? 'scrapers-tab scrapers-tab-active' : 'scrapers-tab'}
            onClick={() => setAddKind('rss')}
          >
            RSS / Atom feed
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={addKind === 'redfin'}
            className={addKind === 'redfin' ? 'scrapers-tab scrapers-tab-active' : 'scrapers-tab'}
            onClick={() => setAddKind('redfin')}
          >
            Redfin region
          </button>
        </div>

        {addKind === 'rss' && (
          <div className="scrapers-add-panel" role="tabpanel">
            <p className="form-hint" style={{ marginTop: 0 }}>
              Paste a full feed URL. Generic RSS and Atom feeds are supported.
            </p>
            <div className="form-group">
              <label htmlFor="scrapers-new-rss-url">Feed URL</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  id="scrapers-new-rss-url"
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com/feed.xml"
                  style={{ flex: 1, minWidth: '200px' }}
                />
                <button type="button" onClick={addRss}>
                  Add feed
                </button>
              </div>
            </div>
          </div>
        )}

        {addKind === 'redfin' && (
          <div className="scrapers-add-panel" role="tabpanel">
            <div className="form-group redfin-form-block">
              <label className="form-label-main">Location (region is resolved from URL)</label>
              <p className="form-hint">
                Open Redfin, search for a city or zip, then paste the URL here. We’ll resolve region ID, type, and market for you.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <input
                  type="url"
                  className="form-input-wide"
                  value={redfinLocationUrl}
                  onChange={(e) => setRedfinLocationUrl(e.target.value)}
                  placeholder="https://www.redfin.com/city/4664/OH/Columbus"
                  style={{ flex: 1, minWidth: 280 }}
                />
                <button type="button" onClick={resolveLocation} disabled={resolvingLocation}>
                  {resolvingLocation ? 'Resolving…' : 'Resolve'}
                </button>
              </div>
              {resolvedLocationLabel && (
                <p className="form-resolved" style={{ marginTop: '0.5rem' }}>
                  Resolved: <strong>{resolvedLocationLabel}</strong> — region ID is set automatically.
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label-main">Region type</label>
              <select
                value={redfinParams.region_type ?? 6}
                onChange={(e) => setRedfinParams((p) => ({ ...p, region_type: Number(e.target.value) }))}
                className="form-select"
                style={{ maxWidth: 200 }}
              >
                {REGION_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label-main">Market (slug)</label>
              <p className="form-hint">e.g. columbus, sfbay, dc — often filled from Resolve.</p>
              <input
                type="text"
                value={redfinParams.market ?? ''}
                onChange={(e) => setRedfinParams((p) => ({ ...p, market: e.target.value }))}
                placeholder="columbus"
                className="form-input-wide"
                style={{ maxWidth: 240 }}
              />
            </div>

            <div style={{ display: 'grid', gap: '0.75rem 1.25rem', gridTemplateColumns: '1fr 1fr', maxWidth: 520 }}>
              <div className="form-group">
                <label>Minimum price ($)</label>
                <input
                  type="number"
                  value={redfinParams.min_price ?? ''}
                  onChange={(e) => setRedfinParams((p) => ({ ...p, min_price: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="200,000"
                />
              </div>
              <div className="form-group">
                <label>Maximum price ($)</label>
                <input
                  type="number"
                  value={redfinParams.max_price ?? ''}
                  onChange={(e) => setRedfinParams((p) => ({ ...p, max_price: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="600,000"
                />
              </div>
              <div className="form-group">
                <label>Min bedrooms</label>
                <input
                  type="number"
                  min={0}
                  value={redfinParams.min_beds ?? ''}
                  onChange={(e) => setRedfinParams((p) => ({ ...p, min_beds: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="3"
                />
              </div>
              <div className="form-group">
                <label>Max bedrooms</label>
                <input
                  type="number"
                  min={0}
                  value={redfinParams.max_beds ?? ''}
                  onChange={(e) => setRedfinParams((p) => ({ ...p, max_beds: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="5"
                />
              </div>
              <div className="form-group">
                <label>Min bathrooms</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={redfinParams.min_baths ?? ''}
                  onChange={(e) => setRedfinParams((p) => ({ ...p, min_baths: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="2"
                />
              </div>
              <div className="form-group">
                <label>Max bathrooms</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={redfinParams.max_baths ?? ''}
                  onChange={(e) => setRedfinParams((p) => ({ ...p, max_baths: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="3"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label-main">Property types</label>
              <p className="form-hint">Select one or more. Leave empty for all.</p>
              <div className="form-multiselect" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
                {PROPERTY_TYPE_OPTIONS.map((o) => (
                  <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedPropertyTypes.includes(o.value)}
                      onChange={() => togglePropertyType(o.value)}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <details className="form-group" open={advancedOpen} onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}>
              <summary style={{ cursor: 'pointer', fontWeight: 500 }}>Advanced</summary>
              <div style={{ display: 'grid', gap: '0.5rem 1rem', gridTemplateColumns: '1fr 1fr', marginTop: '0.5rem', maxWidth: 360 }}>
                <div className="form-group">
                  <label>Results per page</label>
                  <input
                    type="number"
                    value={redfinParams.num_homes ?? 350}
                    onChange={(e) => setRedfinParams((p) => ({ ...p, num_homes: e.target.value ? Number(e.target.value) : 350 }))}
                    placeholder="350"
                  />
                </div>
                <div className="form-group">
                  <label>Page number</label>
                  <input
                    type="number"
                    min={1}
                    value={redfinParams.page_number ?? 1}
                    onChange={(e) => setRedfinParams((p) => ({ ...p, page_number: e.target.value ? Number(e.target.value) : 1 }))}
                    placeholder="1"
                  />
                </div>
                <div className="form-group">
                  <label>Status (9 = active)</label>
                  <input
                    type="number"
                    value={redfinParams.status ?? 9}
                    onChange={(e) => setRedfinParams((p) => ({ ...p, status: e.target.value ? Number(e.target.value) : 9 }))}
                    placeholder="9"
                  />
                </div>
                <div className="form-group">
                  <label>API version</label>
                  <input
                    type="number"
                    value={redfinParams.v ?? 8}
                    onChange={(e) => setRedfinParams((p) => ({ ...p, v: e.target.value ? Number(e.target.value) : 8 }))}
                    placeholder="8"
                  />
                </div>
              </div>
            </details>

            <div style={{ marginTop: '0.75rem' }}>
              <button type="button" onClick={addRedfin}>
                Add Redfin source
              </button>
            </div>
          </div>
        )}
      </section>

      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
    </>
  )
}
