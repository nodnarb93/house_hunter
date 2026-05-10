import { useCallback, useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
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

function HamburgerIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={props.className}
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function XIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={props.className}
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export default function App() {
  const location = useLocation()
  const sidebarRef = useRef<HTMLElement>(null)

  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const desktop = window.matchMedia('(min-width: 768px)').matches
    if (!desktop) return false
    const stored = localStorage.getItem('sidebar:open')
    if (stored === '1') return true
    if (stored === '0') return false
    return true
  })

  const [hunts, setHunts] = useState<HouseHunt[]>([])
  const [huntsLoading, setHuntsLoading] = useState(true)
  const [huntModal, setHuntModal] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    hunt: HouseHunt | null
  }>({ open: false, mode: 'create', hunt: null })

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!isDesktop) return
    localStorage.setItem('sidebar:open', sidebarOpen ? '1' : '0')
  }, [isDesktop, sidebarOpen])

  useEffect(() => {
    if (!isDesktop) {
      setSidebarOpen(false)
    }
  }, [location.pathname, isDesktop])

  useEffect(() => {
    if (isDesktop || !sidebarOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isDesktop, sidebarOpen])

  useEffect(() => {
    if (isDesktop || !sidebarOpen) return
    const aside = sidebarRef.current
    aside?.querySelector<HTMLElement>('a, button, [tabindex]:not([tabindex="-1"])')?.focus()
  }, [isDesktop, sidebarOpen])

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
    <div className="flex min-h-screen overflow-x-hidden bg-zinc-950">
      <button
        type="button"
        data-testid="sidebar-toggle"
        aria-label="Toggle navigation"
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen((v) => !v)}
        className="fixed left-3 top-3 z-50 inline-flex h-10 w-10 items-center justify-center rounded-md bg-zinc-900/80 text-zinc-200 shadow ring-1 ring-white/10 hover:bg-zinc-800"
      >
        {sidebarOpen ? <XIcon className="h-5 w-5" /> : <HamburgerIcon className="h-5 w-5" />}
      </button>

      {!isDesktop && sidebarOpen ? (
        <div
          data-testid="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/50"
          aria-hidden="true"
        />
      ) : null}

      <aside
        ref={sidebarRef}
        data-testid="sidebar"
        className={`fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-white/10 bg-zinc-900 p-4 transition-transform duration-150 ${sidebarOpen ? '' : '-translate-x-full'}`}
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

      <main
        className={`ml-0 flex min-h-screen min-w-0 flex-1 flex-col py-6 pr-6 transition-[margin] duration-150 ${sidebarOpen ? 'pl-6 md:ml-60' : 'pl-16 md:ml-0'}`}
      >
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
