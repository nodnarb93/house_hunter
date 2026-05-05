/**
 * House hunt listing filter conditions — must stay aligned with
 * GET /api/house-hunts/:id/results (server/api/hunts.ts queryHuntResults).
 */

export type FilterState = {
  min_price: number | null
  max_price: number | null
  min_beds: number | null
  min_baths: number | null
  keywords: string | null
  keywords_exclude: string | null
  location_text: string | null
}

export function splitCommaKeywords(raw: string | null): string[] {
  if (raw == null || raw.trim() === '') return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Returns a SQL boolean expression and bound params for the `listings` table
 * (columns: price_cents, beds, baths, title, address).
 */
export function buildHuntFilterWhereClause(f: FilterState): { clause: string; params: unknown[] } {
  const conditions: string[] = ['1 = 1']
  const params: unknown[] = []

  if (f.min_price != null) {
    conditions.push('(price_cents IS NOT NULL AND price_cents >= ?)')
    params.push(f.min_price * 100)
  }
  if (f.max_price != null) {
    conditions.push('(price_cents IS NOT NULL AND price_cents <= ?)')
    params.push(f.max_price * 100)
  }
  if (f.min_beds != null) {
    conditions.push('(beds IS NOT NULL AND beds >= ?)')
    params.push(f.min_beds)
  }
  if (f.min_baths != null) {
    conditions.push('(baths IS NOT NULL AND baths >= ?)')
    params.push(f.min_baths)
  }

  for (const kw of splitCommaKeywords(f.keywords)) {
    conditions.push('((title LIKE ? COLLATE NOCASE) OR (address LIKE ? COLLATE NOCASE))')
    const p = `%${kw}%`
    params.push(p, p)
  }

  if (f.location_text != null && f.location_text.trim() !== '') {
    conditions.push('(address LIKE ? COLLATE NOCASE)')
    params.push(`%${f.location_text.trim()}%`)
  }

  for (const ex of splitCommaKeywords(f.keywords_exclude)) {
    conditions.push('NOT (((title LIKE ? COLLATE NOCASE) OR (address LIKE ? COLLATE NOCASE)))')
    const p = `%${ex}%`
    params.push(p, p)
  }

  return { clause: conditions.join(' AND '), params }
}
