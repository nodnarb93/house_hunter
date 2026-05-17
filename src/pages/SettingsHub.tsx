import { Link } from 'react-router-dom'

const rows = [
  {
    key: 'scrapers',
    to: '/scrapers',
    title: 'Scrapers',
    description: 'Configure RSS and Redfin scraper sources',
  },
  {
    key: 'app-settings',
    to: '/settings/app',
    title: 'App Settings',
    description: 'Webhook notifications and pipeline preferences',
  },
  {
    key: 'system-logs',
    to: '/runs',
    title: 'System Logs',
    description: 'View scrape runs and pipeline activity',
  },
] as const

export default function SettingsHub() {
  return (
    <div data-testid="settings-hub">
      <h1 className="mb-6 text-xl font-semibold text-white">Settings</h1>
      <div className="flex flex-col gap-3">
        {rows.map(({ key, to, title, description }) => (
          <Link
            key={key}
            to={to}
            data-testid={`settings-hub-${key}`}
            className="block rounded-lg border border-white/10 bg-zinc-900 px-4 py-4 hover:bg-zinc-800/80"
          >
            <span className="block font-medium text-white">{title}</span>
            <span className="mt-1 block text-sm text-zinc-400">{description}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
