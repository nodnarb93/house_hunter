import sharp from 'sharp'

export async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

export async function toWebp(buf: Buffer): Promise<Buffer> {
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
      } catch {
        /* skip corrupt */
      }
    }
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return out
}
