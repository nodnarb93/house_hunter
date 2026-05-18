import { useCallback, useEffect, useState } from 'react'
import { getActivitySummary, type ActivitySummary } from '../api'

export function useActivitySummary() {
  const [data, setData] = useState<ActivitySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  const fetchSummary = useCallback(async () => {
    try {
      const summary = await getActivitySummary()
      setData(summary)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSummary()
    const onFocus = () => void fetchSummary()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchSummary])

  return { data, loading, error }
}
