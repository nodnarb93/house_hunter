import { useCallback, useEffect, useMemo, useState } from 'react'
import type { HouseHunt } from '../api'
import { getHouseHunts } from '../api'
import HuntCard from '../components/HuntCard'
import HuntCreate from './HuntCreate'

type SortMode = 'recent' | 'alpha'

export default function HuntsOverview() {
  const [hunts, setHunts] = useState<HouseHunt[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
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
    setLoading(true)
    loadHunts().finally(() => setLoading(false))
  }, [loadHunts])

  const displayedHunts = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? hunts.filter(
          (h) =>
            h.name.toLowerCase().includes(q) ||
            (h.location_text ?? '').toLowerCase().includes(q),
        )
      : hunts
    const sorted = [...filtered]
    if (sortMode === 'alpha') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else {
      sorted.sort((a, b) => {
        const aT = a.last_scraped_at ?? ''
        const bT = b.last_scraped_at ?? ''
        if (aT && !bT) return -1
        if (!aT && bT) return 1
        if (aT && bT && aT !== bT) return aT < bT ? 1 : -1
        return a.name.localeCompare(b.name)
      })
    }
    return sorted
  }, [hunts, search, sortMode])

  return (
    <div data-testid="hunts-overview">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-white">House Hunts</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            data-testid="hunts-overview-sort"
            className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
          >
            <option value="recent">Recent activity</option>
            <option value="alpha">Alphabetical</option>
          </select>
          <button
            type="button"
            data-testid="hunts-overview-new-button"
            onClick={() => setHuntModal({ open: true, mode: 'create', hunt: null })}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
          >
            + New hunt
          </button>
        </div>
      </div>

      <input
        type="search"
        placeholder="Search hunts"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        data-testid="hunts-overview-search"
        className="mb-6 w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
      />

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : hunts.length === 0 ? (
        <div data-testid="hunts-overview-empty" className="rounded-lg border border-white/10 bg-zinc-900 p-6 text-center">
          <p className="text-zinc-300">No hunts yet — create one</p>
          <button
            type="button"
            onClick={() => setHuntModal({ open: true, mode: 'create', hunt: null })}
            className="mt-4 rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
          >
            Create hunt
          </button>
        </div>
      ) : displayedHunts.length === 0 ? (
        <div
          data-testid="hunts-overview-no-matches"
          className="rounded-lg border border-white/10 bg-zinc-900 p-6 text-center"
        >
          <p className="text-zinc-300">No hunts match your search</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {displayedHunts.map((hunt) => (
            <li key={hunt.id}>
              <HuntCard hunt={hunt} />
            </li>
          ))}
        </ul>
      )}

      <HuntCreate
        open={huntModal.open}
        mode={huntModal.mode}
        hunt={huntModal.hunt}
        onClose={() => setHuntModal((m) => ({ ...m, open: false }))}
        onSaved={() => void loadHunts()}
        onDeleted={() => void loadHunts()}
      />
    </div>
  )
}
