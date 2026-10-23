import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import {
  QR_FALLBACK_DELAY_MS,
  resolveSlotFromLabel,
  routeSlotFromQR,
  shouldCommitQrFallback,
} from "../../src/lib/arScanLogic.js"

const slotsData = JSON.parse(await readFile("src/data/bookVideoSlots.json", "utf8"))
const targetsData = JSON.parse(await readFile("src/data/arTargets.json", "utf8"))
const slots = slotsData.slots
const targets = targetsData.targets
const slot = (id) => slots.find((item) => item.id === id) || null

assert.equal(QR_FALLBACK_DELAY_MS, 800)
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

console.log("Scanner logic QA passed: all PDF pages/covers, 54 QR-to-video routes, popup mapping, and 800 ms fallback timing.")
