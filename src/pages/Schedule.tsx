import { useEffect, useState } from 'react'
import { getSchedule, putSchedule } from '../api'

const INTERVAL_OPTIONS = [1, 3, 6, 12, 24]

const btnPrimary =
  'rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50'
const inputBase =
  'rounded-md border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-sm text-white focus:border-blue-400/50 focus:outline-none focus:ring-1 focus:ring-blue-400/30'

export default function Schedule() {
  const [intervalHours, setIntervalHours] = useState(6)
  const [active, setActive] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    getSchedule()
      .then((s) => {
        setIntervalHours(s.interval_hours)
        setActive(s.active)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      await putSchedule(intervalHours, active)
      setSuccess(
        'Schedule saved. While the server is running, the pipeline runs every ' +
          intervalHours +
          ' hour(s) when scheduled runs are enabled.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-zinc-400">Loading…</p>

  return (
    <>
      <h1 className="text-xl font-semibold text-white">Schedule</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-400">
        Set how often the pipeline runs while the Node server is up. Use this page to choose the interval in hours and whether
        scheduled runs are enabled.
      </p>
      <div className="mt-6 max-w-md space-y-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Run every (hours)</label>
          <select
            value={intervalHours}
            onChange={(e) => setIntervalHours(Number(e.target.value))}
            className={`${inputBase} w-full cursor-pointer`}
          >
            {INTERVAL_OPTIONS.map((h) => (
              <option key={h} value={h} className="bg-zinc-900">
                {h} {h === 1 ? 'hour' : 'hours'}
              </option>
            ))}
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/20 bg-zinc-900 text-blue-500 focus:ring-blue-400/40"
            checked={active === 1}
            onChange={(e) => setActive(e.target.checked ? 1 : 0)}
          />
          Scheduled runs enabled
        </label>
      </div>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {success && <p className="mt-4 text-sm text-green-400">{success}</p>}
      <button className={`${btnPrimary} mt-6`} onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save schedule'}
      </button>
    </>
  )
}
