#!/usr/bin/env node
/**
 * Bundles the Worker (fetch + scheduled) to dist/_worker.js for Cloudflare Pages advanced mode.
 */
import * as esbuild from 'esbuild'
import { mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'dist')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

await esbuild.build({
  entryPoints: [join(__dirname, '..', 'worker', 'index.ts')],
  bundle: true,
  format: 'esm',
  target: 'esnext',
  outfile: join(outDir, '_worker.js'),
  external: [],
  minify: true,
  sourcemap: false,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
}).catch(() => process.exit(1))

console.log('Worker built to dist/_worker.js')
