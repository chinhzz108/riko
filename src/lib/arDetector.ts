import type { ARDetection, ARMaskRegion } from "./arDetectorRuntime"
import detectorEntryUrl from "./arDetector.worker.ts?worker&url"
export type { ARDetection, ARMaskRegion } from "./arDetectorRuntime"
export const IMAGE_SIZE = 320

let worker: Worker | null = null
let workerUnavailable = false
let busy = false
let requestId = 0
let generation = 0
let pending: {
  id: number
  resolve: (value: ARDetection[]) => void
  reject: (error: Error) => void
  timer: number
} | null = null

export function getARDetectorStatus() {
  return {
    execution: workerUnavailable ? "main" : worker ? "worker" : "idle",
    pending: Boolean(pending),
  }
}

export function disposeARDetector() {
  generation++
  worker?.terminate()
  worker = null
  if (pending) {
    clearTimeout(pending.timer)
    pending.reject(new DOMException("AR camera stopped.", "AbortError"))
    pending = null
  }
  busy = false
  workerUnavailable = false
}

function detectorWorker() {
  if (worker) return worker
  // LiteRT's Emscripten loader uses importScripts, which requires a classic worker.
  // Import the bundled entry inside that worker without moving inference onto the UI.
  worker = new Worker(
    new URL(
      `${import.meta.env.BASE_URL}ar/detector-worker-bootstrap.js`,
      location.origin,
    ),
  )
  worker.onmessage = (
    event: MessageEvent<{
      id: number
      detections?: ARDetection[]
      error?: string
    }>,
  ) => {
    if (!pending || event.data.id !== pending.id) return
    const request = pending
    pending = null
    clearTimeout(request.timer)
    if (event.data.error) request.reject(new Error(event.data.error))
    else request.resolve(event.data.detections || [])
  }
  worker.onerror = () => {
    workerUnavailable = true
    if (pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error("AR detector worker failed."))
      pending = null
    }
    worker?.terminate()
    worker = null
  }
  return worker
}

export async function detectBookTarget(
  video: HTMLVideoElement,
  classCount: number,
  minimumConfidence: number | ((classId: number) => number) = 0.55,
  maskRegion?: ARMaskRegion | null,
): Promise<ARDetection[]> {
  if (busy) return []
  busy = true
  const currentGeneration = generation
  try {
    if (
      !workerUnavailable &&
      typeof Worker !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      typeof createImageBitmap !== "undefined"
    ) {
      try {
        const currentWorker = detectorWorker()
        // Transfer ownership, keeping the same full camera frame / 320px model input.
        // Resampling, normalization, inference and NMS stay off the UI thread.
        const image = await createImageBitmap(video)
        if (currentGeneration !== generation) {
          image.close()
          throw new DOMException("AR camera stopped.", "AbortError")
        }
        const thresholds = Array.from({ length: classCount }, (_, i) =>
          typeof minimumConfidence === "function"
            ? minimumConfidence(i)
            : minimumConfidence,
        )
        const id = ++requestId
        const detections = await new Promise<ARDetection[]>(
          (resolve, reject) => {
            pending = {
              id,
              resolve,
              reject,
              timer: window.setTimeout(() => {
                pending = null
                currentWorker.terminate()
                worker = null
                reject(new Error("AR detector worker timed out."))
              }, 90_000),
            }
            try {
              currentWorker.postMessage(
                {
                  entry: new URL(detectorEntryUrl, location.origin).href,
                  request: { id, image, classCount, thresholds, maskRegion },
                },
                [image],
              )
            } catch (error) {
              clearTimeout(pending.timer)
              pending = null
              image.close()
              reject(error)
            }
          },
        )
        return detections
      } catch (error) {
        if (currentGeneration !== generation) throw error
        workerUnavailable = true
        worker?.terminate()
        worker = null
        console.warn(
          "Background AR inference is unavailable; using the compatible detector.",
          error,
        )
      }
    }
    const runtime = await import("./arDetectorRuntime")
    return await runtime.detectBookTarget(
      video,
      classCount,
      minimumConfidence,
      maskRegion,
    )
  } finally {
    if (currentGeneration === generation) busy = false
  }
}
