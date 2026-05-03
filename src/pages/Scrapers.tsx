import { useEffect, useState } from 'react'
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

function statusColor(s: ScraperSource): string {
  if (s.last_tested_at == null || s.last_tested_at === '') return '#fa0'
  if (s.last_test_ok === 1) return '#2a2'
  return '#c00'
}

export default function Scrapers() {
  const [sources, setSources] = useState<ScraperSource[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSourceType, setSelectedSourceType] = useState<'redfin' | 'rss' | null>(null)
  const [redfinParams, setRedfinParams] = useState<RedfinParams>({ ...defaultRedfinParams })
  const [redfinLocationUrl, setRedfinLocationUrl] = useState('')
  const [resolvingLocation, setResolvingLocation] = useState(false)
  const [resolvedLocationLabel, setResolvedLocationLabel] = useState<string | null>(null)
  const [newUrl, setNewUrl] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [testingId, setTestingId] = useState<number | null>(null)

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
    setTestingId(source.id)
    try {
      await testScraperById(source.id)
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

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Active Scrapers</h2>
        {sources.length === 0 && <p>No scrapers configured yet.</p>}
        {sources.map((s) => (
          <div key={s.id} className="list-item" style={{ marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: statusColor(s),
                  marginRight: 2,
                  flexShrink: 0,
                }}
                title={
                  s.last_tested_at == null || s.last_tested_at === ''
                    ? 'Never tested'
                    : s.last_test_ok === 1
                      ? 'Last test passed'
                      : 'Last test failed'
                }
              />
              <span style={{ flex: '1 1 160px', wordBreak: 'break-word' }}>{s.url || `Source ${s.id}`}</span>
              <span style={{ fontSize: '0.85rem', color: '#555', flex: '1 1 200px' }}>
                {s.last_tested_at ? `Last tested: ${s.last_tested_at}` : 'Never tested'}
              </span>
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
          </div>
        ))}
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Add New Scraper</h2>
        <div className="form-group">
          <label htmlFor="scraper-source-type">Source type</label>
          <select
            id="scraper-source-type"
            value={selectedSourceType ?? ''}
            onChange={(e) => {
              const v = e.target.value
              setSelectedSourceType(v === '' ? null : (v as 'redfin' | 'rss'))
            }}
            style={{ maxWidth: 280 }}
          >
            <option value="">Select source type…</option>
            <option value="redfin">Redfin</option>
            <option value="rss">RSS / Atom</option>
          </select>
        </div>

        {selectedSourceType === 'redfin' && (
          <>
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
          </>
        )}

        {selectedSourceType === 'rss' && (
          <div className="form-group">
            <label htmlFor="scrapers-rss-url">Feed URL</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                id="scrapers-rss-url"
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
                style={{ flex: 1, minWidth: '200px' }}
              />
              <button type="button" onClick={addRss}>
                Add
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
