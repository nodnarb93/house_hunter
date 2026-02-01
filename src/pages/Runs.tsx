import { useEffect, useState } from 'react'
import { getRuns, type RunRow } from '../api'

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

  if (loading) return <p>Loading...</p>
  if (error) return <p className="error">{error}</p>

  return (
    <>
      <h1>Last runs</h1>
      <p>Recent pipeline runs. Expand a row to see the filtered results (titles and links).</p>
      {runs.length === 0 ? (
        <p>No runs yet. Create a filter preset and run it from the Filters page.</p>
      ) : (
        <div className="runs-list">
          {runs.map((r) => {
            const results = parseSummary(r.result_summary)
            const isExpanded = expandedId === r.id
            return (
              <div key={r.id} className="list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <strong>Run #{r.id}</strong> — {r.feed_url.slice(0, 50)}{r.feed_url.length > 50 ? '…' : ''}
                    <br />
                    <small>
                      {new Date(r.started_at).toLocaleString()} · fetched {r.total_fetched}, passed {r.passed_filter_count}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    {isExpanded ? 'Hide' : 'Show'} results
                  </button>
                </div>
                {isExpanded && results.length > 0 && (
                  <ul style={{ marginTop: '0.75rem', paddingLeft: '1.25rem' }}>
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
                  <p style={{ marginTop: '0.5rem', color: '#666' }}>No matching listings in this run.</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
