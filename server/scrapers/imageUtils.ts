type Sharp = typeof import('sharp').default

let sharpPromise: Promise<Sharp | null> | null = null
let missingSharpWarned = false

function getSharp(): Promise<Sharp | null> {
  if (!sharpPromise) {
    sharpPromise = import('sharp')
      .then((m) => m.default)
      .catch(() => {
        if (!missingSharpWarned) {
          missingSharpWarned = true
          console.warn(
            '[imageUtils] sharp not available — WebP conversion disabled. Run npm install to enable gallery images.',
          )
        }
        return null
      })
  }
  return sharpPromise
}

export async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      console.warn(
        `[imageUtils] image fetch failed — ${url}: HTTP ${res.status} ${res.statusText || ''}`.trim(),
      )
      return null
    }
    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(`[imageUtils] image fetch failed — ${url}: ${reason}`)
    return null
  }
}

export async function toWebp(buf: Buffer): Promise<Buffer> {
  const sharp = await getSharp()
  if (!sharp) return buf
  const meta = await sharp(buf).metadata()
  if (meta.format === 'webp') return buf
  return sharp(buf).webp({ quality: 80 }).toBuffer()
}

export async function fetchUrlsAsWebpBuffers(urls: string[], max: number, delayMs = 300): Promise<Buffer[]> {
  const out: Buffer[] = []
  for (const url of urls.slice(0, max)) {
    const buf = await fetchImageBuffer(url)
    if (buf) {
      try {
        out.push(await toWebp(buf))
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        console.warn(`[imageUtils] WebP conversion failed — ${url}: ${reason}`)
      }
    }
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return out
}
