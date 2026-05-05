import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import type { HouseHunt } from './api'
import { getHouseHunts } from './api'
import Scrapers from './pages/Scrapers'
import Settings from './pages/Settings'
import Runs from './pages/Runs'
import Results from './pages/Results'
import Triage from './pages/Triage'
import HuntList from './pages/HuntList'
import HuntCreate from './pages/HuntCreate'
import HuntDetail from './pages/HuntDetail'

function pipelineNavClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'block rounded-md bg-zinc-800 px-3 py-2 text-sm text-white'
    : 'block rounded-md px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
}

export default function App() {
  const [hunts, setHunts] = useState<HouseHunt[]>([])
  const [huntsLoading, setHuntsLoading] = useState(true)
  const [huntModal, setHuntModal] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    hunt: HouseHunt | null
  }>({ open: false, mode: 'create', hunt: null })

  const loadHunts = useCallback(() => {
    return getHouseHunts()
      .then(setHunts)
      .catch(() => setHunts([]))
  }, [])

  useEffect(() => {
    setHuntsLoading(true)
    loadHunts().finally(() => setHuntsLoading(false))
  }, [loadHunts])

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <aside
        data-testid="sidebar"
        className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-white/10 bg-zinc-900 p-4"
      >
        <HuntList
          hunts={hunts}
          loading={huntsLoading}
          onNew={() => setHuntModal({ open: true, mode: 'create', hunt: null })}
          onEdit={(hunt) => setHuntModal({ open: true, mode: 'edit', hunt })}
        />

        <div className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Triage</div>
        <nav className="flex flex-col gap-1" aria-label="Triage">
          <NavLink
            to="/triage"
            className={({ isActive }) =>
              isActive
                ? 'block rounded-md bg-zinc-800 px-3 py-2 text-sm text-white'
                : 'block rounded-md px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
            }
          >
            Triage Board
          </NavLink>
        </nav>

        <div className="mt-auto border-t border-white/10 pt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Pipeline</div>
          <nav className="flex flex-col gap-1" aria-label="Pipeline configuration">
            <NavLink to="/scrapers" className={pipelineNavClass}>
              Scrapers
            </NavLink>
            <NavLink to="/settings" className={pipelineNavClass}>
              Settings
            </NavLink>
            <NavLink to="/runs" className={pipelineNavClass}>
              System Logs
            </NavLink>
          </nav>
        </div>
      </aside>

      <HuntCreate
        open={huntModal.open}
        mode={huntModal.mode}
        hunt={huntModal.hunt}
        onClose={() => setHuntModal((m) => ({ ...m, open: false }))}
        onSaved={() => void loadHunts()}
        onDeleted={() => void loadHunts()}
      />

      <main className="ml-60 flex min-h-screen min-w-0 flex-1 flex-col p-6">
        <Routes>
          <Route path="/" element={<Navigate to="/scrapers" replace />} />
          <Route path="/scrapers" element={<Scrapers />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/runs" element={<Runs />} />
          <Route path="/results" element={<Results />} />
          <Route path="/triage" element={<Triage />} />
          <Route path="/hunts/:id" element={<HuntDetail />} />
        </Routes>
      </main>
    </div>
  )
}
