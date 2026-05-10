import { isWafChallengeBody } from './redfinAdapter'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export interface RedfinCdnPhotoFetcherDeps {
  fetchImpl?: typeof fetch
  delayMs?: number
  prefix?: number
}

type ProbeOutcome = 'hit' | 'waf' | 'miss'

async function probeCandidate(url: string, fetchImpl: typeof fetch): Promise<ProbeOutcome> {
  let res = await fetchImpl(url, {
    method: 'HEAD',
    signal: AbortSignal.timeout(5000),
  })

  if (res.status === 405) {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(5000),
    })
  }

  const wafAction = res.headers.get('x-amzn-waf-action')
  if (res.status === 202 && wafAction === 'challenge') {
    return 'waf'
  }

  const ct = (res.headers.get('content-type') ?? '').toLowerCase()
  if ((res.status === 200 || res.status === 206) && ct.startsWith('image/')) {
    return 'hit'
  }

  const shouldReadBody =
    res.status === 202 ||
    ct.startsWith('text/html') ||
    ct.includes('html') ||
    (res.ok && !ct.startsWith('image/'))

  if (shouldReadBody) {
    const body = await res.text().catch(() => '')
    if (isWafChallengeBody(body)) {
      return 'waf'
    }
  }

  return 'miss'
}

/**
 * Resolve a Redfin CDN cover photo URL from an MLS number (CBRMLS prefix 160).
 * Cover only: tries `_0.jpg` then `_1.jpg` with a small delay between probes.
 */
export async function fetchRedfinCdnPhotoUrls(
  mlsNumber: string,
  deps: RedfinCdnPhotoFetcherDeps = {},
): Promise<string[]> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch
  const delayMs = deps.delayMs ?? 150
  const prefix = deps.prefix ?? 160

  const trimmed = mlsNumber.trim()
  if (trimmed.length === 0 || !/^\d+$/.test(trimmed)) {
    return []
  }

  const n = parseInt(trimmed, 10)
  if (!Number.isFinite(n)) {
    return []
  }

  const bucket = String(n % 1000).padStart(3, '0')
  const versions = [0, 1] as const

  for (let i = 0; i < versions.length; i++) {
    if (i > 0) {
      await sleep(delayMs)
    }
    const v = versions[i]
    const url = `https://ssl.cdn-redfin.com/photo/${prefix}/bigphoto/${bucket}/${trimmed}_${v}.jpg`
    const outcome = await probeCandidate(url, fetchImpl)
    if (outcome === 'waf') {
      console.error(`[redfin][cdn] WAF challenge unexpectedly returned for ${url}`)
      continue
    }
    if (outcome === 'hit') {
      return [url]
    }
  }

  return []
}
