/** A decoded first frame is enough. Hidden videos may not deliver a compositor callback. */
export function waitForDecodedVideoFrame(video, timeoutMs = 8000) {
  if (video.error) return Promise.reject(video.error)
  const ready = () => video.readyState >= 2 && video.videoWidth > 0 && !video.seeking
  if (ready()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const events = ["loadeddata", "canplay", "playing", "seeked"]
    const cleanup = () => {
      clearTimeout(timer)
      for (const event of events) video.removeEventListener(event, check)
      video.removeEventListener("error", fail)
      video.removeEventListener("emptied", cancelled)
    }
    const finish = error => { cleanup(); error ? reject(error) : resolve() }
    const check = () => { if (ready()) finish() }
    const fail = () => finish(video.error || new Error("Video không giải mã được."))
    const cancelled = () => finish(new DOMException("Video source changed.", "AbortError"))
    const timer = setTimeout(() => finish(new Error("Video chưa tải được khung hình đầu tiên.")), timeoutMs)
    for (const event of events) video.addEventListener(event, check)
    video.addEventListener("error", fail)
    video.addEventListener("emptied", cancelled)
    check()
  })
}

/** Bound play() too: a stalled network can leave its promise pending forever. */
export async function playARVideo(video, timeoutMs = 8000) {
  let timer
  try {
    await Promise.race([
      (async () => { await video.play(); await waitForDecodedVideoFrame(video, timeoutMs) })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Video chưa tải được khung hình đầu tiên.")), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Keep candidate preloading and playback on the same element and HTTP request. */
export function setARVideoSource(video, url, origin) {
  const absolute = new URL(url, origin).href
  if (video.src === absolute && !video.error) return
  video.pause()
  video.src = absolute
  video.load()
}

/** The bundled fallback must point to the same release as the manifest. */
export function resolveARVideoAsset(slot, profile, cachedAssets) {
  const id = slot.arTargetId || slot.arVideoUrl?.split("/").pop()?.replace(/\.webm$/, "") || slot.id
  return cachedAssets.find(asset => asset.id === id) || {
    id,
    url: slot.arVideoUrl || "",
    alpha: Boolean(profile?.packedVideoUrl),
    alphaVideoUrl: profile?.alphaVideoUrl,
    packedVideoUrl: profile?.packedVideoUrl,
    compatiblePackedVideoUrl: profile?.compatiblePackedVideoUrl,
    previewVideoUrl: profile?.previewVideoUrl,
  }
}

/** Never use a legacy canonical file as the fallback for a transparent asset. */
export function nativeARSource(asset, profile) {
  if (profile.mode === "scene") {
    const scene = asset.previewVideoUrl || profile.previewVideoUrl
    if (scene) return scene
  }
  if (asset.alpha) {
    const alpha = asset.alphaVideoUrl || profile.alphaVideoUrl
    if (!alpha) throw new Error("Thiếu video nền trong suốt của phiên bản hiện tại.")
    return alpha
  }
  return asset.url
}

export function preferredARSource(asset, profile) {
  if (profile.mode === "scene" && (asset.previewVideoUrl || profile.previewVideoUrl))
    return { kind: "scene", url: asset.previewVideoUrl || profile.previewVideoUrl }
  const packed = asset.packedVideoUrl || profile.packedVideoUrl
  if (packed) return { kind: "packed", url: packed }
  return { kind: "native", url: nativeARSource(asset, profile) }
}

/** Retina phones retain their display resolution without allocating huge desktop buffers. */
export function getARPixelRatio(width, height, devicePixelRatio) {
  return Math.min(Math.max(1, devicePixelRatio || 1), Math.sqrt(4_194_304 / Math.max(1, width * height)))
}
