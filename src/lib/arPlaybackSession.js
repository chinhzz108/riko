/** One recognition opens one clip. Only the user's close action unlocks scanning. */
export function createARPlaybackSession() {
  let phase = "idle", slotId = null, dismissedId = null, generation = 0
  return {
    snapshot: () => ({ phase, slotId, dismissedId, generation }),
    canScan: () => phase === "scanning",
    start() { phase = "scanning"; slotId = dismissedId = null; generation++ },
    open(id) {
      if (phase !== "scanning" || id === dismissedId) return null
      phase = "playing"; slotId = id
      return ++generation
    },
    isCurrent: (id, ticket) => phase === "playing" && slotId === id && generation === ticket,
    close() {
      if (phase !== "playing") return false
      dismissedId = slotId; slotId = null; phase = "scanning"; generation++
      return true
    },
    lost(id) { if (phase === "scanning" && dismissedId === id) dismissedId = null },
    stop() { phase = "idle"; slotId = dismissedId = null; generation++ },
  }
}

/** Stable screen placement: camera pose changes never resize or move the clip. */
export function getLockedVideoLayout(width, height, aspect, scale, offset) {
  const availableWidth = width * .86
  const availableHeight = Math.max(80, height - 240) * .94
  const baseWidth = Math.min(availableWidth, availableHeight * aspect)
  return {
    width: baseWidth * scale,
    height: baseWidth / aspect * scale,
    x: width * (.5 + offset.x),
    y: height * (.45 + offset.y),
  }
}
