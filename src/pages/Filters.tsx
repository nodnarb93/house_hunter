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

const btnPrimary = 'rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50'
const btnSecondary = 'rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50'
const inputBase =
  'w-full rounded-md border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/50 focus:outline-none focus:ring-1 focus:ring-blue-400/30'

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
    const arr = value
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    setForm((f) => ({ ...f, config: { ...f.config, [key]: arr } }))
  }

  if (loading) return <p className="text-zinc-400">Loading…</p>

  return (
    <>
      <h1 className="text-xl font-semibold text-white">Filter presets</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-400">
        Create or edit a preset: name, feed URLs (RSS/Atom), optional price range and keywords.
      </p>
      {presets.length > 0 && (
        <div className="mt-6 rounded-md border border-white/10 bg-zinc-900 p-4">
          <strong className="text-white">Existing presets</strong>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-zinc-300">
            {presets.map((p) => (
              <li key={p.id}>
                <button type="button" className={`${btnSecondary} mr-2`} onClick={() => loadPreset(p)}>
                  Edit
                </button>
                <button type="button" className={btnPrimary} onClick={() => run(p.id)} disabled={running}>
                  Run now
                </button>{' '}
                <span className="text-zinc-400">{p.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 max-w-xl space-y-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Preset name</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Downtown 2br"
            className={inputBase}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Feed URLs (one per line or one per box)</label>
          {form.config.feedUrls.map((u, i) => (
            <div key={i} className="mb-2 flex flex-wrap gap-2">
              <input
                value={u}
                onChange={(e) => setFeedUrl(i, e.target.value)}
                placeholder="https://example.com/feed.xml"
                className={`${inputBase} min-w-[200px] flex-1`}
              />
              <button type="button" className={btnSecondary} onClick={() => removeFeedUrl(i)} disabled={form.config.feedUrls.length <= 1}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className={btnSecondary} onClick={addFeedUrl}>
            Add feed URL
          </button>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Min price (optional)</label>
          <input
            type="number"
            value={form.config.minPrice ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                config: { ...f.config, minPrice: e.target.value ? Number(e.target.value) : undefined },
              }))
            }
            placeholder="e.g. 500"
            className={inputBase}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Max price (optional)</label>
          <input
            type="number"
            value={form.config.maxPrice ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                config: { ...f.config, maxPrice: e.target.value ? Number(e.target.value) : undefined },
              }))
            }
            placeholder="e.g. 2000"
            className={inputBase}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Keywords include (comma-separated, optional)</label>
          <input
            value={(form.config.keywordsInclude ?? []).join(', ')}
            onChange={(e) => setKeywords('keywordsInclude', e.target.value)}
            placeholder="e.g. 2br, parking"
            className={inputBase}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Keywords exclude (comma-separated, optional)</label>
          <input
            value={(form.config.keywordsExclude ?? []).join(', ')}
            onChange={(e) => setKeywords('keywordsExclude', e.target.value)}
            placeholder="e.g. studio, basement"
            className={inputBase}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Location keywords (comma-separated, optional)</label>
          <input
            value={(form.config.locationKeywords ?? []).join(', ')}
            onChange={(e) => setKeywords('locationKeywords', e.target.value)}
            placeholder="e.g. downtown, north side"
            className={inputBase}
          />
        </div>
      </div>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {success && <p className="mt-4 text-sm text-green-400">{success}</p>}
      <div className="mt-6 flex flex-wrap gap-2">
        <button className={btnPrimary} onClick={submit}>
          {editing ? 'Update preset' : 'Create preset'}
        </button>
        {editing && (
          <button type="button" className={btnSecondary} onClick={clearForm}>
            Cancel
          </button>
        )}
        <button type="button" className={btnPrimary} onClick={() => run()} disabled={running}>
          Run all presets now
        </button>
      </div>
    </>
  )
}
