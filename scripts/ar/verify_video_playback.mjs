import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { getARPixelRatio, nativeARSource, playARVideo, preferredARSource, resolveARVideoAsset, setARVideoSource, waitForDecodedVideoFrame } from "../../src/lib/arVideoPlayback.js"

class Video extends EventTarget {
  readyState = 0; videoWidth = 0; seeking = false; error = null; src = ""; loads = 0
  pause() {}
  load() { this.loads++ }
  requestVideoFrameCallback() { throw new Error("Hidden video must not wait for compositor callbacks") }
}
const video = new Video()
setARVideoSource(video, "/clip.mp4", "https://rikokid.me")
setARVideoSource(video, "/clip.mp4", "https://rikokid.me")
assert.equal(video.loads, 1, "recognition must reuse the preloaded request")
video.readyState = 2; video.videoWidth = 2560
await waitForDecodedVideoFrame(video, 50)
video.readyState = 0; video.videoWidth = 0
const waiting = waitForDecodedVideoFrame(video, 100)
video.readyState = 2; video.videoWidth = 2560; video.dispatchEvent(new Event("loadeddata"))
await waiting
video.readyState = 0
const cancelled = waitForDecodedVideoFrame(video, 100)
video.dispatchEvent(new Event("emptied"))
await assert.rejects(cancelled, { name: "AbortError" })
await assert.rejects(waitForDecodedVideoFrame(video, 5), /khung hình đầu tiên/)
video.play = () => new Promise(() => {})
await assert.rejects(playARVideo(video, 5), /khung hình đầu tiên/, "a pending play() must allow a compatible-source retry")
assert.equal(preferredARSource({ alpha: true, url: "/old.webm", packedVideoUrl: "/packed.mp4" }, { mode: "cutout" }).url, "/packed.mp4")
assert.equal(preferredARSource({ alpha: true, previewVideoUrl: "/original.mp4" }, { mode: "scene", packedVideoUrl: "/packed.mp4" }).kind, "scene")
const repairedAsset = { alpha: true, presentationMode: "cutout", previewVideoUrl: "/flat.mp4", packedVideoUrl: "/new-packed.mp4", alphaVideoUrl: "/new-alpha.webm" }
assert.equal(preferredARSource(repairedAsset, { mode: "scene" }).kind, "packed", "revalidated transparent catalog must override an old scene profile")
assert.equal(nativeARSource(repairedAsset, { mode: "scene" }), "/new-alpha.webm", "a stale scene profile must not bypass the repaired alpha fallback")
assert.equal(getARPixelRatio(390, 844, 3), 3, "a Retina phone must not be limited to 1.5x")
assert.ok(3840 * 2160 * getARPixelRatio(3840, 2160, 2) ** 2 <= 4_194_305)
const manifest = JSON.parse(await readFile("public/videos/ar/manifest.json", "utf8"))
const profiles = JSON.parse(await readFile("src/data/arVideoPresentation.json", "utf8"))
const { slots } = JSON.parse(await readFile("src/data/bookVideoSlots.json", "utf8"))
for (const slot of slots.filter(item => item.arVideoUrl)) {
  const id = slot.arTargetId || slot.arVideoUrl.split("/").pop().replace(/\.webm$/, "")
  const current = manifest.find(item => item.id === id)
  const fallback = resolveARVideoAsset(slot, profiles[id], [])
  assert.equal(nativeARSource(fallback, profiles[id]), nativeARSource(current, profiles[id]),
    `${slot.id}: a pending/failed manifest and failed packed decode must not select an old clip`)
  assert.deepEqual(preferredARSource(fallback, profiles[id]), preferredARSource(current, profiles[id]))
}
assert.throws(() => nativeARSource({ url: "/videos/ar/HTTN12.webm", alpha: true }, { mode: "cutout" }),
  /phiên bản hiện tại/, "missing current alpha must fail instead of silently showing legacy media")
for (const id of ["HTTN01", "HTTN02", "HTTN03", "HTTN04", "HTTN05", "HTTN06", "HTTN07", "HTTN08", "HTTN09", "HTTN10", "HTTN11", "HTTN12", "HTTN13", "HTTN14"]) {
  const slot = slots.find(item => item.arTargetId === id)
  const profile = profiles[id]
  const fallback = resolveARVideoAsset(slot, profile, [])
  assert.equal(nativeARSource(fallback, profile), `/videos/ar/remake-v4/${id}.webm`)
  const newer = { ...fallback, packedVideoUrl: "/videos/ar/packed/future/clip.mp4", alphaVideoUrl: "/videos/ar/future/clip.webm" }
  assert.equal(resolveARVideoAsset(slot, profile, [newer]), newer, "revalidated catalog takes precedence over the bundle")
}
console.log("AR video startup passed: decoded frames, preload reuse, cancellation, bounded wait, single-clock source and Retina resolution.")
console.log("Release fallback passed: 54 routes select the same release before/after manifest fetch; all 14 replacements cannot fall back to legacy canonical files.")
