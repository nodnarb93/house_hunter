/**
 * Minimal RSS/Atom parser for Workers (no Node or DOM). Returns entries with title, link, description.
 */
import type { FeedEntry } from '../types'

function extractTag(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
  const out: string[] = []
  let m
  while ((m = re.exec(xml)) !== null) out.push(stripCdata(m[1].trim()))
  return out
}

function stripCdata(s: string): string {
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/
  const m = s.match(cdata)
  return m ? m[1].trim() : s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
}

function getItemOrEntryBlocks(xml: string): string[] {
  const blocks: string[] = []
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi
  const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/gi
  let m
  while ((m = itemRe.exec(xml)) !== null) blocks.push(m[1])
  if (blocks.length === 0) while ((m = entryRe.exec(xml)) !== null) blocks.push(m[1])
  return blocks
}

function parseBlock(block: string): { title: string; link: string; description: string } {
  const title = extractTag(block, 'title')[0] ?? ''
  const link =
    extractTag(block, 'link')[0] ??
    (block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ?? '')
  const desc =
    extractTag(block, 'description')[0] ??
    extractTag(block, 'summary')[0] ??
    extractTag(block, 'content')[0] ??
    ''
  return { title, link, description: desc }
}

export async function fetchAndParse(url: string): Promise<FeedEntry[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HouseHunter/1.0 (RSS feed reader)' },
  })
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status} ${url}`)
  const xml = await res.text()
  const blocks = getItemOrEntryBlocks(xml)
  return blocks.map((b) => ({ ...parseBlock(b), raw: b }))
}
