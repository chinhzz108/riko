import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"

const json = async path => JSON.parse(await readFile(path, "utf8"))
const certificate = await json("docs/qa/ar-media-detail-v2.json")
const manifest = await json("public/videos/ar/manifest.json")
const profiles = await json("src/data/arVideoPresentation.json")
const { slots } = await json("src/data/bookVideoSlots.json")
assert.equal(manifest.length, 45)
assert.equal(certificate.assets.length, manifest.length)
assert.equal(certificate.routes.length, 54)
assert.deepEqual(slots.map(({ id, arVideoUrl }) => ({ id, arVideoUrl })), certificate.routes)
let fileCount = 0
for (const asset of manifest) {
  const proof = certificate.assets.find(item => item.id === asset.id)
  const profile = profiles[asset.id]
  assert.ok(proof, asset.id)
  assert.equal(asset.qualityVersion, certificate.qualityVersion)
  assert.equal(asset.url, proof.canonicalUrl, `${asset.id}: keep printed QR routing stable`)
  assert.equal(asset.presentationMode, proof.mode)
  assert.equal(profile.mode, proof.mode)
  assert.equal(profile.measuredFrames, proof.frames)
  assert.equal(profile.packedVideoUrl, asset.packedVideoUrl)
  assert.equal(profile.previewVideoUrl, asset.previewVideoUrl)
  if (proof.mode === "scene" || proof.mode === "mixed") {
    assert.deepEqual(profile.bounds, { left: 0, top: 0, right: 1, bottom: 1 })
    assert.equal(profile.grounded, false)
  }
  for (const [key, file] of Object.entries(proof.files)) {
    assert.equal(asset[key], file.url)
    assert.ok(file.url.includes("/hq2/"), `${asset.id}: avoid stale immutable cache URLs`)
    const path = `public${file.url}`
    const info = await stat(path)
    assert.ok(info.size > 0 && info.size < 25 * 1024 * 1024, `${path}: Pages size limit`)
    const hash = createHash("sha256").update(await readFile(path)).digest("hex")
    assert.equal(hash, file.sha256, `${path}: media changed since frame QA`)
    fileCount++
  }
  assert.ok(proof.packedCheck.matteSSIM >= .97)
  assert.equal(proof.browserCheck.pass, true)
  if (proof.sourceCheck) {
    assert.equal(proof.sourceCheck.checkVersion, 2)
    assert.equal(proof.sourceCheck.pass, true)
    assert.equal(proof.sourceCheck.frames, proof.frames)
    assert.equal(proof.sourceCheck.unexpectedSceneTransparentPixels, 0)
  }
}
console.log(`AR detail media passed: ${manifest.length} verified clips, ${fileCount} media hashes, 54 unchanged page routes.`)
