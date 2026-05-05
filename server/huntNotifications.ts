import type { AppDatabase } from './db/app-database'
import type { HuntMatchPayload, HuntNotificationListing } from './types'
import { buildHuntFilterWhereClause, type FilterState } from './huntFilters'

interface HuntMetaRow {
  hunt_id: number
  hunt_name: string
}

interface FilterRow {
  hunt_id: number
  min_price: number | null
  max_price: number | null
  min_beds: number | null
  min_baths: number | null
  keywords: string | null
  keywords_exclude: string | null
  location_text: string | null
}

interface NotificationSendRow {
  type: string
  destination: string
}

function rowToFilters(row: FilterRow | null): FilterState {
  if (!row) {
    return {
      min_price: null,
      max_price: null,
      min_beds: null,
      min_baths: null,
      keywords: null,
      keywords_exclude: null,
      location_text: null,
    }
  }
  return {
    min_price: row.min_price,
    max_price: row.max_price,
    min_beds: row.min_beds,
    min_baths: row.min_baths,
    keywords: row.keywords,
    keywords_exclude: row.keywords_exclude,
    location_text: row.location_text,
  }
}

export async function getListingIdsByScrapedAt(
  db: AppDatabase,
  scrapedAt: string,
  presetId: number | null
): Promise<number[]> {
  const sql =
    presetId === null
      ? 'SELECT id FROM listings WHERE scraped_at = ? AND preset_id IS NULL'
      : 'SELECT id FROM listings WHERE scraped_at = ? AND preset_id = ?'
  const stmt = db.prepare(sql).bind(
    ...(presetId === null ? [scrapedAt] : [scrapedAt, presetId])
  )
  const rows = await stmt.all<{ id: number }>()
  return (rows.results ?? []).map((r) => r.id)
}

async function loadFilterState(db: AppDatabase, huntId: number): Promise<FilterState> {
  const row = await db
    .prepare(
      'SELECT hunt_id, min_price, max_price, min_beds, min_baths, keywords, keywords_exclude, location_text FROM house_hunt_filters WHERE hunt_id = ?'
    )
    .bind(huntId)
    .first<FilterRow>()
  return rowToFilters(row)
}

function listingRowToPayload(row: {
  id: number
  title: string
  link: string
  price_cents: number | null
  address: string | null
  beds: number | null
  baths: number | null
  image_url: string | null
  scraped_at: string
}): HuntNotificationListing {
  return {
    id: row.id,
    title: row.title,
    link: row.link,
    price_cents: row.price_cents,
    address: row.address,
    beds: row.beds,
    baths: row.baths,
    image_url: row.image_url,
    scraped_at: row.scraped_at,
  }
}

async function postHuntNotification(destination: string, payload: HuntMatchPayload): Promise<void> {
  if (!destination.startsWith('http')) {
    console.log(`[hunt notification] skipped: destination is not an http(s) URL`)
    return
  }
  try {
    const res = await fetch(destination, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.log(`[hunt notification] POST failed: ${res.status} ${res.statusText}`)
    } else {
      console.log(`[hunt notification] POST ok: ${res.status}`)
    }
  } catch (err) {
    console.error('[hunt notification] POST error:', err)
  }
}

/**
 * After new listings are inserted, evaluate every hunt that has at least one
 * enabled notification; POST webhook/discord payloads when filters match.
 */
export async function notifyHuntsForNewListings(db: AppDatabase, newListingIds: number[]): Promise<void> {
  if (newListingIds.length === 0) return

  const huntRows = await db
    .prepare(
      `SELECT DISTINCT h.id AS hunt_id, h.name AS hunt_name
       FROM house_hunts h
       INNER JOIN house_hunt_notifications n ON n.hunt_id = h.id AND n.enabled = 1`
    )
    .all<HuntMetaRow>()
  const hunts = huntRows.results ?? []

  for (const hunt of hunts) {
    const filters = await loadFilterState(db, hunt.hunt_id)
    const { clause, params: filterParams } = buildHuntFilterWhereClause(filters)
    const placeholders = newListingIds.map(() => '?').join(',')
    const sql = `SELECT id, title, link, price_cents, address, beds, baths, image_url, scraped_at FROM listings WHERE id IN (${placeholders}) AND (${clause})`
    const matchRows = await db
      .prepare(sql)
      .bind(...newListingIds, ...filterParams)
      .all<{
        id: number
        title: string
        link: string
        price_cents: number | null
        address: string | null
        beds: number | null
        baths: number | null
        image_url: string | null
        scraped_at: string
      }>()
    const matches = matchRows.results ?? []
    if (matches.length === 0) continue

    const notifRows = await db
      .prepare(
        'SELECT type, destination FROM house_hunt_notifications WHERE hunt_id = ? AND enabled = 1 ORDER BY id'
      )
      .bind(hunt.hunt_id)
      .all<NotificationSendRow>()
    const notifications = notifRows.results ?? []

    const payload: HuntMatchPayload = {
      hunt_id: hunt.hunt_id,
      hunt_name: hunt.hunt_name,
      matches: matches.map(listingRowToPayload),
    }

    for (const n of notifications) {
      if (n.type === 'email') continue
      if (n.type !== 'webhook' && n.type !== 'discord') continue
      await postHuntNotification(n.destination, payload)
    }
  }
}
