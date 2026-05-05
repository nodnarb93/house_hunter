import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './qa',
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3001',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: '3001',
      DISABLE_SCHEDULED_SCRAPES: '1',
      PLAYWRIGHT_TEST: '1',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        baseURL: 'http://localhost:3001',
        ...devices['Desktop Chrome'],
      },
    },
  ],
});