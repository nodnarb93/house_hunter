import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('BIZ-51 Redfin scraper pipeline', () => {
  test.slow();

  const ctx = { scraperId: 0, redfinOk: false };

  test('run endpoint returns fetched listings', async ({ request }) => {
    const create = await request.post('/api/scrapers', {
      data: {
        kind: 'redfin',
        region_id: 4664,
        region_type: 6,
        market: 'columbus',
      },
    });
    expect(create.status()).toBe(201);
    const created = (await create.json()) as { id: number };
    ctx.scraperId = created.id;

    const run = await request.post(`/api/scrapers/${ctx.scraperId}/run`);
    expect(run.status()).toBe(200);
    const body = (await run.json()) as { ok: boolean; fetched: number; inserted: number };
    test.skip(body.fetched === 0, 'Redfin returned no results');
    expect(body.ok).toBe(true);
    expect(body.fetched).toBeGreaterThan(0);
    ctx.redfinOk = true;
  });

  test('second run inserts no duplicate rows', async ({ request }) => {
    test.skip(!ctx.redfinOk, 'Redfin returned no results');
    const run2 = await request.post(`/api/scrapers/${ctx.scraperId}/run`);
    test.skip(
      run2.status() === 502,
      'Redfin returned 502 (transient upstream rate limit) — dedup invariant unverifiable this run'
    );
    expect(run2.status()).toBe(200);
    const body2 = (await run2.json()) as { ok: boolean; fetched: number; inserted: number };
    expect(body2.ok).toBe(true);
    expect(body2.inserted).toBe(0);
  });

  test('listings include structured beds, baths, and price', async ({ request }) => {
    test.skip(!ctx.redfinOk, 'Redfin returned no results');
    const listRes = await request.get('/api/listings?limit=500');
    expect(listRes.status()).toBe(200);
    const data = (await listRes.json()) as {
      listings: Array<{ beds: number | null; baths: number | null; price_cents: number | null }>;
    };
    const rich = data.listings.filter(
      (l) => l.beds != null && l.baths != null && l.price_cents != null
    );
    expect(rich.length).toBeGreaterThan(0);
  });
});
