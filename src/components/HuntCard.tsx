import { Link } from 'react-router-dom'
import type { HouseHunt } from '../api'

export interface HuntCardProps {
  hunt: HouseHunt
}

export default function HuntCard({ hunt }: HuntCardProps) {
  return (
    <Link
      to={`/hunts/${hunt.id}`}
      data-testid={`hunt-card-${hunt.id}`}
      className="block rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 hover:bg-zinc-800/80"
    >
      <h2 className="font-medium text-white">{hunt.name}</h2>
      <p className="mt-1 text-sm text-zinc-500">
        {hunt.total_listings} listing{hunt.total_listings === 1 ? '' : 's'}
      </p>
    </Link>
  )
}
