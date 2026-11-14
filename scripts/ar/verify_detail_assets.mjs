import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"

const json = async path => JSON.parse(await readFile(path, "utf8"))
const certificate = await json("docs/qa/ar-media-detail-v2.json")
const nativeCertificate = await json("docs/qa/ar-native-packed-v3.json")
const effectsCertificate = await json("docs/qa/ar-native-effects-v3.json")
const browserCertificate = await json("docs/qa/ar-packed-browser-v3.json")
const remakes = await json("docs/qa/ar-reviewed-remakes-v4.json")
const remakeSources = await json("docs/qa/ar-reviewed-remakes-source-v4.json")
const chapter3 = await json("docs/qa/ar-chapter3-backgrounds-v1.json")
assert.equal(chapter3.kind, "offline-full-chapter-packed-transparency")
assert.deepEqual(chapter3.assets.map(a => a.id), Array.from({ length: 15 }, (_, i) => `HTTN${String(i+1).padStart(2, "0")}`))
const reviewedIds = ["HTTN01", "HTTN02", "HTTN03", "HTTN04", "HTTN05", "HTTN06", "HTTN07", "HTTN08", "HTTN09", "HTTN10", "HTTN11", "HTTN12", "HTTN13", "HTTN14"]
assert.deepEqual(remakes.assets.map(a => a.id).sort(), reviewedIds)
assert.equal(remakes.kind, "offline-decoded-replacement-QA")
assert.deepEqual(remakeSources.assets.map(a => a.id).sort(), reviewedIds)
assert.equal(remakeSources.kind, "offline-source-and-fallback-decode")
assert.equal(browserCertificate.results.length, 45)
const manifest = await json("public/videos/ar/manifest.json")
const profiles = await json("src/data/arVideoPresentation.json")
const { slots } = await json("src/data/bookVideoSlots.json")
const scanner = await readFile("src/app/ARScan.tsx", "utf8")
assert.ok(scanner.includes("/videos/ar/manifest.json?v=remake-v4"))
assert.ok(scanner.includes('cache: "no-cache"'), "new deployments must revalidate the video manifest")
assert.equal(manifest.length, 45)
assert.equal(certificate.assets.length, manifest.length)
assert.equal(certificate.routes.length, 54)
assert.deepEqual(slots.map(({ id, arVideoUrl }) => ({ id, arVideoUrl })), certificate.routes)
let fileCount = 0
for (const asset of manifest) {
  const proof = certificate.assets.find(item => item.id === asset.id)
  const native = nativeCertificate.assets.find(item => item.id === asset.id)
  const replacement = remakes.assets.find(item => item.id === asset.id)
  const browser = browserCertificate.results.find(item => item.id === asset.id)
  assert.equal(browser?.pass, true, `${asset.id}: actual decode/shader/frame advancement must pass`)
  assert.equal(browser.packedSHA256, native?.sha256 || proof.files.packedVideoUrl.sha256)
  const profile = profiles[asset.id]
  assert.ok(proof, asset.id)
  assert.equal(asset.qualityVersion, replacement ? remakes.version : certificate.qualityVersion)
  assert.equal(asset.url, proof.canonicalUrl, `${asset.id}: keep printed QR routing stable`)
  assert.equal(asset.presentationMode, replacement?.mode || proof.mode)
  assert.equal(profile.mode, replacement?.mode || proof.mode)
  assert.equal(profile.measuredFrames, proof.frames)
  assert.equal(profile.packedVideoUrl, asset.packedVideoUrl)
  assert.equal(profile.previewVideoUrl, asset.previewVideoUrl)
  assert.equal(profile.alphaVideoUrl, asset.alphaVideoUrl, `${asset.id}: offline decode fallback must use the current release`)
  if (asset.id.startsWith("HTTN")) {
    const review = chapter3.assets.find(a => a.id === asset.id)
    assert.ok(["cutout", "glow"].includes(asset.presentationMode), `${asset.id}: no opaque scene bypass`)
    assert.equal(review.mode, profile.mode)
    assert.equal(review.pass, true)
    assert.equal(review.packedVideoUrl, asset.packedVideoUrl)
    assert.equal(review.alphaVideoUrl, asset.alphaVideoUrl)
    assert.equal(review.frames, 240)
    assert.ok(review.framesWithTransparentAreaAboveOnePercent >= 120)
    assert.ok(review.maximumMeanAlpha > .001)
    assert.equal(review.browserTested, false)
    assert.equal(review.phoneTested, false)
    for (const [key, hash] of [["packedVideoUrl", review.packedSHA256], ["alphaVideoUrl", review.alphaSHA256]]) {
      assert.equal(createHash("sha256").update(await readFile(`public${asset[key]}`)).digest("hex"), hash)
    }
  }
  if (!replacement && (proof.mode === "scene" || proof.mode === "mixed")) {
    assert.deepEqual(profile.bounds, { left: 0, top: 0, right: 1, bottom: 1 })
    assert.equal(profile.grounded, false)
  }
  for (const [key, file] of Object.entries(proof.files)) {
    assert.equal(asset[key], replacement ? replacement.files[key].url : key === "packedVideoUrl" && native ? native.url : file.url)
    assert.ok(file.url.includes("/hq2/"), `${asset.id}: avoid stale immutable cache URLs`)
    const path = `public${file.url}`
    const info = await stat(path)
    assert.ok(info.size > 0 && info.size < 25 * 1024 * 1024, `${path}: Pages size limit`)
    const hash = createHash("sha256").update(await readFile(path)).digest("hex")
    assert.equal(hash, file.sha256, `${path}: media changed since frame QA`)
    fileCount++
  }
  if (native) {
    if (!replacement) {
      assert.equal(asset.packedQualityVersion, "native-v3")
      assert.equal(asset.compatiblePackedVideoUrl, proof.files.packedVideoUrl.url)
      assert.equal(profile.compatiblePackedVideoUrl, asset.compatiblePackedVideoUrl)
    }
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
  if (replacement) {
    // Preserve all historical media/browser proofs above. Replacement evidence
    // is separately scoped to actual offline decode, never relabeled browser QA.
    assert.equal(replacement.browserTested, false)
    assert.equal(replacement.phoneTested, false)
    const source = remakeSources.assets.find(item => item.id === asset.id)
    assert.equal(source.browserTested, false)
    assert.equal(source.phoneTested, false)
    assert.equal(source.framesPerStream, replacement.frames)
    assert.equal(source.decodedVideoStreams, asset.id === "HTTN13" ? 6 : 7)
    if (asset.id !== "HTTN13") {
      assert.ok(asset.previewVideoUrl.endsWith(`/${asset.id}-keyed.mp4`), "QR/plain player must not show the key background")
      assert.ok(source.checks.flatPreviewBlackCompositeMAE)
      assert.equal(createHash("sha256").update(await readFile(`public${replacement.sourceReferenceUrl}`)).digest("hex"), replacement.sourceReferenceSHA256)
    }
    for (const check of Object.values(source.checks)) {
      assert.ok(Number.isFinite(check.mean) && check.mean >= 0)
      assert.ok(Number.isFinite(check.worst) && check.worst < .03)
    }
    assert.ok(source.checks.compatibleCompositeMAE)
    assert.ok(source.checks.splitFallbackCompositeMAE)
    const sourceCheck = ["HTTN06", "HTTN07"].includes(asset.id) ? "keyedSourceCompositeMAE" : replacement.mode === "glow" ? "sourceBlackCompositeMAE" : "sourceOpaqueRGBMAE"
    assert.ok(source.checks[sourceCheck])
    if (asset.id === "HTTN08") assert.ok(source.checks.independentPalmInteriorAlphaLossFraction)
    assert.match(source.aacNarrationSHA256, /^[a-f0-9]{64}$/)
    assert.deepEqual(source.aacNarrationMatches, ["previewVideoUrl", "packedVideoUrl", "compatiblePackedVideoUrl", "alphaColorUrl"])
    assert.equal(replacement.canonicalUrl, asset.url)
    assert.deepEqual(profile, replacement.profile)
    assert.equal(asset.packedQualityVersion, remakes.version)
    assert.equal(replacement.frames, 240)
    assert.equal(replacement.checks.frames, replacement.frames)
    assert.ok(replacement.checks.worstAlphaMAE < .02)
    assert.ok(replacement.checks.worstCompositeMAE < .03)
    if (replacement.mode !== "glow") assert.ok(replacement.checks.worstOpaqueLossFraction < .005)
    if (asset.id === "HTTN10") {
      assert.ok(replacement.checks.maxKnownBackgroundAlpha < .04)
      assert.ok(replacement.checks.minKnownBackgroundFraction > 0)
      assert.ok(replacement.checks.knownBackgroundFrames >= 120)
      assert.ok(replacement.checks.worstBottomWaterLossFraction < .005)
    } else assert.ok(replacement.checks.maxOuterBorderAlpha < .04)
    assert.notEqual(asset.packedVideoUrl, asset.compatiblePackedVideoUrl)
    for (const [key, file] of Object.entries(replacement.files)) {
      assert.equal(source.files[key].url, file.url)
      assert.equal(source.files[key].sha256, file.sha256)
      assert.equal(asset[key], file.url)
      assert.ok(file.url.includes(`/${remakes.version}/`))
      const path = `public${file.url}`
      const info = await stat(path)
      assert.equal(info.size, file.bytes)
      assert.ok(info.size > 0 && info.size < 25 * 1024 * 1024)
      assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), file.sha256)
      fileCount++
    }
    const narration = `public${replacement.narrationSourceUrl}`
    assert.equal(createHash("sha256").update(await readFile(narration)).digest("hex"), replacement.narrationSourceSHA256)
  }
}
assert.equal(nativeCertificate.assets.length, 24)
console.log(`AR detail media passed: ${manifest.length} retained baseline proofs, ${fileCount} media hashes, ${remakes.assets.length} offline-decoded remakes, 54 unchanged page routes. New browser/phone QA remains untested.`)
