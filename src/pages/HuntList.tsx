import { Link } from 'react-router-dom'
import type { HouseHunt } from '../api'

export interface HuntListProps {
  hunts: HouseHunt[]
  loading: boolean
  onNew: () => void
  onEdit: (hunt: HouseHunt) => void
}

export default function HuntList({ hunts, loading, onNew, onEdit }: HuntListProps) {
  return (
    <div data-testid="house-hunts-section">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">House Hunts</div>
        <button
          type="button"
          data-testid="new-hunt-button"
          onClick={onNew}
          className="rounded-md px-2 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          New Hunt
        </button>
      </div>
      <nav className="flex flex-col gap-1" aria-label="House hunts">
        {loading ? (
          <span className="text-sm text-zinc-500">Loading…</span>
        ) : hunts.length === 0 ? (
          <span className="text-sm text-zinc-500">No hunts yet</span>
        ) : (
          hunts.map((h) => (
            <div key={h.id} className="flex items-center gap-1 rounded-md hover:bg-zinc-800/50">
              <Link
                to={`/hunts/${h.id}`}
                data-testid={`hunt-link-${h.id}`}
                className="min-w-0 flex-1 truncate rounded-md px-3 py-2 text-sm text-zinc-400 hover:text-white"
              >
                {h.name}
              </Link>
              <button
                type="button"
                data-testid={`hunt-edit-${h.id}`}
                aria-label={`Edit ${h.name}`}
                onClick={() => onEdit(h)}
                className="shrink-0 rounded-md px-2 py-2 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              >
                Edit
              </button>
            </div>
          ))
        )}
      </nav>
    </div>
  )
}
