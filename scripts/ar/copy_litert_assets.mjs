import { cp, mkdir, readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "../..")
const source = resolve(root, "node_modules/@litertjs/core/wasm")
const { litertVersion } = JSON.parse(await readFile(resolve(root, "src/data/arRuntimeAssets.json"), "utf8"))
const installed = JSON.parse(await readFile(resolve(root, "node_modules/@litertjs/core/package.json"), "utf8"))
if (installed.version !== litertVersion) throw new Error("Update arRuntimeAssets.json and the versioned LiteRT cache rule when upgrading @litertjs/core.")
const headers = await readFile(resolve(root, "public/_headers"), "utf8")
if (!headers.includes(`/litert/${litertVersion}/*`)) throw new Error("Missing immutable cache rule for the installed LiteRT version.")
const destinations = [
  resolve(root, "public/litert/wasm"), // Preserve URLs used by already-open older clients.
  resolve(root, `public/litert/${litertVersion}/wasm`),
]
const allowed = new Set([
  "litert_wasm_internal.js",
  "litert_wasm_internal.wasm",
  "litert_wasm_compat_internal.js",
  "litert_wasm_compat_internal.wasm",
])

for (const destination of destinations) {
  await mkdir(destination, { recursive: true })
  for (const name of await readdir(source)) {
    if (allowed.has(name)) {
      await cp(resolve(source, name), resolve(destination, name))
    }
  }
}

console.log(`Copied LiteRT.js ${litertVersion} browser runtime assets with legacy URL compatibility.`)
