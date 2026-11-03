export const QR_FALLBACK_DELAY_MS = 800
export const VISUAL_SCAN_INTERVAL_MS = 250
export const PAGE_CONFIRMATION_WINDOW_MS = 550
export const INDEPENDENT_POPUP_CONFIDENCE = 0.5

// A cold detector must see the current scene before a page underneath a
// detached popup wins. Keep QR/page fallback available if loading stalls.
export function shouldWaitForPopupDetection({ now, foundAt, lastSampleAt, unavailable }) {
  return !unavailable && lastSampleAt < foundAt && now - foundAt < 4000
}

// A low-score popup must not override a stronger page or a decoded QR.
// A confident physical popup is independent of the page underneath it.
export function videoCandidates(detections, classNames, targets, slots, trustedSlot, options = {}) {
  // A raised or detached popup can be in front of a different printed page
  // (and its QR). Treat a confident popup as an independent visual target.
  const independentPopup = (options.allowIndependentPopup ?? true) && detections.find(item =>
    classNames[item.classId]?.startsWith("popup_") &&
    item.score >= INDEPENDENT_POPUP_CONFIDENCE)
  if (independentPopup) {
    const popupSlot = resolveSlotFromLabel(classNames[independentPopup.classId], trustedSlot?.id, targets, slots)
    if (popupSlot?.arVideoUrl) return [{ detection: independentPopup, slot: popupSlot }]
  }
  const page = detections.find(item => classNames[item.classId]?.startsWith("page_"))
  const visualPage = page && resolveSlotFromLabel(classNames[page.classId], undefined, targets, slots)
  const context = trustedSlot || visualPage
  return detections.map(detection => ({
    detection,
    slot: resolveSlotFromLabel(classNames[detection.classId], context?.id, targets, slots),
  })).filter(({ detection, slot }) => {
    if (!slot?.arVideoUrl) return false
    if (trustedSlot?.arVideoUrl && slot.arVideoUrl !== trustedSlot.arVideoUrl) return false
    return !(visualPage?.arVideoUrl && slot.arVideoUrl !== visualPage.arVideoUrl &&
      classNames[detection.classId]?.startsWith("popup_") && detection.score < page.score)
  })
}

/** Short evidence window: confident targets need two frames; weak ones three.
 * One missed frame is tolerated, but a competing target or a large position
 * jump starts a new sequence. Page/popup labels sharing a video agree.
 */
export function createVisualConsensus(requiredFrames = 3) {
  let history = []
  const key = item => item?.slot?.arVideoUrl || item?.slot?.id
  return {
    observe(candidate, now) {
      history = history.filter(item => now - item.at <= 1100).slice(-3)
      if (!candidate) { history.push({ at: now, candidate: null }); return null }
      const previous = [...history].reverse().find(item => item.candidate)?.candidate
      if (previous && key(previous) !== key(candidate)) history = []
      const a = previous?.detection.box, b = candidate.detection.box
      if (a && b && previous.detection.classId === candidate.detection.classId) {
        const distance = Math.hypot(a.x + a.width/2 - b.x - b.width/2, a.y + a.height/2 - b.y - b.height/2)
        if (distance > Math.max(Math.hypot(a.width,a.height), Math.hypot(b.width,b.height))) history = []
      }
      history.push({ at: now, candidate })
      const matching = history.filter(item => key(item.candidate) === key(candidate))
      const lastTwo = history.slice(-2)
      const strong = lastTwo.length === 2 && lastTwo.every(item =>
        key(item.candidate) === key(candidate) && item.candidate.detection.score >= .65)
      return strong || matching.length >= requiredFrames ? candidate : null
    },
    reset() { history = [] },
  }
}

export function routeSlotFromQR(rawValue, slots, publicOrigin) {
  try {
    const url = new URL(rawValue)
    if (url.hostname !== new URL(publicOrigin).hostname) return null
    const match = url.pathname.match(/^\/watch\/([a-z0-9-]+)\/?$/i)
    if (!match) return null
    const directSlot = slots.find((slot) => slot.id === match[1])
    if (directSlot) return directSlot
    const chapterMatch = match[1].match(/^chapter-([1-3])$/)
    if (!chapterMatch) return null
    return slots.find((slot) => slot.group === `Chương ${chapterMatch[1]}`) || null
  } catch {
    return null
  }
}

export function resolveSlotFromLabel(label, pageContextId, targets, slots) {
  if (!label) return null
  if (label.startsWith("popup_")) {
    const target = targets.find((item) => item.popupLabel === label)
    const targetPages = target?.pages || []
    const pageSlots = targetPages.map((pageId) => slots.find((item) => item.id === pageId))
    const pagesShareVideo =
      pageSlots.length > 1 &&
      pageSlots.every((slot) => slot?.arVideoUrl && slot.arVideoUrl === pageSlots[0]?.arVideoUrl)
    const pageId = targetPages.includes(pageContextId)
      ? pageContextId
      : targetPages.length === 1
        ? targetPages[0]
        : pagesShareVideo
          ? pageSlots[0]?.id
          : null
    return pageId ? slots.find((slot) => slot.id === pageId) || null : null
  }
  if (label.startsWith("page_")) {
    const pageId = label.slice("page_".length).replace(/_/g, "-")
    return slots.find((slot) => slot.id === pageId) || null
  }
  return null
}

export function shouldCommitQrFallback({
  pendingQr,
  qrFoundAt,
  now,
  qrFallbackCommitted,
  stableCount,
  stableFramesRequired,
  stableVisualSlot,
}) {
  const stableVisualMatchesQr =
    stableCount >= stableFramesRequired &&
    stableVisualSlot?.arVideoUrl &&
    stableVisualSlot.arVideoUrl === pendingQr?.arVideoUrl
  return Boolean(
    pendingQr &&
      !qrFallbackCommitted &&
      now - qrFoundAt >= QR_FALLBACK_DELAY_MS &&
      !stableVisualMatchesQr,
  )
}
