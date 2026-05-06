import type { AppDatabase } from './db/app-database'

export async function replaceListingImages(db: AppDatabase, listingId: number, imageBuffers: Buffer[]): Promise<void> {
  await db.prepare('DELETE FROM listing_images WHERE listing_id = ?').bind(listingId).run()
  const insert = db.prepare(
    'INSERT INTO listing_images (listing_id, image_data, display_order) VALUES (?, ?, ?)'
  )
  for (let i = 0; i < imageBuffers.length; i++) {
    await insert.bind(listingId, imageBuffers[i], i).run()
  }
}
