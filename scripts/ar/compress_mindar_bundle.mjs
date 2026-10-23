import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib"
import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const rawPath = path.join(root, "public/ar/book-pages.mind")
const compressedPath = `${rawPath}.br`

if (existsSync(rawPath)) {
  const raw = readFileSync(rawPath)
  const compressed = brotliCompressSync(raw, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 7 },
  })
  writeFileSync(compressedPath, compressed)
  rmSync(rawPath)
}

if (!existsSync(compressedPath) || statSync(compressedPath).size < 128) {
  throw new Error(
    "MindAR target file is missing or too small. Compile the page targets first.",
  )
}

const decoded = brotliDecompressSync(readFileSync(compressedPath))
if (decoded.byteLength < 128)
  throw new Error("MindAR target bundle failed decompression validation.")
console.log(
  `MindAR target bundle: ${decoded.byteLength.toLocaleString()} → ${statSync(compressedPath).size.toLocaleString()} bytes`,
)
