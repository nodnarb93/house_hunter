import { useEffect, useState } from 'react'
import { getSettings, putSettings } from '../api'

export default function Settings() {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEnabled, setWebhookEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    getSettings()
      .then((s) => {
        setWebhookUrl(s.webhook_url ?? '')
        setWebhookEnabled(s.webhook_enabled === '1')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      await putSettings(webhookUrl.trim(), webhookEnabled)
      setSuccess('Settings saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p>Loading...</p>

  return (
    <>
      <h1>Settings</h1>
      <p>When the pipeline finds matches, it POSTs a JSON payload to this webhook (e.g. Discord or Slack incoming webhook URL).</p>
      <div className="form-group">
        <label>Webhook URL</label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/... or https://hooks.slack.com/..."
        />
      </div>
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={webhookEnabled}
            onChange={(e) => setWebhookEnabled(e.target.checked)}
          />
          {' '}Send notifications when matches are found
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      <button onClick={save} disabled={saving}>
        {saving ? 'Saving...' : 'Save settings'}
      </button>
    </>
  )
}
