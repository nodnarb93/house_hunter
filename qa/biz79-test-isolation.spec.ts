import os from 'node:os'
import path from 'node:path'
import { test, expect } from '@playwright/test'

test('Playwright server uses a per-run temp DATABASE_PATH, not the prod path', async ({ request }) => {
  const res = await request.get('/api/test/runtime-info')
  expect(res.status()).toBe(200)
  const body = (await res.json()) as { database_path: string; test_mode: boolean }
  expect(body.test_mode).toBe(true)
  expect(body.database_path.startsWith(os.tmpdir())).toBe(true)
  expect(body.database_path).not.toBe(path.resolve(process.cwd(), 'data', 'house_hunter.sqlite'))
})
