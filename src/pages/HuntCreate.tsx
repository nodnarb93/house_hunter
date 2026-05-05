import { useEffect, useState, type FormEvent } from 'react'
import { createHouseHunt, deleteHouseHunt, updateHouseHunt, type HouseHunt } from '../api'

export interface HuntCreateProps {
  open: boolean
  mode: 'create' | 'edit'
  hunt: HouseHunt | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}

export default function HuntCreate({ open, mode, hunt, onClose, onSaved, onDeleted }: HuntCreateProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setName(mode === 'edit' && hunt ? hunt.name : '')
  }, [open, mode, hunt])

  if (!open) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name is required')
      return
    }
    setBusy(true)
    try {
      if (mode === 'create') {
        await createHouseHunt(trimmed)
      } else if (hunt) {
        await updateHouseHunt(hunt.id, trimmed)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!hunt) return
    if (!window.confirm(`Delete hunt “${hunt.name}”? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteHouseHunt(hunt.id)
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hunt-modal-title"
      data-testid="hunt-form-modal"
    >
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-zinc-900 p-6 shadow-xl">
        <h2 id="hunt-modal-title" className="mb-4 text-lg font-semibold text-white">
          {mode === 'create' ? 'New Hunt' : 'Edit Hunt'}
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="hunt-name-input" className="mb-1 block text-sm text-zinc-400">
              Name
            </label>
            <input
              id="hunt-name-input"
              data-testid="hunt-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
              autoFocus
            />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              data-testid="hunt-save-button"
              disabled={busy}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
            >
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            {mode === 'edit' && hunt ? (
              <button
                type="button"
                data-testid="hunt-delete-button"
                onClick={() => void handleDelete()}
                disabled={busy}
                className="ml-auto rounded-md border border-red-900/50 px-4 py-2 text-sm text-red-400 hover:bg-red-950/40 disabled:opacity-50"
              >
                Delete
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  )
}
