import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, NavLink, Link } from 'react-router-dom'
import type { FilterPreset } from './api'
import { getFilters } from './api'
import Scrapers from './pages/Scrapers'
import Filters from './pages/Filters'
import Schedule from './pages/Schedule'
import Settings from './pages/Settings'
import Runs from './pages/Runs'

function pipelineNavClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'block rounded-md bg-zinc-800 px-3 py-2 text-sm text-white'
    : 'block rounded-md px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
}

export default function App() {
  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [presetsLoading, setPresetsLoading] = useState(true)

  useEffect(() => {
    getFilters()
      .then(setPresets)
      .catch(() => setPresets([]))
      .finally(() => setPresetsLoading(false))
  }, [])

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <aside
        data-testid="sidebar"
        className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-white/10 bg-zinc-900 p-4"
      >
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">House Hunts</div>
        <nav className="flex flex-col gap-1" aria-label="House hunts">
          {presetsLoading ? (
            <span className="text-sm text-zinc-500">Loading…</span>
          ) : presets.length === 0 ? (
            <span className="text-sm text-zinc-500">No hunts yet</span>
          ) : (
            presets.map((p) => (
              <Link
                key={p.id}
                to="/filters"
                className="block rounded-md px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
              >
                {p.name}
              </Link>
            ))
          )}
        </nav>

        <div className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Triage</div>
        <div className="flex flex-col gap-1" aria-label="Triage (coming in a later phase)">
          <span className="cursor-not-allowed rounded-md px-3 py-2 text-sm text-zinc-400 opacity-40">Bookmarks</span>
          <span className="cursor-not-allowed rounded-md px-3 py-2 text-sm text-zinc-400 opacity-40">Contacted</span>
          <span className="cursor-not-allowed rounded-md px-3 py-2 text-sm text-zinc-400 opacity-40">Archive</span>
        </div>

        <div className="mt-auto border-t border-white/10 pt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Pipeline</div>
          <nav className="flex flex-col gap-1" aria-label="Pipeline configuration">
            <NavLink to="/scrapers" className={pipelineNavClass}>
              Scrapers
            </NavLink>
            <NavLink to="/filters" className={pipelineNavClass}>
              Filters
            </NavLink>
            <NavLink to="/schedule" className={pipelineNavClass}>
              Schedule
            </NavLink>
            <NavLink to="/settings" className={pipelineNavClass}>
              Settings
            </NavLink>
            <NavLink to="/runs" className={pipelineNavClass}>
              Last Runs
            </NavLink>
          </nav>
        </div>
      </aside>

      <main className="ml-60 flex min-h-screen flex-1 flex-col p-6">
        <Routes>
          <Route path="/" element={<Navigate to="/scrapers" replace />} />
          <Route path="/scrapers" element={<Scrapers />} />
          <Route path="/filters" element={<Filters />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/runs" element={<Runs />} />
        </Routes>
      </main>
    </div>
  )
}
