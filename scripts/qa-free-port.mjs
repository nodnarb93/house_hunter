#!/usr/bin/env node
/**
 * Frees TCP PORT (default 3001) by killing listeners. Uses /proc on Linux
 * so QA containers without fuser/lsof still work.
 */
import fs from 'node:fs'
import path from 'node:path'

const port = Number(process.env.PORT ?? '3001')
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`qa-free-port: invalid PORT=${process.env.PORT}`)
  process.exit(1)
}

const hexPort = port.toString(16).padStart(4, '0').toUpperCase()
const suffix = `:${hexPort}`

function readProcNet(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').slice(1)
  } catch {
    return []
  }
}

const inodes = new Set()
for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
  for (const line of readProcNet(file)) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 10) continue
    const local = cols[1]
    if (local.endsWith(suffix)) inodes.add(cols[9])
  }
}

function killListeners() {
  for (const inode of inodes) {
    if (inode === '0') continue
    const needle = `socket:[${inode}]`
    for (const entry of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue
      const fdDir = `/proc/${entry}/fd`
      let fds
      try {
        fds = fs.readdirSync(fdDir)
      } catch {
        continue
      }
      for (const fd of fds) {
        let link
        try {
          link = fs.readlinkSync(path.join(fdDir, fd))
        } catch {
          continue
        }
        if (link === needle) {
          try {
            process.kill(Number(entry), 'SIGKILL')
          } catch {
            /* already gone */
          }
        }
      }
    }
  }
}

killListeners()
// Let the kernel release the socket before Playwright probes the URL.
await new Promise((r) => setTimeout(r, 1000))
