import type { AppDatabase } from './db/app-database'

export async function replaceListingImageUrls(db: AppDatabase, listingId: number, urls: string[]): Promise<void> {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO listing_image_urls (listing_id, url, display_order) VALUES (?, ?, ?)'
  )
  for (let i = 0; i < urls.length; i++) {
    await insert.bind(listingId, urls[i], i).run()
  }
}
