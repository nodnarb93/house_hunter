import { test, expect } from '@playwright/test';

test('per-scraper schedule_slots PUT collision and deprecated /api/schedule', async ({ request }) => {
  const create = await request.post('/api/scrapers', {
    data: { kind: 'rss', url: 'https://example.com/feed.xml' },
  });
  expect(create.status()).toBe(201);
  const scraperA = (await create.json()) as { id: number };

  const createB = await request.post('/api/scrapers', {
    data: { kind: 'rss', url: 'https://example.com/other.xml' },
  });
  expect(createB.status()).toBe(201);
  const scraperB = (await createB.json()) as { id: number };

  const putA = await request.put(`/api/scrapers/${scraperA.id}`, {
    data: { schedule_slots: ['10:00'] },
  });
  expect(putA.status()).toBe(200);
  const bodyA = (await putA.json()) as { schedule_slots: string[] };
  expect(bodyA.schedule_slots).toEqual(['10:00']);

  const putConflict = await request.put(`/api/scrapers/${scraperB.id}`, {
    data: { schedule_slots: ['10:00'] },
  });
  expect(putConflict.status()).toBe(409);

  const putB = await request.put(`/api/scrapers/${scraperB.id}`, {
    data: { schedule_slots: ['10:30'] },
  });
  expect(putB.status()).toBe(200);

  const sched = await request.get('/api/schedule');
  expect(sched.status()).toBe(410);

  await request.delete(`/api/scrapers/${scraperA.id}`);
  await request.delete(`/api/scrapers/${scraperB.id}`);
});
