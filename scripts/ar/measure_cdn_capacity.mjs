/** Bounded, read-only production smoke load; this is not a maximum-user estimate. */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { performance } from "node:perf_hooks"

const options = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, "").split("=")))
const origin = options.origin || "https://rikokid.me"
const output = options.output || "output/qa/ar-cdn-capacity.json"
const { litertVersion } = JSON.parse(await readFile("src/data/arRuntimeAssets.json", "utf8"))
const wasmPath = options.legacy === "true" ? "/litert/wasm/" : `/litert/${litertVersion}/wasm/`
const coldAssets = [
  "/models/riko-ar-detector.tflite?v=popup-v3",
  `${wasmPath}litert_wasm_internal.wasm`,
  "/ar/book-pages.mind.br",
]
const clips = ["GT01", "GT05", "DV01", "DV05", "HTTN07", "HTTN13"]
const results = []

async function request(path, phase, range) {
  const started = performance.now()
  try {
    const response = await fetch(new URL(path, origin), {
      headers: range ? { Range: "bytes=0-1048575" } : {},
      signal: AbortSignal.timeout(45_000),
    })
    const ttfbMs = performance.now() - started
    let bytes = 0
    for await (const chunk of response.body) bytes += chunk.byteLength
    const result = {
      phase, path, status: response.status, bytes,
      ttfbMs: Math.round(ttfbMs), totalMs: Math.round(performance.now() - started),
      cache: response.headers.get("cf-cache-status"), cacheControl: response.headers.get("cache-control"),
      pass: (range ? response.status === 206 && bytes === 1048576 : response.ok && bytes > 1_000_000),
    }
    results.push(result)
    return result
  } catch (error) {
    const result = { phase, path, pass: false, totalMs: Math.round(performance.now() - started), error: error.message }
    results.push(result)
    return result
  }
}

const started = performance.now()
// Ten independent empty-cache starts: model, inference WASM and book targets.
const sessions = await Promise.all(Array.from({ length: 10 }, async (_, id) => {
  const at = performance.now()
  const assets = await Promise.all(coldAssets.map(path => request(path, "cold-start", false)))
  return { id, pass: assets.every(asset => asset.pass), totalMs: Math.round(performance.now() - at) }
}))
console.log(`Cold sessions: ${sessions.filter(session => session.pass).length}/10 passed.`)
// Fifty simultaneous 1 MiB video-range downloads; all paths are existing assets.
await Promise.all(Array.from({ length: 50 }, (_, i) => request(`/videos/ar/packed/native-v3/${clips[i % clips.length]}.mp4`, "video-range", true)))
const percentile = (values, q) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * q) - 1)] ?? null
const summary = phase => {
  const rows = results.filter(row => row.phase === phase)
  const success = rows.filter(row => row.pass)
  return { requests: rows.length, passed: success.length, failed: rows.length - success.length,
    statusCounts: Object.fromEntries([...new Set(rows.map(row => row.status || "network-error"))].map(status => [status, rows.filter(row => (row.status || "network-error") === status).length])),
    ttfbP50Ms: percentile(success.map(row => row.ttfbMs), .5), ttfbP95Ms: percentile(success.map(row => row.ttfbMs), .95),
    totalP50Ms: percentile(success.map(row => row.totalMs), .5), totalP95Ms: percentile(success.map(row => row.totalMs), .95),
    bytes: success.reduce((sum, row) => sum + row.bytes, 0),
    cacheCounts: Object.fromEntries([...new Set(success.map(row => row.cache || "unknown"))].map(cache => [cache, success.filter(row => (row.cache || "unknown") === cache).length])),
  }
}
const report = { date: new Date().toISOString(), origin,
  byteMetric: "Body bytes after fetch transparently decompresses HTTP content encoding; not wire bandwidth.",
  scope: "One Windows/Vietnam client: ten concurrent cold resource sets, then fifty concurrent 1 MiB video ranges. No camera/model computation is sent to a shared server.",
  limits: "This measures this client's network and CDN responses, not maximum global users, phone FPS, model compilation time, or Appwrite capacity.",
  elapsedMs: Math.round(performance.now() - started), coldStart: summary("cold-start"), videoRanges: summary("video-range"),
  coldSessions: { total: sessions.length, passed: sessions.filter(session => session.pass).length, p50Ms: percentile(sessions.map(session => session.totalMs), .5), p95Ms: percentile(sessions.map(session => session.totalMs), .95) },
  sessions, results,
}
await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify({ output, ...Object.fromEntries(Object.entries(report).filter(([key]) => !["sessions", "results"].includes(key))) }, null, 2))
if (results.some(row => !row.pass)) process.exitCode = 1
