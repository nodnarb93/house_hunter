import type { AppDatabase } from './db/d1-shim'

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

export interface Env {
  DB: AppDatabase
}
