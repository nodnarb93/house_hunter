import { test, expect } from '@playwright/test';

test('app smoke', async ({ page }) => {
  const errors: string[] = [];
  const allConsole: string[] = [];
  page.on('console', (msg) => {
    const line = `[${msg.type()}] ${msg.text()}`;
    allConsole.push(line);
    if (msg.type() === 'error') errors.push(line);
  });

  await page.goto('/');
  await page.waitForFunction(
    () => (document.querySelector('#root')?.textContent?.trim().length ?? 0) > 0
  );

  const title = (await page.title()).trim();
  expect(title.length, 'page title should be non-empty').toBeGreaterThan(0);
  expect(errors, `console output:\n${allConsole.join('\n')}`).toEqual([]);
});

test('GET /api/filter-presets returns 200 with JSON array', async ({ request }) => {
  const r = await request.get('/api/filter-presets')
  expect(r.status()).toBe(200)
  const body = await r.json()
  expect(Array.isArray(body)).toBe(true)
})

test('GET /api/scraper-sources returns 200 with JSON array', async ({ request }) => {
  const r = await request.get('/api/scraper-sources')
  expect(r.status()).toBe(200)
  const body = await r.json()
  expect(Array.isArray(body)).toBe(true)
})
