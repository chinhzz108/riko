export const QR_FALLBACK_DELAY_MS = 800

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
