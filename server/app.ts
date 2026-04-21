import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppDatabase } from './db/d1-shim'
import { dispatchApi } from './dispatch-api'
import type { Env } from './types'

const VITE_ORIGIN = 'http://localhost:5173'

export function createApp(db: AppDatabase): Hono {
  const env: Env = { DB: db }
  const app = new Hono()

  app.use('*', cors({ origin: VITE_ORIGIN }))

  app.use('*', async (c, next) => {
    const p = c.req.path
    if (p === '/api' || p.startsWith('/api/')) {
      return dispatchApi(c.req.raw, env)
    }
    await next()
  })

  const distRoot = 'dist'
  app.use(
    '*',
    serveStatic({
      root: distRoot,
      rewriteRequestPath: (pathname) => {
        const trimmed = pathname.replace(/^\/+/, '')
        return trimmed || 'index.html'
      },
    })
  )

  app.get('*', async (c) => {
    if (c.req.path === '/api' || c.req.path.startsWith('/api/')) {
      return c.json({ error: 'Not found' }, 404)
    }
    const indexPath = path.join(process.cwd(), distRoot, 'index.html')
    const html = await readFile(indexPath, 'utf-8')
    return c.html(html)
  })

  return app
}
