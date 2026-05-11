import { test, expect } from '@playwright/test'
import { parseRedfinUrl } from '../server/scrapers/redfinAdapter'
import {
  configJsonToStructured,
  paramsToConfigJson,
  parseStructuredParamsBody,
  validateRedfinParams,
} from '../server/scrapers/redfinParams'

test.describe('BIZ-107 Redfin params unit', () => {
  test('parseStructuredParamsBody accepts a full v1 body', () => {
    const body = {
      kind: 'redfin',
      region_id: 4664,
      region_type: 6,
      market: 'Columbus',
      status: 9,
      num_homes: 100,
      page_number: 2,
      min_price: 200_000,
      max_price: 600_000,
      min_beds: 3,
      max_beds: 5,
      min_baths: 2,
      max_baths: 4,
      uipt: '1,2,3',
      v: 8,
    }
    const r = parseStructuredParamsBody(body)
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.params).toMatchObject({
      region_id: 4664,
      region_type: 6,
      market: 'columbus',
      status: 9,
      num_homes: 100,
      page_number: 2,
      min_price: 200_000,
      max_price: 600_000,
      min_beds: 3,
      max_beds: 5,
      min_baths: 2,
      max_baths: 4,
      uipt: '1,2,3',
      v: 8,
    })
  })

  test('validateRedfinParams rejects invalid combinations and enums', () => {
    const base = {
      region_id: 1,
      region_type: 6,
      market: 'x',
      num_homes: 50,
      page_number: 1,
      status: 9,
      v: 8,
    }
    expect(validateRedfinParams({ ...base, min_price: 500, max_price: 100 })).toMatch(/min_price.*max_price/i)
    expect(validateRedfinParams({ ...base, min_beds: 4, max_beds: 2 })).toMatch(/min_beds.*greater.*max_beds/i)
    expect(validateRedfinParams({ ...base, min_baths: 3, max_baths: 1 })).toMatch(/min_baths.*greater.*max_baths/i)
    expect(validateRedfinParams({ ...base, num_homes: 0 })).toBeTruthy()
    expect(validateRedfinParams({ ...base, num_homes: 400 })).toBeTruthy()
    expect(validateRedfinParams({ ...base, page_number: 0 })).toBeTruthy()
    expect(validateRedfinParams({ ...base, page_number: 11 })).toBeTruthy()
    expect(validateRedfinParams({ ...base, status: 42 })).toBeTruthy()
    expect(validateRedfinParams({ ...base, uipt: '7' })).toBeTruthy()
    expect(validateRedfinParams({ ...base, uipt: '1,a' })).toBeTruthy()
  })

  test('validateRedfinParams returns null for a clean v1 set', () => {
    expect(
      validateRedfinParams({
        region_id: 4664,
        region_type: 6,
        market: 'columbus',
        num_homes: 100,
        page_number: 1,
        status: 1,
        min_price: 100_000,
        max_price: 900_000,
        min_beds: 2,
        max_beds: 4,
        min_baths: 1,
        max_baths: 3,
        uipt: '1,2,3',
        v: 8,
      }),
    ).toBeNull()
  })

  test('parseRedfinUrl reads status, uipt, and min_price from query', () => {
    const u = 'https://www.redfin.com/city/4664/OH/Columbus?status=1&uipt=1,2,3&min_price=200000'
    const p = parseRedfinUrl(u)
    expect(p).not.toBeNull()
    expect(p?.status).toBe(1)
    expect(p?.uipt).toBe('1,2,3')
    expect(p?.min_price).toBe(200_000)
  })

  test('paramsToConfigJson round-trips with configJsonToStructured', () => {
    const params = {
      region_id: 4664,
      region_type: 6,
      market: 'columbus',
      num_homes: 120,
      page_number: 2,
      status: 9,
      min_price: 200_000,
      max_price: 500_000,
      min_beds: 2,
      max_beds: 5,
      min_baths: 1,
      max_baths: 3,
      uipt: '2,4',
      v: 8,
    }
    const raw = paramsToConfigJson(params)
    const structured = configJsonToStructured(raw)
    expect(structured).toEqual({
      region_id: 4664,
      region_type: 6,
      market: 'columbus',
      min_price: 200_000,
      max_price: 500_000,
      min_beds: 2,
      max_beds: 5,
      min_baths: 1,
      max_baths: 3,
      uipt: '2,4',
      num_homes: 120,
      page_number: 2,
      status: 9,
      v: 8,
    })
  })
})
