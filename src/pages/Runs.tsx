import { useEffect, useState } from 'react'
import { getRuns, type RunRow } from '../api'

const btnSecondary =
  'rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50'

function parseSummary(summary: string | null): { title?: string; link?: string }[] {
  if (!summary) return []
  try {
    const arr = JSON.parse(summary) as { title?: string; link?: string }[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export default function Runs() {
  const [runs, setRuns] = useState<RunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    getRuns(30)
      .then(setRuns)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-zinc-400">Loading…</p>
  if (error) return <p className="text-sm text-red-400">{error}</p>

  return (
    <>
      <h1 className="text-xl font-semibold text-white">System Logs</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-400">
        Recent pipeline runs. Expand a row to see the filtered results (titles and links).
      </p>
      {runs.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">
          No runs yet. Logs appear after scheduled scrapes complete or when you run{' '}
          <code className="text-zinc-400">npm run scrape</code> manually.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {runs.map((r) => {
            const results = parseSummary(r.result_summary)
            const isExpanded = expandedId === r.id
            return (
              <div key={r.id} className="rounded-md border border-white/10 bg-zinc-900 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 text-sm text-zinc-300">
                    <strong className="text-white">Run #{r.id}</strong> — {r.feed_url.slice(0, 50)}
                    {r.feed_url.length > 50 ? '…' : ''}
                    <br />
                    <span className="text-xs text-zinc-500">
                      {new Date(r.started_at).toLocaleString()} · fetched {r.total_fetched}, passed {r.passed_filter_count}
                    </span>
                  </div>
                  <button type="button" className={btnSecondary} onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                    {isExpanded ? 'Hide' : 'Show'} results
                  </button>
                </div>
                {isExpanded && results.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-300">
                    {results.map((item, i) => (
                      <li key={i}>
                        {item.link ? (
                          <a href={item.link} target="_blank" rel="noopener noreferrer">
                            {item.title || item.link}
                          </a>
                        ) : (
                          item.title ?? '(no title)'
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {isExpanded && results.length === 0 && (
                  <p className="mt-3 text-sm text-zinc-500">No matching listings in this run.</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
