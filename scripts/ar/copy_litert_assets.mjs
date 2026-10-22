import { cp, mkdir, readdir, rm } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "../..")
const source = resolve(root, "node_modules/@litertjs/core/wasm")
const destination = resolve(root, "public/litert/wasm")
const allowed = new Set([
  "litert_wasm_internal.js",
  "litert_wasm_internal.wasm",
  "litert_wasm_compat_internal.js",
  "litert_wasm_compat_internal.wasm",
])

await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
for (const name of await readdir(source)) {
  if (allowed.has(name)) {
    await cp(resolve(source, name), resolve(destination, name))
  }
}

console.log("Copied LiteRT.js browser runtime assets.")
