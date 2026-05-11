import { useMemo, useState } from 'react'
import type { RedfinParams } from '../api'
import { REDFIN_PROPERTY_TYPES, REDFIN_STATUS_OPTIONS, REGION_TYPE_OPTIONS } from '../redfinConstants'

const btnCompact = 'rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50'
const inputBase =
  'w-full rounded-md border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/50 focus:outline-none focus:ring-1 focus:ring-blue-400/30'

function uiptToSelected(uipt: string | undefined): Set<number> {
  const s = new Set<number>()
  if (!uipt?.trim()) return s
  for (const p of uipt.split(',')) {
    const n = parseInt(p.trim(), 10)
    if (!Number.isNaN(n) && n >= 1 && n <= 6) s.add(n)
  }
  return s
}

function selectedToUipt(sel: Set<number>): string | undefined {
  if (sel.size === 0) return undefined
  return [...sel].sort((a, b) => a - b).join(',')
}

function numStr(v: number | undefined): string {
  if (v === undefined || v === null || Number.isNaN(Number(v))) return ''
  return String(v)
}

type ValidationErrors = {
  price?: string
  beds?: string
  baths?: string
  form?: string
}

function hasClientValidationErrors(e: ValidationErrors): boolean {
  return !!(e.price || e.beds || e.baths || e.form)
}

export type RedfinScraperFormProps = {
  mode: 'create' | 'edit'
  initial: RedfinParams
  busy: boolean
  onSubmit: (params: RedfinParams) => Promise<void>
  onCancel?: () => void
  location?: {
    url: string
    onUrlChange: (v: string) => void
    onResolve: () => void | Promise<void>
    resolving: boolean
    resolvedLabel: string | null
  }
}

