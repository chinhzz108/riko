import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { access, readFile } from "node:fs/promises"
import {
  QR_FALLBACK_DELAY_MS,
  resolveSlotFromLabel,
  routeSlotFromQR,
  shouldCommitQrFallback,
  videoCandidates,
  VISUAL_SCAN_INTERVAL_MS,
  createVisualConsensus,
  INDEPENDENT_POPUP_CONFIDENCE,
  shouldWaitForPopupDetection,
} from "../../src/lib/arScanLogic.js"
import { getCoverRect } from "../../src/lib/arScanGeometry.js"

const slotsData = JSON.parse(await readFile("src/data/bookVideoSlots.json", "utf8"))
const targetsData = JSON.parse(await readFile("src/data/arTargets.json", "utf8"))
const slots = slotsData.slots
const targets = targetsData.targets
const detectorProof = JSON.parse(await readFile("docs/qa/ar-detector-v3.json", "utf8"))
assert.equal(createHash("sha256").update(await readFile(detectorProof.model)).digest("hex"), detectorProof.sha256, "ship the browser-tested popup model")
assert.deepEqual(detectorProof.classes, [...slots.map(item => item.pageClass), ...targets.map(item => item.popupLabel)], "model class order must match the scanner")
assert.deepEqual(detectorProof.thresholds, targetsData.minimumConfidenceByType)
assert.ok((await readFile("src/lib/arDetectorRuntime.ts", "utf8")).includes(`?v=${detectorProof.version}`), "version the tested model to invalidate old cached weights")
for (const [reportPath, expectedImages, expectedCorrect] of [
  [detectorProof.browser.mobileReport, 328, 269],
  [detectorProof.browser.fullReport, 366, 328],
]) {
  const report = JSON.parse(await readFile(reportPath, "utf8"))
  assert.equal(report.modelVersion, detectorProof.version, "browser QA must use the tested model version")
  assert.equal(report.modelSHA256, detectorProof.sha256, "browser QA must use the shipped model")
  assert.equal(report.results.length, expectedImages, "complete the held-out browser batch")
  assert.equal(report.stats.routes.correct, expectedCorrect)
}
assert.equal(shouldWaitForPopupDetection({now:900,foundAt:100,lastSampleAt:-Infinity,unavailable:false}),true,"a cold detector gets a look before the background QR/page opens")
assert.equal(shouldWaitForPopupDetection({now:900,foundAt:100,lastSampleAt:90,unavailable:false}),true,"a frame captured before the target appeared cannot release fallback")
assert.equal(shouldWaitForPopupDetection({now:900,foundAt:100,lastSampleAt:150,unavailable:false}),false,"normal fallback keeps its speed once the detector sees the scene")
assert.equal(shouldWaitForPopupDetection({now:4100,foundAt:100,lastSampleAt:-Infinity,unavailable:false}),false,"a stalled detector cannot block fallback indefinitely")
assert.equal(shouldWaitForPopupDetection({now:900,foundAt:100,lastSampleAt:-Infinity,unavailable:true}),false,"failed inference immediately releases QR/page fallback")
const slot = (id) => slots.find((item) => item.id === id) || null

assert.equal(QR_FALLBACK_DELAY_MS, 800)
assert.equal(VISUAL_SCAN_INTERVAL_MS, 250)
assert.equal(INDEPENDENT_POPUP_CONFIDENCE, .5)
assert.equal(slots.length, slotsData.sourcePdfPageCountTotal)
for (const document of slotsData.sourceDocuments) {
  const documentSlots = slots.filter((item) => item.document === document.document)
  assert.equal(documentSlots.length, document.pages, `${document.document} should have one QR slot per page`)
  assert.deepEqual(
    documentSlots.map((item) => item.page).sort((a, b) => a - b),
    Array.from({ length: document.pages }, (_, index) => index + 1),
    `${document.document} should map every PDF page exactly once`,
  )
  assert.deepEqual(
    documentSlots.filter((item) => item.cover).map((item) => item.page).sort((a, b) => a - b),
    [...document.coverPages].sort((a, b) => a - b),
    `${document.document} should map both cover pages`,
  )
}

