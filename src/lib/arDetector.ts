import { loadAndCompile, loadLiteRt, Tensor, type CompiledModel } from "@litertjs/core"

const MODEL_URL = `${import.meta.env.BASE_URL}models/riko-ar-detector.tflite`
const WASM_URL = `${import.meta.env.BASE_URL}litert/wasm/`
const IMAGE_SIZE = 320

export type ARDetection = {
  classId: number
  score: number
  box: { x: number; y: number; width: number; height: number }
}

export type ARMaskRegion = { x: number; y: number; width: number; height: number }

type PreparedInput = {
  values: Float32Array
  shape: number[]
  scale: number
  offsetX: number
  offsetY: number
  inputWidth: number
  inputHeight: number
  sourceWidth: number
  sourceHeight: number
}
type InputResources = {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  values: Float32Array
}

let modelPromise: Promise<CompiledModel> | undefined
let inferenceInProgress = false
const inputResourcesByVideo = new WeakMap<HTMLVideoElement, InputResources>()

function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await loadLiteRt(WASM_URL)
      return loadAndCompile(MODEL_URL, {
        accelerator: "wasm",
        cpuOptions: { numThreads: 2 },
      })
    })().catch((error) => {
      modelPromise = undefined
      throw error
    })
  }
  return modelPromise
}

function prepareInput(
  video: HTMLVideoElement,
  details: number[],
  maskRegion?: ARMaskRegion | null,
): PreparedInput {
  const [batch, first, second, fourth] = details
  const channelsFirst = first === 3
  const height = channelsFirst ? second : first
  const width = channelsFirst ? fourth : second
  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  const scale = Math.min(width / sourceWidth, height / sourceHeight)
  const drawnWidth = Math.round(sourceWidth * scale)
  const drawnHeight = Math.round(sourceHeight * scale)
  const offsetX = Math.floor((width - drawnWidth) / 2)
  const offsetY = Math.floor((height - drawnHeight) / 2)
  let resources = inputResourcesByVideo.get(video)
  if (!resources || resources.canvas.width !== width || resources.canvas.height !== height) {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) throw new Error("Không tạo được khung ảnh cho camera.")
    resources = {
      canvas,
      context,
      values: new Float32Array(width * height * 3),
    }
    inputResourcesByVideo.set(video, resources)
  }
  const { context, values } = resources
  context.fillStyle = "rgb(245, 245, 245)"
  context.fillRect(0, 0, width, height)
  context.drawImage(video, offsetX, offsetY, drawnWidth, drawnHeight)
  if (maskRegion) {
    const padding = Math.max(8, Math.min(maskRegion.width, maskRegion.height) * 0.15)
    const left = Math.max(0, offsetX + (maskRegion.x - padding) * scale)
    const top = Math.max(0, offsetY + (maskRegion.y - padding) * scale)
    const right = Math.min(width, offsetX + (maskRegion.x + maskRegion.width + padding) * scale)
    const bottom = Math.min(height, offsetY + (maskRegion.y + maskRegion.height + padding) * scale)
    context.fillRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
  }
  const { data } = context.getImageData(0, 0, width, height)
  const pixels = width * height
  for (let source = 0, target = 0; source < data.length; source += 4) {
    if (channelsFirst) {
      const pixel = source / 4
      values[pixel] = data[source] / 255
      values[pixels + pixel] = data[source + 1] / 255
      values[pixels * 2 + pixel] = data[source + 2] / 255
    } else {
      values[target++] = data[source] / 255
      values[target++] = data[source + 1] / 255
      values[target++] = data[source + 2] / 255
    }
  }
  const shape = channelsFirst
    ? [batch || 1, 3, height, width]
    : [batch || 1, height, width, 3]
  return {
    values,
    shape,
    scale,
    offsetX,
    offsetY,
    inputWidth: width,
    inputHeight: height,
    sourceWidth,
    sourceHeight,
  }
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value))
}

function overlap(a: ARDetection["box"], b: ARDetection["box"]) {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top)
  const union = a.width * a.height + b.width * b.height - intersection
  return union > 0 ? intersection / union : 0
}

