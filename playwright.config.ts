import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './qa',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
