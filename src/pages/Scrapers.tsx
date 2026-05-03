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

const defaultRedfinParams: RedfinParams = {
  region_id: 0,
  region_type: 6,
  market: '',
}

type SelectedSourceType = 'rss' | 'redfin' | null

type TestOutput = { ok: boolean; count?: number; message?: string } | null

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
  const [selectedSourceType, setSelectedSourceType] = useState<SelectedSourceType>(null)
  const [redfinParams, setRedfinParams] = useState<RedfinParams>({ ...defaultRedfinParams })
  const [redfinLocationUrl, setRedfinLocationUrl] = useState('')
  const [resolvingLocation, setResolvingLocation] = useState(false)
  const [resolvedLocationLabel, setResolvedLocationLabel] = useState<string | null>(null)
  const [newUrl, setNewUrl] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [testOutput, setTestOutput] = useState<TestOutput>(null)
  const [testingId, setTestingId] = useState<number | null>(null)

  const sortedSources = useMemo(() => sortSourcesRecentFirst(sources), [sources])

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
        region_id: redfinParams.region_id,
        region_type: redfinParams.region_type,
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
      try {
        setSources(await getScrapers())
      } catch {
        /* optimistic update above covers the UI */
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
          Active Scrapers
        </h2>
        {sortedSources.length === 0 ? (
          <p className="scrapers-empty">No scrapers configured yet.</p>
        ) : (
          <ul className="scrapers-active-list">
            {sortedSources.map((s) => {
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
                    <div className="scrapers-row-text">
                      <div className="scrapers-row-title">{rowLabel(s)}</div>
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

      {(testingId !== null || testOutput !== null) && (
        <section className="scrapers-section" aria-label="Test output">
          <h2 className="scrapers-section-title">Test Output</h2>
          <div className="scrapers-terminal">
            {testingId !== null && (
              <span className="scrapers-terminal-line scrapers-terminal-pending">Running test…</span>
            )}
            {testOutput !== null && testingId === null && (
              <span
                className={`scrapers-terminal-line ${testOutput.ok ? 'scrapers-terminal-ok' : 'scrapers-terminal-err'}`}
              >
                {testOutput.ok
                  ? `▶ Test passed — ${testOutput.count ?? 0} listing(s) found`
                  : `✗ Test failed: ${testOutput.message ?? 'Unknown error'}`}
              </span>
            )}
          </div>
        </section>
      )}

      <section className="scrapers-section" aria-labelledby="scrapers-add-heading">
        <h2 id="scrapers-add-heading" className="scrapers-section-title">
          Add New Scraper
        </h2>
        <div className="form-group">
          <label htmlFor="scrapers-type-select">Source type</label>
          <select
            id="scrapers-type-select"
            className="form-select scrapers-type-select"
            value={selectedSourceType ?? ''}
            onChange={(e) => {
              const v = e.target.value
              setSelectedSourceType(v === '' ? null : (v as 'rss' | 'redfin'))
              setError('')
              setSuccess('')
            }}
          >
            <option value="">Select source type…</option>
            <option value="redfin">Redfin</option>
            <option value="rss">RSS / Atom</option>
          </select>
        </div>

        {selectedSourceType === 'rss' && (
          <div className="scrapers-add-panel">
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

        {selectedSourceType === 'redfin' && (
          <div className="scrapers-add-panel">
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
