import { useParams } from 'react-router-dom'

export default function HuntDetail() {
  const { id } = useParams()
  return (
    <div className="max-w-xl">
      <h1 className="mb-2 text-xl font-semibold text-white">House hunt</h1>
      <p className="text-zinc-400">Hunt detail coming soon{id != null ? ` (hunt #${id})` : ''}.</p>
    </div>
  )
}