function decodeOutput(
  values: ArrayLike<number>,
  dimensions: number[],
  prepared: PreparedInput,
  classCount: number,
  minimumConfidence: number | ((classId: number) => number),
) {
  const channelsFirst = dimensions[1] === classCount + 4
  const rows = dimensions[channelsFirst ? 2 : 1]
  const channels = classCount + 4
  const at = (row: number, channel: number) =>
    channelsFirst ? values[channel * rows + row] : values[row * channels + channel]
  const detections: ARDetection[] = []
  const { scale, offsetX, offsetY, sourceWidth, sourceHeight } = prepared

  for (let row = 0; row < rows; row += 1) {
    let classId = -1
    let score = -Infinity
    for (let candidate = 0; candidate < classCount; candidate += 1) {
      const raw = at(row, candidate + 4)
      const confidence = raw >= 0 && raw <= 1 ? raw : sigmoid(raw)
      if (confidence > score) {
        score = confidence
        classId = candidate
      }
    }
    if (classId < 0) continue
    const classMinimumConfidence =
      typeof minimumConfidence === "function" ? minimumConfidence(classId) : minimumConfidence
    if (score < classMinimumConfidence) continue

    const rawCenterX = at(row, 0)
    const rawCenterY = at(row, 1)
    const rawWidth = at(row, 2)
    const rawHeight = at(row, 3)
    const coordinatesAreNormalized =
      Math.max(Math.abs(rawCenterX), Math.abs(rawCenterY), Math.abs(rawWidth), Math.abs(rawHeight)) <= 2
    const centerX = coordinatesAreNormalized ? rawCenterX * prepared.inputWidth : rawCenterX
    const centerY = coordinatesAreNormalized ? rawCenterY * prepared.inputHeight : rawCenterY
    const width = coordinatesAreNormalized ? rawWidth * prepared.inputWidth : rawWidth
    const height = coordinatesAreNormalized ? rawHeight * prepared.inputHeight : rawHeight
    const x = Math.max(0, (centerX - width / 2 - offsetX) / scale)
    const y = Math.max(0, (centerY - height / 2 - offsetY) / scale)
    const right = Math.min(sourceWidth, (centerX + width / 2 - offsetX) / scale)
    const bottom = Math.min(sourceHeight, (centerY + height / 2 - offsetY) / scale)
    if (right <= x || bottom <= y) continue
    detections.push({
      classId,
      score,
      box: { x, y, width: right - x, height: bottom - y },
    })
  }

  detections.sort((a, b) => b.score - a.score)
  const selected: ARDetection[] = []
  for (const detection of detections) {
    if (selected.some((item) => item.classId === detection.classId && overlap(item.box, detection.box) > 0.45)) continue
    selected.push(detection)
    if (selected.length >= 12) break
  }
  return selected
}

export async function detectBookTarget(
  video: HTMLVideoElement,
  classCount: number,
  minimumConfidence: number | ((classId: number) => number) = 0.55,
  maskRegion?: ARMaskRegion | null,
) {
  if (inferenceInProgress) return []
  inferenceInProgress = true
  try {
    const model = await loadModel()
    const inputDetails = model.getInputDetails()[0]
    const outputDetails = model.getOutputDetails()[0]
    const prepared = prepareInput(video, Array.from(inputDetails.shape), maskRegion)
    const input = new Tensor(prepared.values, prepared.shape)
    try {
      const outputs = (await model.run(input)) as Tensor[]
      try {
        const output = await outputs[0].moveTo("wasm")
        try {
          const values = output.toTypedArray()
          return decodeOutput(
            values,
            Array.from(outputDetails.shape),
            prepared,
            classCount,
            minimumConfidence,
          )
        } finally {
          output.delete()
        }
      } finally {
        outputs.forEach((tensor) => tensor.delete())
      }
    } finally {
      input.delete()
    }
  } finally {
    inferenceInProgress = false
  }
}

export { IMAGE_SIZE }
