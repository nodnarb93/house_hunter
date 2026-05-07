import { test, expect } from '@playwright/test'

test.describe('BIZ-62 Redfin CDN image inference', () => {
  test('extracts property id from /home/<id> URLs via test API', async ({ request }) => {
    const samples = [
      {
        url: 'https://www.redfin.com/OH/Columbus/1380-Stanwix-Ct-43223/home/79708871',
        propertyId: '79708871',
      },
      {
        url: 'https://www.redfin.com/WA/Seattle/506-E-Howell-St-98122/unit-W303/home/46456',
        propertyId: '46456',
      },
      {
        url: 'https://www.redfin.com/OH/Columbus/1190-N-Grant-Ave-43201/unit-A/home/169640058?utm=x',
        propertyId: '169640058',
      },
    ]
    for (const { url, propertyId } of samples) {
      const res = await request.post('/api/test/redfin-property-id', { data: { url } })
      expect(res.ok()).toBeTruthy()
      const body = (await res.json()) as { propertyId: string | null }
      expect(body.propertyId).toBe(propertyId)
    }
  })

  test('builds ssl.cdn-redfin.com bigphoto URL from property id + index', async ({ request }) => {
    const res = await request.post('/api/test/redfin-cdn-bigphoto-url', {
      data: { property_id: '186647', index: 0 },
    })
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as { url: string }
    expect(body.url).toBe('https://ssl.cdn-redfin.com/photo/1/bigphoto/647/186647_0.jpg')
  })
})
