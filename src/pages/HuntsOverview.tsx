import { useCallback, useEffect, useState } from 'react'
import type { HouseHunt } from '../api'
import { getHouseHunts } from '../api'
import HuntCard from '../components/HuntCard'
import HuntCreate from './HuntCreate'

export default function HuntsOverview() {
  const [hunts, setHunts] = useState<HouseHunt[]>([])
  const [loading, setLoading] = useState(true)
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

  return (
    <div data-testid="hunts-overview">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-white">House Hunts</h1>
        <button
          type="button"
          data-testid="hunts-overview-new-button"
          onClick={() => setHuntModal({ open: true, mode: 'create', hunt: null })}
          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          + New hunt
        </button>
      </div>

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
      ) : (
        <ul className="flex flex-col gap-3">
          {hunts.map((hunt) => (
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
