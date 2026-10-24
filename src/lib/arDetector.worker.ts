import { detectBookTarget, type ARMaskRegion } from "./arDetectorRuntime"

type Request = {
  id: number
  image: ImageBitmap
  classCount: number
  thresholds: number[]
  maskRegion?: ARMaskRegion | null
}
self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, image, classCount, thresholds, maskRegion } = event.data
  try {
    const detections = await detectBookTarget(
      image,
      classCount,
      (index) => thresholds[index],
      maskRegion,
    )
    self.postMessage({ id, detections })
  } catch (error) {
    self.postMessage({ id, error: String(error) })
  } finally {
    image.close()
  }
}
