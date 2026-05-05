import type { AppDatabase } from './db/app-database'

export interface FilterConfig {
  feedUrls: string[]
  minPrice?: number
  maxPrice?: number
  keywordsInclude?: string[]
  keywordsExclude?: string[]
  locationKeywords?: string[]
}

export interface FilterPreset {
  id: number
  name: string
  config: string
  created_at: string
}

export interface ScheduleRow {
  id: number
  interval_hours: number
  active: number
  updated_at: string
}

export interface RunRow {
  id: number
  started_at: string
  finished_at: string
  feed_url: string
  total_fetched: number
  passed_filter_count: number
  result_summary: string | null
  preset_id: number | null
}

export interface FeedEntry {
  title: string
  link: string
  description: string
  raw?: string
}

export interface Listing {
  id: number
  preset_id: number | null
  run_id: number | null
  title: string
  link: string
  price_cents: number | null
  address: string | null
  beds: number | null
  baths: number | null
  image_url: string | null
  scraped_at: string
  seen: number
  bookmarked: number
}

export interface Env {
  DB: AppDatabase
}