export function RedfinScraperForm({ mode, initial, busy, onSubmit, onCancel, location }: RedfinScraperFormProps) {
  const [status, setStatus] = useState(() => String(initial.status ?? 9))
  const [numHomes, setNumHomes] = useState(() => String(initial.num_homes ?? 350))
  const [pageNumber, setPageNumber] = useState(() => String(initial.page_number ?? 1))
  const [minPrice, setMinPrice] = useState(() => numStr(initial.min_price))
  const [maxPrice, setMaxPrice] = useState(() => numStr(initial.max_price))
  const [minBeds, setMinBeds] = useState(() => numStr(initial.min_beds))
  const [maxBeds, setMaxBeds] = useState(() => numStr(initial.max_beds))
  const [minBaths, setMinBaths] = useState(() => numStr(initial.min_baths))
  const [maxBaths, setMaxBaths] = useState(() => numStr(initial.max_baths))
  const [uiptSel, setUiptSel] = useState(() => uiptToSelected(initial.uipt))
  const [regionType, setRegionType] = useState(() => String(initial.region_type ?? 6))
  const [market, setMarket] = useState(() => initial.market ?? '')
  const [priceError, setPriceError] = useState('')
  const [bedsError, setBedsError] = useState('')
  const [bathsError, setBathsError] = useState('')
  const [formError, setFormError] = useState('')
  const [serverError, setServerError] = useState('')

  const readOnlyRegion = mode === 'edit'

  const toggleUipt = (code: number) => {
    setUiptSel((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const parsedNums = useMemo(() => {
    const nh = parseInt(numHomes, 10)
    const pn = parseInt(pageNumber, 10)
    const minP = minPrice.trim() === '' ? undefined : parseInt(minPrice, 10)
    const maxP = maxPrice.trim() === '' ? undefined : parseInt(maxPrice, 10)
    const minBd = minBeds.trim() === '' ? undefined : parseInt(minBeds, 10)
    const maxBd = maxBeds.trim() === '' ? undefined : parseInt(maxBeds, 10)
    const minBt = minBaths.trim() === '' ? undefined : parseFloat(minBaths)
    const maxBt = maxBaths.trim() === '' ? undefined : parseFloat(maxBaths)
    return { nh, pn, minP, maxP, minBd, maxBd, minBt, maxBt }
  }, [numHomes, pageNumber, minPrice, maxPrice, minBeds, maxBeds, minBaths, maxBaths])

  const validateClient = (): ValidationErrors => {
    const e: ValidationErrors = {}
    const { nh, pn, minP, maxP, minBd, maxBd, minBt, maxBt } = parsedNums
    if (Number.isNaN(nh) || nh < 1 || nh > 350) {
      e.form = 'num_homes must be between 1 and 350'
      return e
    }
    if (Number.isNaN(pn) || pn < 1 || pn > 10) {
      e.form = 'page_number must be between 1 and 10'
      return e
    }
    if (minP !== undefined && maxP !== undefined && !Number.isNaN(minP) && !Number.isNaN(maxP) && minP > maxP) {
      e.price = 'min_price is greater than max_price'
    }
    if (minBd !== undefined && maxBd !== undefined && !Number.isNaN(minBd) && !Number.isNaN(maxBd) && minBd > maxBd) {
      e.beds = 'min_beds is greater than max_beds'
    }
    if (minBt !== undefined && maxBt !== undefined && !Number.isNaN(minBt) && !Number.isNaN(maxBt) && minBt > maxBt) {
      e.baths = 'min_baths is greater than max_baths'
    }
    return e
  }

  const buildParams = (): RedfinParams | null => {
    const vErr = validateClient()
    if (hasClientValidationErrors(vErr)) return null
    const { nh, pn, minP, maxP, minBd, maxBd, minBt, maxBt } = parsedNums
    const st = parseInt(status, 10)
    const rt = parseInt(regionType, 10)
    const mkt = (readOnlyRegion ? initial.market : market).trim().toLowerCase().replace(/\s+/g, '-')
    const params: RedfinParams = {
      region_id: initial.region_id,
      region_type: readOnlyRegion ? initial.region_type : rt,
      market: mkt,
      num_homes: nh,
      page_number: pn,
      status: Number.isNaN(st) ? 9 : st,
      v: initial.v ?? 8,
    }
    if (minP !== undefined && !Number.isNaN(minP)) params.min_price = minP
    if (maxP !== undefined && !Number.isNaN(maxP)) params.max_price = maxP
    if (minBd !== undefined && !Number.isNaN(minBd)) params.min_beds = minBd
    if (maxBd !== undefined && !Number.isNaN(maxBd)) params.max_beds = maxBd
    if (minBt !== undefined && !Number.isNaN(minBt)) params.min_baths = minBt
    if (maxBt !== undefined && !Number.isNaN(maxBt)) params.max_baths = maxBt
    const uipt = selectedToUipt(uiptSel)
    if (uipt) params.uipt = uipt
    return params
  }

  const submit = async () => {
    setPriceError('')
    setBedsError('')
    setBathsError('')
    setFormError('')
    setServerError('')
    const vErr = validateClient()
    setPriceError(vErr.price ?? '')
    setBedsError(vErr.beds ?? '')
    setBathsError(vErr.baths ?? '')
    setFormError(vErr.form ?? '')
    if (hasClientValidationErrors(vErr)) return
    const params = buildParams()
    if (!params) return
    if (!params.market) {
      setFormError('Resolve a Redfin location URL first, or enter a market name.')
      return
    }
    if (!params.region_id || Number.isNaN(Number(params.region_id))) {
      setFormError('Resolve a Redfin location URL to set region (region ID is resolved from the URL).')
      return
    }
    try {
      await onSubmit(params)
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Request failed')
    }
  }

  return (
    <div className="max-w-xl space-y-4" data-testid="redfin-form">
      {mode === 'create' && location && (
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-300">Location (region is resolved from URL)</label>
          <p className="mb-2 text-sm text-zinc-500">
            Open Redfin, search for a city or zip, then paste the URL here. We’ll resolve region ID, type, and market for you.
          </p>
          <div className="flex flex-wrap items-start gap-2">
            <input
              type="url"
              data-testid="redfin-location-url"
              value={location.url}
              onChange={(e) => location.onUrlChange(e.target.value)}
              placeholder="https://www.redfin.com/city/4664/OH/Columbus"
              className={`${inputBase} min-w-[280px] flex-1`}
            />
            <button
              type="button"
              data-testid="redfin-resolve-btn"
              className={btnCompact}
              onClick={() => void location.onResolve()}
              disabled={location.resolving || busy}
            >
              {location.resolving ? 'Resolving…' : 'Resolve'}
            </button>
          </div>
          {location.resolvedLabel && (
            <p className="mt-2 text-sm text-green-400">
              Resolved: <strong className="font-medium text-green-300">{location.resolvedLabel}</strong> — region ID is set
              automatically.
            </p>
          )}
        </div>
      )}

      {readOnlyRegion && (
        <div className="rounded-md border border-white/10 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-300">
          <div>
            <span className="text-zinc-500">Market: </span>
            <span data-testid="redfin-readonly-market">{initial.market}</span>
          </div>
          <div className="mt-1">
            <span className="text-zinc-500">Region: </span>
            <span data-testid="redfin-readonly-region">
              id {initial.region_id}, type {initial.region_type}
            </span>
          </div>
        </div>
      )}

      {mode === 'create' && !readOnlyRegion && (
        <>
          <div>
            <label htmlFor="redfin-region-type" className="mb-1 block text-sm text-zinc-400">
              Region type
            </label>
            <select
              id="redfin-region-type"
              data-testid="redfin-region-type"
              value={regionType}
              onChange={(e) => setRegionType(e.target.value)}
              className={`${inputBase} max-w-[200px] cursor-pointer`}
            >
              {REGION_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-zinc-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="redfin-market" className="mb-1 block text-sm text-zinc-400">
              Market (slug)
            </label>
            <p className="mb-1 text-sm text-zinc-500">e.g. columbus, sfbay, dc — often filled from Resolve.</p>
            <input
              id="redfin-market"
              data-testid="redfin-market"
              type="text"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              placeholder="columbus"
              className={`${inputBase} max-w-[240px]`}
            />
          </div>
        </>
      )}

      <div>
        <label htmlFor="redfin-status" className="mb-1 block text-sm text-zinc-400">
          Status
        </label>
        <select
          id="redfin-status"
          data-testid="redfin-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={`${inputBase} max-w-[360px] cursor-pointer`}
        >
          {REDFIN_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-zinc-900">
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid max-w-lg grid-cols-2 gap-3">
        <div>
          <label htmlFor="redfin-num-homes" className="mb-1 block text-sm text-zinc-400">
            num_homes (1–350)
          </label>
          <input
            id="redfin-num-homes"
            data-testid="redfin-num-homes"
            type="number"
            min={1}
            max={350}
            value={numHomes}
            onChange={(e) => setNumHomes(e.target.value)}
            className={inputBase}
          />
        </div>
        <div>
          <label htmlFor="redfin-page-number" className="mb-1 block text-sm text-zinc-400">
            page_number (1–10)
          </label>
          <input
            id="redfin-page-number"
            data-testid="redfin-page-number"
            type="number"
            min={1}
            max={10}
            value={pageNumber}
            onChange={(e) => setPageNumber(e.target.value)}
            className={inputBase}
          />
        </div>
      </div>

      {/* num_homes/page_number (and other form-wide client messages) render here so the message stays near those inputs; users who have scrolled toward Add still hit the error before the button in DOM order. Server 4xx uses this slot too since the message may apply to any field. */}
      {(formError || serverError) && (
        <p className="text-sm text-red-400" data-testid="redfin-form-error" role="alert">
          {formError || serverError}
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm text-zinc-400">Price ($)</legend>
        <div className="grid max-w-lg grid-cols-2 gap-3">
          <div>
            <label htmlFor="redfin-min-price" className="mb-1 block text-xs text-zinc-500">
              Min price
            </label>
            <input
              id="redfin-min-price"
              data-testid="redfin-min-price"
              type="number"
              min={0}
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className={inputBase}
            />
          </div>
          <div>
            <label htmlFor="redfin-max-price" className="mb-1 block text-xs text-zinc-500">
              Max price
            </label>
            <input
              id="redfin-max-price"
              data-testid="redfin-max-price"
              type="number"
              min={0}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className={inputBase}
            />
          </div>
        </div>
      </fieldset>
      {priceError && (
        <p className="text-sm text-red-400" data-testid="redfin-price-error" role="alert">
          {priceError}
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm text-zinc-400">Beds</legend>
        <div className="grid max-w-lg grid-cols-2 gap-3">
          <div>
            <label htmlFor="redfin-min-beds" className="mb-1 block text-xs text-zinc-500">
              Min beds
            </label>
            <input
              id="redfin-min-beds"
              data-testid="redfin-min-beds"
              type="number"
              min={0}
              step={1}
              value={minBeds}
              onChange={(e) => setMinBeds(e.target.value)}
              className={inputBase}
            />
          </div>
          <div>
            <label htmlFor="redfin-max-beds" className="mb-1 block text-xs text-zinc-500">
              Max beds
            </label>
            <input
              id="redfin-max-beds"
              data-testid="redfin-max-beds"
              type="number"
              min={0}
              step={1}
              value={maxBeds}
              onChange={(e) => setMaxBeds(e.target.value)}
              className={inputBase}
            />
          </div>
        </div>
      </fieldset>
      {bedsError && (
        <p className="text-sm text-red-400" data-testid="redfin-beds-error" role="alert">
          {bedsError}
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm text-zinc-400">Baths</legend>
        <div className="grid max-w-lg grid-cols-2 gap-3">
          <div>
            <label htmlFor="redfin-min-baths" className="mb-1 block text-xs text-zinc-500">
              Min baths
            </label>
            <input
              id="redfin-min-baths"
              data-testid="redfin-min-baths"
              type="number"
              min={0}
              step={0.5}
              value={minBaths}
              onChange={(e) => setMinBaths(e.target.value)}
              className={inputBase}
            />
          </div>
          <div>
            <label htmlFor="redfin-max-baths" className="mb-1 block text-xs text-zinc-500">
              Max baths
            </label>
            <input
              id="redfin-max-baths"
              data-testid="redfin-max-baths"
              type="number"
              min={0}
              step={0.5}
              value={maxBaths}
              onChange={(e) => setMaxBaths(e.target.value)}
              className={inputBase}
            />
          </div>
        </div>
      </fieldset>
      {bathsError && (
        <p className="text-sm text-red-400" data-testid="redfin-baths-error" role="alert">
          {bathsError}
        </p>
      )}

      <fieldset>
        <legend className="mb-2 text-sm text-zinc-400">Property type (uipt)</legend>
        <div className="flex flex-wrap gap-3">
          {REDFIN_PROPERTY_TYPES.map((pt) => (
            <label key={pt.value} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                data-testid={`redfin-uipt-${pt.value}`}
                checked={uiptSel.has(pt.value)}
                onChange={() => toggleUipt(pt.value)}
              />
              {pt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {(formError || serverError) && (
        <p className="text-sm text-red-400" data-testid="redfin-form-error" role="alert">
          {formError || serverError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnCompact} data-testid="redfin-form-submit" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Saving…' : mode === 'create' ? 'Add' : 'Save'}
        </button>
        {mode === 'edit' && onCancel && (
          <button type="button" className={btnCompact} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
