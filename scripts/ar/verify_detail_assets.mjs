import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"

const json = async path => JSON.parse(await readFile(path, "utf8"))
const certificate = await json("docs/qa/ar-media-detail-v2.json")
const nativeCertificate = await json("docs/qa/ar-native-packed-v3.json")
const effectsCertificate = await json("docs/qa/ar-native-effects-v3.json")
const browserCertificate = await json("docs/qa/ar-packed-browser-v3.json")
assert.equal(browserCertificate.results.length, 45)
const manifest = await json("public/videos/ar/manifest.json")
const profiles = await json("src/data/arVideoPresentation.json")
const { slots } = await json("src/data/bookVideoSlots.json")
const scanner = await readFile("src/app/ARScan.tsx", "utf8")
assert.ok(scanner.includes("/videos/ar/manifest.json?v=native-v3"))
assert.ok(scanner.includes('cache: "no-cache"'), "new deployments must revalidate the video manifest")
assert.equal(manifest.length, 45)
assert.equal(certificate.assets.length, manifest.length)
assert.equal(certificate.routes.length, 54)
assert.deepEqual(slots.map(({ id, arVideoUrl }) => ({ id, arVideoUrl })), certificate.routes)
let fileCount = 0
for (const asset of manifest) {
  const proof = certificate.assets.find(item => item.id === asset.id)
  const native = nativeCertificate.assets.find(item => item.id === asset.id)
  const browser = browserCertificate.results.find(item => item.id === asset.id)
  assert.equal(browser?.pass, true, `${asset.id}: actual decode/shader/frame advancement must pass`)
  assert.equal(browser.packedSHA256, native?.sha256 || proof.files.packedVideoUrl.sha256)
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
    assert.equal(asset[key], key === "packedVideoUrl" && native ? native.url : file.url)
    assert.ok(file.url.includes("/hq2/"), `${asset.id}: avoid stale immutable cache URLs`)
    const path = `public${file.url}`
    const info = await stat(path)
    assert.ok(info.size > 0 && info.size < 25 * 1024 * 1024, `${path}: Pages size limit`)
    const hash = createHash("sha256").update(await readFile(path)).digest("hex")
    assert.equal(hash, file.sha256, `${path}: media changed since frame QA`)
    fileCount++
  }
  if (native) {
    assert.equal(asset.packedQualityVersion, "native-v3")
    assert.equal(asset.compatiblePackedVideoUrl, proof.files.packedVideoUrl.url)
    assert.equal(profile.compatiblePackedVideoUrl, asset.compatiblePackedVideoUrl)
    assert.ok(native.url.startsWith("/videos/ar/packed/native-v3/"))
    const path = `public${native.url}`
    const info = await stat(path)
    assert.equal(info.size, native.bytes)
    assert.ok(info.size < 25 * 1024 * 1024)
    assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), native.sha256)
    assert.equal(native.sourceSHA256, proof.files.previewVideoUrl.sha256)
    assert.equal(native.matteSHA256, proof.files.alphaVideoUrl.sha256)
    assert.equal(native.frames, proof.frames)
    assert.ok(native.matteSSIM >= .97)
    if (asset.id.startsWith("GT") || asset.id.startsWith("DV")) assert.ok(native.sourceColorSSIM >= .98)
    else {
      assert.ok(native.sourceReconstructionMAE < .03)
      const decoded = effectsCertificate.assets.find(item => item.id === asset.id)
      assert.equal(decoded?.sha256, native.sha256, `${asset.id}: decode the delivered effect before certifying it`)
      assert.equal(decoded.sourceSHA256, native.sourceSHA256)
      assert.equal(decoded.frames, native.frames)
      assert.ok(decoded.sourceReconstructionMAE < .03 && decoded.worstFrameMAE < .05)
    }
    assert.ok(native.dimensions[0] >= proof.dimensions[0] && native.dimensions[1] >= proof.dimensions[1])
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
assert.equal(nativeCertificate.assets.length, 24)
console.log(`AR detail media passed: ${manifest.length} verified clips, ${fileCount} media hashes, 24 native RGB upgrades, 54 unchanged page routes.`)
