import { useEffect, useState } from 'react'
import { getSettings, putSettings } from '../api'

const btnPrimary =
  'rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50'
const inputBase =
  'w-full rounded-md border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/50 focus:outline-none focus:ring-1 focus:ring-blue-400/30'

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

  if (loading) return <p className="text-zinc-400">Loading…</p>

  return (
    <>
      <h1 className="text-xl font-semibold text-white">Settings</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-400">
        When the pipeline finds matches, it POSTs a JSON payload to this webhook (e.g. Discord or Slack incoming webhook URL).
      </p>
      <div className="mt-6 max-w-xl space-y-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Webhook URL</label>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/... or https://hooks.slack.com/..."
            className={inputBase}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/20 bg-zinc-900 text-blue-500 focus:ring-blue-400/40"
            checked={webhookEnabled}
            onChange={(e) => setWebhookEnabled(e.target.checked)}
          />
          Send notifications when matches are found
        </label>
      </div>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {success && <p className="mt-4 text-sm text-green-400">{success}</p>}
      <button className={`${btnPrimary} mt-6`} onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </>
  )
}
