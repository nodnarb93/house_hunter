import { defineConfig, devices } from '@playwright/test'
import { execSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.dirname(fileURLToPath(import.meta.url))
const TMP_DB_PATH = path.join(os.tmpdir(), `house_hunter-pw-${process.pid}-${Date.now()}.sqlite`)
process.env.HOUSE_HUNTER_PW_DB_PATH = TMP_DB_PATH

const PW_PORT = process.env.PW_TEST_PORT ?? '3002'

// Playwright probes the URL before running webServer.command, so free the port
// at config load — but ONLY in the parent process. Workers also import this config
// (and would otherwise re-run this block and kill the live webServer).
if (!process.env.TEST_WORKER_INDEX) {
  try {
    execSync('bash scripts/qa-free-port.sh', {
      cwd: repoRoot,
      env: { ...process.env, PORT: PW_PORT },
      stdio: 'pipe',
    })
  } catch {
    /* best-effort */
  }
}

export default defineConfig({
  testDir: './qa',
  workers: 1,
  globalTeardown: './qa/playwright.global-teardown.ts',
  webServer: {
    command: 'bash scripts/qa-prestart.sh',
    url: `http://127.0.0.1:${PW_PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: PW_PORT,
      DISABLE_SCHEDULED_SCRAPES: '1',
      HOUSE_HUNTER_TEST_MODE: '1',
      DATABASE_PATH: TMP_DB_PATH,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        baseURL: `http://127.0.0.1:${PW_PORT}`,
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
