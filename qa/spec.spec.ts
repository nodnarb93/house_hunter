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

test('GET /api/scraper-sources returns 200 with JSON array', async ({ request }) => {
  const r = await request.get('/api/scraper-sources')
  expect(r.status()).toBe(200)
  const body = await r.json()
  expect(Array.isArray(body)).toBe(true)
})

test('POST /api/scraper-sources/test persists last_tested_at to DB', async ({ request }) => {
  const add = await request.post('/api/scraper-sources', {
    data: { url: 'http://test-invalid-feed.example.invalid/feed.xml' },
  })
  expect(add.status()).toBe(201)
  const source = await add.json() as { id: number }

  const testRes = await request.post('/api/scraper-sources/test', { data: { id: source.id } })
  expect([200, 502]).toContain(testRes.status())

  const list = await request.get('/api/scraper-sources')
  expect(list.status()).toBe(200)
  const sources = await list.json() as Array<{ id: number; last_tested_at: string | null }>
  const tested = sources.find((s) => s.id === source.id)
  expect(tested, 'tested source should be in the list').toBeTruthy()
  expect(tested!.last_tested_at, 'last_tested_at should be set after test').not.toBeNull()

  const del = await request.delete(`/api/scraper-sources/${source.id}`)
  expect(del.status()).toBe(200)
})
