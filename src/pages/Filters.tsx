import { useEffect, useState } from 'react'
import type { FilterConfig, FilterPreset } from '../api'
import { getFilters, saveFilter, runNow } from '../api'

const defaultConfig: FilterConfig = {
  feedUrls: [''],
  minPrice: undefined,
  maxPrice: undefined,
  keywordsInclude: [],
  keywordsExclude: [],
  locationKeywords: [],
}

function parseConfig(s: string): FilterConfig {
  try {
    const o = JSON.parse(s) as FilterConfig
    return {
      feedUrls: Array.isArray(o.feedUrls) && o.feedUrls.length ? o.feedUrls : [''],
      minPrice: o.minPrice,
      maxPrice: o.maxPrice,
      keywordsInclude: o.keywordsInclude ?? [],
      keywordsExclude: o.keywordsExclude ?? [],
      locationKeywords: o.locationKeywords ?? [],
    }
  } catch {
    return { ...defaultConfig }
  }
}

export default function Filters() {
  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<FilterPreset | null>(null)
  const [form, setForm] = useState<{ name: string; config: FilterConfig }>({ name: '', config: { ...defaultConfig } })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [running, setRunning] = useState(false)

  useEffect(() => {
    getFilters()
      .then(setPresets)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const loadPreset = (p: FilterPreset) => {
    setEditing(p)
    setForm({ name: p.name, config: parseConfig(p.config) })
  }

  const clearForm = () => {
    setEditing(null)
    setForm({ name: '', config: { ...defaultConfig } })
    setError('')
    setSuccess('')
  }

  const submit = async () => {
    setError('')
    setSuccess('')
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    const feedUrls = form.config.feedUrls.filter((u) => u.trim())
    if (!feedUrls.length) {
      setError('At least one feed URL is required')
      return
    }
    const config: FilterConfig = { ...form.config, feedUrls }
    try {
      await saveFilter({ id: editing?.id, name: form.name.trim(), config })
      setSuccess('Saved.')
      setPresets(await getFilters())
      clearForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  const run = async (presetId?: number) => {
    setRunning(true)
    setError('')
    setSuccess('')
    try {
      await runNow(presetId)
      setSuccess('Run started. Check Last runs for results.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed')
    } finally {
      setRunning(false)
    }
  }

  const addFeedUrl = () => setForm((f) => ({ ...f, config: { ...f.config, feedUrls: [...f.config.feedUrls, ''] } }))
  const setFeedUrl = (i: number, v: string) =>
    setForm((f) => ({
      ...f,
      config: { ...f.config, feedUrls: f.config.feedUrls.map((u, j) => (j === i ? v : u)) },
    }))
  const removeFeedUrl = (i: number) =>
    setForm((f) => ({ ...f, config: { ...f.config, feedUrls: f.config.feedUrls.filter((_, j) => j !== i) } }))

  const setKeywords = (key: keyof FilterConfig, value: string) => {
    const arr = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []
    setForm((f) => ({ ...f, config: { ...f.config, [key]: arr } }))
  }

  if (loading) return <p>Loading...</p>

  return (
    <>
      <h1>Filter presets</h1>
      <p>Create or edit a preset: name, feed URLs (RSS/Atom), optional price range and keywords.</p>
      {presets.length > 0 && (
        <div className="list-item" style={{ marginBottom: '1rem' }}>
          <strong>Existing presets</strong>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
            {presets.map((p) => (
              <li key={p.id}>
                <button type="button" className="secondary" onClick={() => loadPreset(p)} style={{ marginRight: '0.5rem' }}>
                  Edit
                </button>
                <button type="button" onClick={() => run(p.id)} disabled={running}>
                  Run now
                </button>
                {' '}{p.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="form-group">
        <label>Preset name</label>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Downtown 2br" />
      </div>
      <div className="form-group">
        <label>Feed URLs (one per line or one per box)</label>
        {form.config.feedUrls.map((u, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input value={u} onChange={(e) => setFeedUrl(i, e.target.value)} placeholder="https://example.com/feed.xml" style={{ flex: 1 }} />
            <button type="button" className="secondary" onClick={() => removeFeedUrl(i)} disabled={form.config.feedUrls.length <= 1}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="secondary" onClick={addFeedUrl}>
          Add feed URL
        </button>
      </div>
      <div className="form-group">
        <label>Min price (optional)</label>
        <input
          type="number"
          value={form.config.minPrice ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, config: { ...f.config, minPrice: e.target.value ? Number(e.target.value) : undefined } }))}
          placeholder="e.g. 500"
        />
      </div>
      <div className="form-group">
        <label>Max price (optional)</label>
        <input
          type="number"
          value={form.config.maxPrice ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, config: { ...f.config, maxPrice: e.target.value ? Number(e.target.value) : undefined } }))}
          placeholder="e.g. 2000"
        />
      </div>
      <div className="form-group">
        <label>Keywords include (comma-separated, optional)</label>
        <input
          value={(form.config.keywordsInclude ?? []).join(', ')}
          onChange={(e) => setKeywords('keywordsInclude', e.target.value)}
          placeholder="e.g. 2br, parking"
        />
      </div>
      <div className="form-group">
        <label>Keywords exclude (comma-separated, optional)</label>
        <input
          value={(form.config.keywordsExclude ?? []).join(', ')}
          onChange={(e) => setKeywords('keywordsExclude', e.target.value)}
          placeholder="e.g. studio, basement"
        />
      </div>
      <div className="form-group">
        <label>Location keywords (comma-separated, optional)</label>
        <input
          value={(form.config.locationKeywords ?? []).join(', ')}
          onChange={(e) => setKeywords('locationKeywords', e.target.value)}
          placeholder="e.g. downtown, north side"
        />
      </div>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={submit}>{editing ? 'Update preset' : 'Create preset'}</button>
        {editing && (
          <button type="button" className="secondary" onClick={clearForm}>
            Cancel
          </button>
        )}
        <button type="button" onClick={() => run()} disabled={running}>
          Run all presets now
        </button>
      </div>
    </>
  )
}
