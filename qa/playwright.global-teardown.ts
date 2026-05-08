import fs from 'node:fs'

export default async function globalTeardown() {
  const base = process.env.HOUSE_HUNTER_PW_DB_PATH
  if (!base) return
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try {
      fs.unlinkSync(base + suffix)
    } catch {
      /* ignore */
    }
  }
}
