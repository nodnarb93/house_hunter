import cron from 'node-cron'
import type { AppDatabase } from './db/app-database'
import { runAllPresets } from './pipeline'

/**
 * Runs the scraper pipeline on an interval derived from the `schedule` table
 * (same options as the Schedule UI). Uses node-cron with a once-per-minute
 * tick so interval and active flag changes apply without restarting the server.
 */
export function startScheduledScrapes(db: AppDatabase): void {
  let lastRunAt = Date.now()
  let running = false

  const tick = async () => {
    if (running) return
    try {
      const row = await db
        .prepare('SELECT interval_hours, active FROM schedule WHERE id = 1')
        .first<{ interval_hours: number; active: number }>()
      const intervalHours = row?.interval_hours ?? 6
      const active = row?.active ?? 1
      if (!active) return

      const intervalMs = intervalHours * 60 * 60 * 1000
      if (Date.now() - lastRunAt < intervalMs) return

      running = true
      await runAllPresets(db)
      lastRunAt = Date.now()
    } catch (err) {
      console.error('Scheduled scrape failed:', err)
    } finally {
      running = false
    }
  }

  cron.schedule('* * * * *', () => {
    void tick()
  })
  console.log('Scheduled scrapes enabled (node-cron; respects schedule table).')
}