for (const item of slots) {
  assert.ok(item.arVideoUrl?.startsWith("/videos/ar/"), `${item.id} must have a local AR video`)
  await access(new URL(`../../public${item.arVideoUrl}`, import.meta.url))
  const qrSlot = routeSlotFromQR(`${slotsData.publicOrigin}/watch/${item.id}`, slots, slotsData.publicOrigin)
  assert.equal(qrSlot?.id, item.id)
  assert.equal(qrSlot?.arVideoUrl, item.arVideoUrl)
  const pageSlot = resolveSlotFromLabel(item.pageClass, undefined, targets, slots)
  assert.equal(pageSlot?.id, item.id)
  assert.equal(pageSlot?.arVideoUrl, item.arVideoUrl)
}
assert.equal(routeSlotFromQR("https://rikokid.me/watch/chapter-2", slots, slotsData.publicOrigin)?.group, "Chương 2")
assert.equal(routeSlotFromQR("https://example.com/watch/book-c1-p03", slots, slotsData.publicOrigin), null)

for (const target of targets) {
  for (const pageId of target.pages) {
    assert.equal(slot(pageId)?.arTargetId, target.id, `${pageId} should map to ${target.id}`)
    assert.equal(slot(pageId)?.arVideoUrl, target.videoUrl, `${pageId} should use ${target.id}'s video`)
    assert.equal(resolveSlotFromLabel(target.popupLabel, pageId, targets, slots)?.id, pageId)
  }
  if (target.pages.length > 1) {
    const targetSlots = target.pages.map(slot)
    const pagesShareVideo = targetSlots.every(
      (item) => item?.arVideoUrl && item.arVideoUrl === targetSlots[0]?.arVideoUrl,
    )
    assert.equal(
      resolveSlotFromLabel(target.popupLabel, undefined, targets, slots)?.id || null,
      pagesShareVideo ? target.pages[0] : null,
      `shared popup ${target.popupLabel} resolves only when its pages share one video`,
    )
  } else {
    assert.equal(resolveSlotFromLabel(target.popupLabel, undefined, targets, slots)?.id, target.pages[0])
  }
}

assert.equal(resolveSlotFromLabel("popup_HTTN03", undefined, targets, slots)?.id, "book-c3-p07")
assert.equal(resolveSlotFromLabel("popup_HTTN03", "book-c3-p07", targets, slots)?.id, "book-c3-p07")
assert.equal(resolveSlotFromLabel("popup_HTTN03", "book-c3-p08", targets, slots)?.id, "book-c3-p08")
const classNames = [...slots.map(item => item.pageClass), ...targets.map(item => item.popupLabel)]
const detection = (label, score) => ({ classId: classNames.indexOf(label), score })
const conflict = [detection("popup_GT01", .8), detection("page_book_c1_p04", .7)]
assert.equal(videoCandidates(conflict, classNames, targets, slots, slot("book-c1-p04"))[0]?.slot.id, "book-c1-p03", "a confident detached popup wins over the QR on the page underneath")
assert.equal(videoCandidates([detection("popup_GT01", .1)], classNames, targets, slots, slot("book-c1-p04")).length, 0, "conflicting detections cannot steal the QR fallback")
assert.equal(videoCandidates([detection("popup_GT01", .8), detection("page_book_c1_p04", .9)], classNames, targets, slots, slot("book-c1-p04"), {allowIndependentPopup:false})[0]?.slot.id, "book-c1-p04", "explicit QR remains authoritative")
assert.equal(videoCandidates([detection("page_book_c1_p04", .99), detection("popup_GT01", .8)], classNames, targets, slots, slot("book-c1-p04"), {allowIndependentPopup:true})[0]?.slot.id, "book-c1-p03", "a detached popup can be in front of a different tracked page")
assert.equal(videoCandidates([detection("page_book_c1_p04", .99), detection("popup_GT01", .2)], classNames, targets, slots, slot("book-c1-p04"), {allowIndependentPopup:true})[0]?.slot.id, "book-c1-p04", "weak conflicting popups do not override page context")
const consensus = createVisualConsensus(3)
const popupCandidate = { detection: detection("popup_GT01", .82), slot: slot("book-c1-p03") }
assert.equal(consensus.observe(popupCandidate, 0), null)
assert.equal(consensus.observe({...popupCandidate, detection: detection("popup_GT01", .84)}, 250)?.slot.id, "book-c1-p03", "strong popup confirms after two frames")
const weakCandidate={...popupCandidate,detection:detection("popup_GT01",.2)}
consensus.reset()
assert.equal(consensus.observe(weakCandidate, 0), null)
assert.equal(consensus.observe(weakCandidate, 250), null)
assert.equal(consensus.observe(weakCandidate, 500)?.slot.id,"book-c1-p03","weak results still need three observations")
consensus.reset()
assert.equal(consensus.observe(weakCandidate,0),null)
assert.equal(consensus.observe(null,250),null)
assert.equal(consensus.observe(weakCandidate,500),null)
assert.equal(consensus.observe(weakCandidate,750)?.slot.id,"book-c1-p03","one dropout does not reset all evidence")
consensus.reset()
consensus.observe(weakCandidate,0)
consensus.observe(weakCandidate,250)
consensus.observe({detection:detection("popup_GT02",.8),slot:slot("book-c1-p04")},500)
assert.equal(consensus.observe(weakCandidate,750),null,"a competing identity starts fresh")
assert.equal(consensus.observe(weakCandidate,2000),null,"expired evidence cannot confirm a later target")
consensus.reset()
consensus.observe({...popupCandidate,detection:{...popupCandidate.detection,box:{x:0,y:0,width:50,height:50}}},0)
assert.equal(consensus.observe({...popupCandidate,detection:{...popupCandidate.detection,box:{x:600,y:400,width:50,height:50}}},250),null,"a large position jump requires confirmation again")
consensus.reset()
consensus.observe(popupCandidate,0)
assert.equal(consensus.observe({detection:detection("page_book_c1_p03",.9),slot:slot("book-c1-p03")},250)?.slot.id,"book-c1-p03","page and popup evidence can confirm the same clip")
assert.equal(videoCandidates([detection("popup_HTTN03", .8)], classNames, targets, slots, slot("book-c3-p08"))[0]?.slot.id, "book-c3-p08", "shared videos preserve trusted page context")
assert.equal(
  resolveSlotFromLabel("popup_HTTN03", "book-c3-p06", targets, slots)?.id,
  "book-c3-p07",
  "shared popup video still resolves when the page detector has no matching context",
)

