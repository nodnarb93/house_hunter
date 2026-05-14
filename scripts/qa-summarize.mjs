#!/usr/bin/env node
/**
 * Summarize Playwright JSON reporter output into plain-text scratch files.
 * Always exits 0 so a shell wrapper can preserve Playwright's exit code.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  let exitCode = 0
  let jsonPath = ''
  let outDir = ''
  for (const raw of argv) {
    if (raw.startsWith('--exit-code=')) {
      exitCode = Number.parseInt(raw.slice('--exit-code='.length), 10)
      if (Number.isNaN(exitCode)) exitCode = 1
    } else if (raw.startsWith('--json=')) {
      jsonPath = raw.slice('--json='.length)
    } else if (raw.startsWith('--out=')) {
      outDir = raw.slice('--out='.length)
    }
  }
  return { exitCode, jsonPath, outDir }
}

function shortSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

function readJsonFile(filePath) {
  if (!filePath || !existsSync(filePath)) return { ok: false, data: null }
  try {
    const text = readFileSync(filePath, 'utf8')
    return { ok: true, data: JSON.parse(text) }
  } catch {
    return { ok: false, data: null }
  }
}

function totalReportedTests(stats) {
  if (!stats || typeof stats !== 'object') return 0
  const e = stats.expected ?? 0
  const u = stats.unexpected ?? 0
  const s = stats.skipped ?? 0
  const f = stats.flaky ?? 0
  return e + u + s + f
}

function formatDurationSeconds(stats) {
  const ms = stats?.duration
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '0.0'
  return (ms / 1000).toFixed(1)
}

function stripAnsi(s) {
  return s.replace(/\u001b\[[0-9;]*m/g, '')
}

function errorText(result) {
  const parts = []
  if (result?.error) {
    if (typeof result.error === 'string') parts.push(result.error)
    else if (result.error?.message) parts.push(String(result.error.message))
    else parts.push(String(result.error))
  }
  for (const err of result?.errors ?? []) {
    if (typeof err === 'string') parts.push(err)
    else if (err?.text) parts.push(String(err.text))
    else if (err?.message) parts.push(String(err.message))
    else if (err) parts.push(JSON.stringify(err))
  }
  return stripAnsi(parts.filter(Boolean).join('\n').trim())
}

function isFailedResult(result) {
  if (!result) return false
  const st = result.status
  if (st && st !== 'passed' && st !== 'skipped') return true
  const errs = result.errors
  if (Array.isArray(errs) && errs.length > 0) return true
  return Boolean(result.error)
}

/** @param {unknown[]} suites */
function collectFailures(suites) {
  /** @type {string[]} */
  const blocks = []

  function walk(suiteList, suitePath) {
    if (!Array.isArray(suiteList)) return
    for (const suite of suiteList) {
      const title = typeof suite?.title === 'string' ? suite.title : ''
      const nextPath = title ? [...suitePath, title] : suitePath

      for (const spec of suite.specs ?? []) {
        const file = spec.file ?? 'unknown'
        const line = spec.line ?? 0
        const specTitle = spec.title ?? '(untitled)'
        const testTitle =
          nextPath.length > 0 ? `${nextPath.join(' › ')} › ${specTitle}` : specTitle

        for (const test of spec.tests ?? []) {
          for (const result of test.results ?? []) {
            if (!isFailedResult(result)) continue
            const msg = errorText(result) || '(no message)'
            blocks.push(`${file}:${line} — ${testTitle}\n${msg}\n`)
          }
        }
      }
      walk(suite.suites ?? [], nextPath)
    }
  }

  walk(suites, [])
  return blocks
}

function writeOut(outDir, summary, failures) {
  mkdirSync(outDir, { recursive: true })
  const summaryPath = path.join(outDir, 'summary.txt')
  const failuresPath = path.join(outDir, 'failures.txt')
  const s = summary.endsWith('\n') ? summary : `${summary}\n`
  const f = failures.endsWith('\n') ? failures : `${failures}\n`
  writeFileSync(summaryPath, s, 'utf8')
  writeFileSync(failuresPath, f, 'utf8')
}

const { exitCode, jsonPath, outDir } = parseArgs(process.argv.slice(2))
const sha = shortSha()
const timestamp = new Date().toISOString()

if (!outDir) {
  process.exit(0)
}

const parsed = readJsonFile(jsonPath)
const stats = parsed.ok && parsed.data && typeof parsed.data === 'object' ? parsed.data.stats : null
const suites = parsed.ok && parsed.data && typeof parsed.data === 'object' ? parsed.data.suites : null
const topErrors = parsed.ok && parsed.data && typeof parsed.data === 'object' ? parsed.data.errors : null

const nTotal = totalReportedTests(stats)
const harnessError =
  !parsed.ok ||
  (exitCode !== 0 && nTotal === 0) ||
  (exitCode !== 0 && !Array.isArray(suites))

if (harnessError) {
  const summary = `harness error — see stderr — sha=${sha} at ${timestamp}`
  let failures = 'harness error: no tests executed'
  if (Array.isArray(topErrors) && topErrors.length > 0) {
    failures = topErrors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n')
  }
  writeOut(outDir, summary, failures)
  process.exit(0)
}

const passed = stats.expected ?? 0
const failed = stats.unexpected ?? 0
const skipped = stats.skipped ?? 0
const dur = formatDurationSeconds(stats)

const summary = `${passed} passed, ${failed} failed, ${skipped} skipped (${dur}s) — sha=${sha} at ${timestamp}`

if (exitCode === 0) {
  writeOut(outDir, summary, 'no failures')
  process.exit(0)
}

let failureBlocks = collectFailures(suites ?? [])
if (failureBlocks.length === 0 && Array.isArray(topErrors) && topErrors.length > 0) {
  failureBlocks = topErrors.map((e) => `harness:\n${typeof e === 'string' ? e : JSON.stringify(e)}\n`)
}
const failuresText =
  failureBlocks.length > 0 ? failureBlocks.join('\n') : 'no failure details parsed (see results.json)'

writeOut(outDir, summary, failuresText)
process.exit(0)
