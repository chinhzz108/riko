import assert from "node:assert/strict"
import { getARPixelRatio, playARVideo, preferredARSource, setARVideoSource, waitForDecodedVideoFrame } from "../../src/lib/arVideoPlayback.js"

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
assert.equal(getARPixelRatio(390, 844, 3), 3, "a Retina phone must not be limited to 1.5x")
assert.ok(3840 * 2160 * getARPixelRatio(3840, 2160, 2) ** 2 <= 4_194_305)
console.log("AR video startup passed: decoded frames, preload reuse, cancellation, bounded wait, single-clock source and Retina resolution.")