const fallbackAt = (patch = {}) => shouldCommitQrFallback({
  pendingQr: slot("book-c1-p03"),
  qrFoundAt: 100,
  now: 900,
  qrFallbackCommitted: false,
  stableCount: 0,
  stableFramesRequired: 3,
  stableVisualSlot: null,
  ...patch,
})

assert.equal(fallbackAt({ now: 899 }), false, "do not commit before 800 ms")
assert.equal(fallbackAt(), true, "commit QR fallback at 800 ms without stable visual recognition")
assert.equal(fallbackAt({ stableCount: 2 }), true, "flickering detections stay below the stability threshold")
assert.equal(
  fallbackAt({ stableCount: 3, stableVisualSlot: slot("book-c1-p03") }),
  false,
  "stable recognition of the same video suppresses QR fallback",
)
assert.equal(
  fallbackAt({ stableCount: 3, stableVisualSlot: slot("book-c1-p04") }),
  true,
  "a stable but mismatched visual result cannot suppress the QR for the scanned video",
)
assert.equal(fallbackAt({ qrFallbackCommitted: true }), false, "commit only once")
assert.equal(fallbackAt({ pendingQr: null }), false, "a QR is required for fallback")

const closeTo = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.01, message)
const portraitCrop = getCoverRect(
  { x: 100, y: 400, width: 200, height: 400 },
  720,
  1280,
  1280,
  720,
)
assert.ok(portraitCrop, "a portrait-camera box intersecting the frame remains visible")
closeTo(portraitCrop.left, 177.7778, "cover crop preserves horizontal box placement")
closeTo(portraitCrop.top, 0, "cover crop clips the hidden top portion")
closeTo(portraitCrop.width, 355.5556, "cover crop preserves visible box width")
closeTo(portraitCrop.height, 644.4444, "cover crop trims height at the frame boundary")
assert.equal(
  getCoverRect({ x: 50, y: 0, width: 150, height: 200 }, 720, 1280, 1280, 720),
  null,
  "a detection entirely hidden by object-cover is not drawn",
)
assert.equal(
  getCoverRect({ x: 0, y: 0, width: 50, height: 50 }, 0, 0, 1280, 720),
  null,
  "overlay geometry waits for camera dimensions",
)

console.log("Scanner QA passed: 54 QR-to-video routes, covers, popup mapping, 800 ms fallback, and object-cover overlay clipping.")
