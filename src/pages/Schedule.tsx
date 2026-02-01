import { useEffect, useState } from 'react'
import { getSchedule, putSchedule } from '../api'

const INTERVAL_OPTIONS = [1, 3, 6, 12, 24]

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
      setSuccess('Schedule saved. Cron runs every ' + intervalHours + ' hour(s) (UTC).')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p>Loading...</p>

  return (
    <>
      <h1>Schedule</h1>
      <p>Set how often the pipeline runs. The Worker cron trigger is configured in wrangler.toml (e.g. every 6 hours). This page stores your preferred interval for reference; ensure it matches your cron.</p>
      <div className="form-group">
        <label>Run every (hours)</label>
        <select
          value={intervalHours}
          onChange={(e) => setIntervalHours(Number(e.target.value))}
        >
          {INTERVAL_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {h} {h === 1 ? 'hour' : 'hours'}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={active === 1}
            onChange={(e) => setActive(e.target.checked ? 1 : 0)}
          />
          {' '}Scheduled runs enabled
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      <button onClick={save} disabled={saving}>
        {saving ? 'Saving...' : 'Save schedule'}
      </button>
    </>
  )
}
