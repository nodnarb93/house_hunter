import { test, expect } from '@playwright/test';

test('GET /api/scrapers exposes schedule_slots arrays without cross-scraper slot collisions', async ({
  request,
}) => {
  const r = await request.get('/api/scrapers');
  expect(r.status()).toBe(200);
  const scrapers = (await r.json()) as Array<{
    id: number;
    schedule_slots: unknown;
    last_run_at: string | null | undefined;
  }>;

  const slotOwner = new Map<string, number>();

  for (const s of scrapers) {
    expect(Array.isArray(s.schedule_slots), `scraper ${s.id} schedule_slots should be an array`).toBe(true);
    expect(s.last_run_at === null || typeof s.last_run_at === 'string').toBe(true);

    for (const slot of s.schedule_slots as string[]) {
      const prev = slotOwner.get(slot);
      expect(
        prev === undefined || prev === s.id,
        `time slot ${slot} must not be shared across scrapers (owners ${prev} and ${s.id})`
      ).toBe(true);
      if (prev === undefined) slotOwner.set(slot, s.id);
    }
  }
});
