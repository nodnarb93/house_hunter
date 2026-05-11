/** Mirrors `server/scrapers/redfinParams.ts` — keep labels/values aligned with backend validation. */

export const REGION_TYPE_OPTIONS = [
  { value: 6, label: 'City' },
  { value: 2, label: 'Zip code' },
] as const

export const REDFIN_STATUS_OPTIONS = [
  { value: 9, label: 'Active' },
  { value: 1, label: 'Active + Pending + Coming Soon' },
] as const

export const REDFIN_PROPERTY_TYPES = [
  { value: 1, label: 'House' },
  { value: 2, label: 'Condo' },
  { value: 3, label: 'Townhouse' },
  { value: 4, label: 'Multi-family' },
  { value: 5, label: 'Manufactured' },
  { value: 6, label: 'Other' },
] as const
