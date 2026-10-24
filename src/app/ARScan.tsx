import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import {
  ArrowLeft,
  Camera,
  Flashlight,
  Minus,
  Plus,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { Link } from "react-router"
import type {
  Camera as ThreeCamera,
  Group,
  Mesh,
  MeshBasicMaterial,
  Matrix4,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three"
import { installARGestures } from "../lib/arGestures"
import { configurePackedAlpha } from "../lib/arPackedMaterial"
import {
  clampARScale,
  MAX_AR_SCALE,
  MIN_AR_SCALE,
  poseSmoothingAlpha,
} from "../lib/arMotion.js"
import bookVideoManifest from "../data/bookVideoSlots.json"
import arTargetManifest from "../data/arTargets.json"
import mindArTargetManifest from "../data/arPageTargets.json"
import videoPresentations from "../data/arVideoPresentation.json"
import {
  detectBookTarget,
  disposeARDetector,
  type ARDetection,
} from "../lib/arDetector"
import { getCoverRect } from "../lib/arScanGeometry"
import { resolveSlotFromLabel, routeSlotFromQR } from "../lib/arScanLogic.js"
import {
  DEFAULT_VIDEO_PRESENTATION,
  getBillboardBasis,
  getPresentationLayout,
  type PresentationLayout,
  type VideoPresentation,
} from "../lib/arPresentation.js"

type BookSlot = typeof bookVideoManifest.slots[number] & {
  arTargetId?: string | null
  arVideoUrl?: string | null
  pageClass?: string
}
type MindARPageTarget = typeof mindArTargetManifest.targets[number]
type Target = typeof arTargetManifest.targets[number] & {
  popupLabel: string
  videoUrl: string
  pages: string[]
}
type Selection = {
  slot: BookSlot
  box: ARDetection["box"] | null
  source: "popup" | "page" | "qr"
  score?: number
}
type PendingQR = { slot: BookSlot; foundAt: number }
type VideoAsset = {
  id: string
  url: string
  alpha?: boolean
  alphaVideoUrl?: string
  alphaColorUrl?: string
  alphaMaskUrl?: string
}
type MindARAnchor = {
  group: Group
  visible: boolean
  onTargetFound: (() => void) | null
  onTargetLost: (() => void) | null
}
type MindARInstance = {
  video: HTMLVideoElement
  renderer: WebGLRenderer
  scene: Scene
  camera: ThreeCamera
  addAnchor: (targetIndex: number) => MindARAnchor
  start: () => Promise<void>
  stop: () => void
  cssRenderer?: { domElement: HTMLElement }
}
type PlaneRecord = {
  anchor: MindARAnchor
  root: Group
  mesh: Mesh
  slot: BookSlot
  target: MindARPageTarget
  shadow: Mesh
  layout: PresentationLayout
  enteredAt: number
  lastPose: Matrix4
  poseReady: boolean
  fitScale: number
  offset: { x: number; y: number }
}
type SpatialMedia = {
  video: HTMLVideoElement
  colorVideo: HTMLVideoElement
  maskVideo: HTMLVideoElement
  texture: Texture
  colorTexture: Texture
  maskTexture: Texture
  packedAlpha: { value: number }
  material: MeshBasicMaterial
  shadowMaterial: MeshBasicMaterial
  shadowTexture: Texture
  nativeFrame: HTMLDivElement
  profile: VideoPresentation
  currentVideo: HTMLVideoElement | null
  fallbackActive: boolean
  packedActive: boolean
  ready: boolean
  nativeOverlayActive: boolean
  nativeOverlayPositioned: boolean
}

type StageViewport = { renderer: DOMRect; frame: DOMRect; overlay: DOMRect }

const slots = bookVideoManifest.slots as BookSlot[]
const targets = arTargetManifest.targets as Target[]
const pageTargets = mindArTargetManifest.targets as MindARPageTarget[]
const classNames = [
  ...slots.map(
    (slot) => slot.pageClass || `page_${slot.id.replace(/-/g, "_")}`,
  ),
  ...targets.map((target) => target.popupLabel),
]
const detectionConfidence = (classId: number) => {
  const label = classNames[classId]
  return label?.startsWith("popup_")
    ? arTargetManifest.minimumConfidenceByType.popup
    : arTargetManifest.minimumConfidenceByType.page
}
const CAMERA_START_TIMEOUT_MS = 15_000
const TARGET_LOST_GRACE_MS = 650

function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError")
      return "Chưa được cấp quyền dùng camera. Hãy cho phép camera rồi bấm thử lại nhé."
    if (error.name === "TimeoutError")
      return "Camera chưa phản hồi. Hãy kiểm tra quyền camera của trình duyệt rồi thử lại nhé."
    if (error.name === "NotFoundError")
      return "Thiết bị này không tìm thấy camera. Hãy thử trên điện thoại hoặc máy có camera nhé."
  }
  return "Không mở được camera. Hãy kiểm tra quyền camera và thử lại trên HTTPS hoặc localhost."
}

async function requestCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error("Camera access is unavailable in this browser.")
  let requestTimedOut = false
  let timeoutId: number | undefined
  const request = navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
    })
    .then((stream) => {
      if (requestTimedOut) stream.getTracks().forEach((track) => track.stop())
      return requestTimedOut ? null : stream
    })
  const timeout = new Promise<null>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      requestTimedOut = true
      reject(
        new DOMException(
          "Camera permission or device request timed out.",
          "TimeoutError",
        ),
      )
    }, CAMERA_START_TIMEOUT_MS)
  })
  try {
    const stream = await Promise.race([request, timeout])
    if (!stream)
      throw new DOMException("Camera request timed out.", "TimeoutError")
    return stream
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}

function slotFromDetection(
  detection: ARDetection,
  pageContext?: BookSlot | null,
) {
  return resolveSlotFromLabel(
    classNames[detection.classId],
    pageContext?.id,
    targets,
    slots,
  )
}

function isSafariOrIOS() {
  const userAgent = navigator.userAgent
  const isIOS =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  const isSafari =
    /Safari/i.test(userAgent) &&
    !/(Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS)/i.test(userAgent)
  return isIOS || isSafari
}

function makeVideoElement() {
  const video = document.createElement("video")
  video.crossOrigin = "anonymous"
  video.preload = "auto"
  video.autoplay = true
  video.loop = true
  video.muted = true
  video.playsInline = true
  video.setAttribute("playsinline", "")
  video.setAttribute("webkit-playsinline", "")
  return video
}

function waitForVideoFrame(video: HTMLVideoElement, timeoutMs = 8000) {
  if (video.error) return Promise.reject(video.error)
  if (
    typeof video.requestVideoFrameCallback !== "function" &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0
  )
    return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    let timer = 0
    let frameRequest = 0
    let settled = false
    const cleanup = () => {
      window.clearTimeout(timer)
      if (frameRequest && video.cancelVideoFrameCallback)
        video.cancelVideoFrameCallback(frameRequest)
      video.removeEventListener("loadeddata", check)
      video.removeEventListener("canplay", check)
      video.removeEventListener("playing", check)
      video.removeEventListener("error", fail)
    }
    const complete = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const check = () => {
      if (
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth <= 0
      )
        return
      if (typeof video.requestVideoFrameCallback === "function") {
        if (!frameRequest)
          frameRequest = video.requestVideoFrameCallback(complete)
        return
      }
      complete()
    }
    const finishWithError = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const fail = () =>
      finishWithError(video.error || new Error("Video không giải mã được."))
    timer = window.setTimeout(
      () =>
        finishWithError(new Error("Video không tạo được khung hình đầu tiên.")),
      timeoutMs,
    )
    video.addEventListener("loadeddata", check)
    video.addEventListener("canplay", check)
    video.addEventListener("playing", check)
    video.addEventListener("error", fail)
    check()
  })
}

function videoPreservesAlpha(video: HTMLVideoElement) {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return false
  try {
    const canvas = document.createElement("canvas")
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return false
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] < 245) return true
    }
    return false
  } catch {
    return false
  }
}

async function startMindARWithStream(
  tracker: MindARInstance,
  stream: MediaStream,
) {
  const mediaDevices = navigator.mediaDevices
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    mediaDevices,
    "getUserMedia",
  )
  const restore = () => {
    if (originalDescriptor)
      Object.defineProperty(mediaDevices, "getUserMedia", originalDescriptor)
    else Reflect.deleteProperty(mediaDevices, "getUserMedia")
  }
  Object.defineProperty(mediaDevices, "getUserMedia", {
    configurable: true,
    writable: true,
    value: () => Promise.resolve(stream),
  })
  try {
    const startPromise = tracker.start()
    const camera = tracker.video
    camera.muted = true
    camera.playsInline = true
    camera.style.zIndex = "0"
    camera.style.objectFit = "cover"
    tracker.renderer.domElement.style.zIndex = "1"
    tracker.renderer.domElement.style.pointerEvents = "none"
    tracker.renderer.domElement.style.background = "transparent"
    if (tracker.cssRenderer) {
      tracker.cssRenderer.domElement.style.zIndex = "2"
      tracker.cssRenderer.domElement.style.pointerEvents = "none"
    }
    await startPromise
  } finally {
    restore()
  }
}

export default function ARScan() {
  const frameRef = useRef<HTMLDivElement>(null)
  const cameraLayerRef = useRef<HTMLDivElement>(null)
  const videoOverlayRef = useRef<HTMLDivElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement>(null)
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const trackerRef = useRef<MindARInstance | null>(null)
  const spatialRef = useRef<SpatialMedia | null>(null)
  const planeRecordsRef = useRef<PlaneRecord[]>([])
  const scanLoopRef = useRef<(() => void) | null>(null)
  const stageCleanupRef = useRef<(() => void) | null>(null)
  const viewportRef = useRef<StageViewport | null>(null)
  const modelReadyRef = useRef(false)
  const activePageSlotRef = useRef<BookSlot | null>(null)
  const targetLostTimeoutRef = useRef<number | null>(null)
  const pendingQRRef = useRef<PendingQR | null>(null)
  const qrFallbackRef = useRef<string | null>(null)
  const dismissedSlotRef = useRef<string | null>(null)
  const spatialPlayRequestRef = useRef(0)
  const presentationScaleRef = useRef(1)
  const selectionRef = useRef<Selection | null>(null)
  const videoManifestRef = useRef<Promise<VideoAsset[]> | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState("")
  const [trackerStatus, setTrackerStatus] =
    useState<"idle" | "loading" | "ready">("idle")
  const [modelStatus, setModelStatus] =
    useState<"idle" | "loading" | "ready" | "unavailable">("idle")
  const [selection, setSelection] = useState<Selection | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<VideoAsset | null>(null)
  const [trackedPageLabel, setTrackedPageLabel] = useState("")
  const [cameraSize, setCameraSize] = useState("")
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [boxStyle, setBoxStyle] = useState<CSSProperties | undefined>()
  const [soundOn, setSoundOn] = useState(false)
  const [scannedQR, setScannedQR] = useState("")
  const [presentationScale, setPresentationScale] = useState(1)

  const selectedTarget = useMemo(() => {
    if (!selection?.slot.arTargetId) return null
    return (
      targets.find((target) => target.id === selection.slot.arTargetId) || null
    )
  }, [selection])

  function chooseSelection(next: Selection | null) {
    selectionRef.current = next
    setSelection(next)
  }

  function videoAssets() {
    if (!videoManifestRef.current) {
      videoManifestRef.current = fetch("/videos/ar/manifest.json", {
        cache: "force-cache",
      }).then(async (response) => {
        if (!response.ok) throw new Error("Could not load AR video manifest")
        return (await response.json()) as VideoAsset[]
      })
    }
    return videoManifestRef.current
  }

  async function findVideoAsset(slot: BookSlot) {
    const defaultAsset: VideoAsset = {
      id: slot.arTargetId || slot.id,
      url: slot.arVideoUrl || "",
    }
    try {
      const manifest = await videoAssets()
      return (
        manifest.find(
          (item) => item.url === slot.arVideoUrl || item.id === slot.arTargetId,
        ) || defaultAsset
      )
    } catch {
      return defaultAsset
    }
  }

  function resizePlane(record: PlaneRecord, aspect: number) {
    const profile = spatialRef.current?.profile || DEFAULT_VIDEO_PRESENTATION
    record.layout = getPresentationLayout(
      record.target,
      profile,
      aspect,
      presentationScaleRef.current,
    )
    const { width, height, baseX, baseY, shadowWidth, shadowDepth, crop } =
      record.layout
    record.mesh.scale.set(width, height, 1)
    const uv = record.mesh.geometry.attributes.uv
    uv.setXY(0, crop.left, 1 - crop.top)
    uv.setXY(1, crop.right, 1 - crop.top)
    uv.setXY(2, crop.left, 1 - crop.bottom)
    uv.setXY(3, crop.right, 1 - crop.bottom)
    uv.needsUpdate = true
    record.shadow.position.set(baseX, baseY, 0.003)
    record.shadow.scale.set(shadowWidth, shadowDepth, 1)
  }

  function changePresentationScale(delta: number) {
    const next = clampARScale(presentationScaleRef.current + delta)
    presentationScaleRef.current = next
    setPresentationScale(next)
    const media = spatialRef.current
    const video = media?.currentVideo
    if (!media || !video?.videoWidth || !video.videoHeight) return
    const aspect =
      video.videoWidth / video.videoHeight / (media.packedActive ? 2 : 1)
    for (const record of planeRecordsRef.current) resizePlane(record, aspect)
  }

  function resetPresentation() {
    for (const record of planeRecordsRef.current) record.offset = { x: 0, y: 0 }
    changePresentationScale(1 - presentationScaleRef.current)
  }

  function hideNativeVideoOverlay(
    media = spatialRef.current,
    deactivate = true,
  ) {
    if (!media) return
    if (deactivate) media.nativeOverlayActive = false
    media.nativeOverlayPositioned = false
    media.nativeFrame.style.opacity = "0"
    media.nativeFrame.style.transform = "translate3d(-10000px, -10000px, 0)"
  }

  function positionNativeVideoOverlay(
    record: PlaneRecord,
    tracker: MindARInstance,
    corners: Vector3[],
  ) {
    const media = spatialRef.current
    const overlay = videoOverlayRef.current
    const video = media?.video
    if (
      !media?.nativeOverlayActive ||
      !overlay ||
      !video ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    )
      return hideNativeVideoOverlay(media, false)

    const viewport = viewportRef.current?.renderer
    const overlayRect = viewportRef.current?.overlay
    if (
      !viewport ||
      !overlayRect ||
      viewport.width < 1 ||
      viewport.height < 1 ||
      overlayRect.width < 1 ||
      overlayRect.height < 1
    )
      return hideNativeVideoOverlay(media, false)

    for (let i = 0; i < 4; i++) {
      const point = corners[i]
      point
        .set(i === 0 || i === 3 ? -0.5 : 0.5, i < 2 ? 0.5 : -0.5, 0)
        .applyMatrix4(record.mesh.matrixWorld)
        .project(tracker.camera)
      point.x =
        viewport.left + ((point.x + 1) / 2) * viewport.width - overlayRect.left
      point.y =
        viewport.top + ((1 - point.y) / 2) * viewport.height - overlayRect.top
    }
    if (
      corners.some(
        (point) =>
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          !Number.isFinite(point.z) ||
          point.z < -1 ||
          point.z > 1,
      )
    )
      return hideNativeVideoOverlay(media, false)

    // Native alpha and the WebGL fallback use the exact same upright geometry.
    const [p0, p1, p2, p3] = corners
    const dx1 = p1.x - p2.x
    const dx2 = p3.x - p2.x
    const dx3 = p0.x - p1.x + p2.x - p3.x
    const dy1 = p1.y - p2.y
    const dy2 = p3.y - p2.y
    const dy3 = p0.y - p1.y + p2.y - p3.y
    const determinant = dx1 * dy2 - dx2 * dy1
    if (Math.abs(determinant) < 0.000001)
      return hideNativeVideoOverlay(media, false)
    const g = (dx3 * dy2 - dx2 * dy3) / determinant
    const h = (dx1 * dy3 - dx3 * dy1) / determinant
    const a = p1.x - p0.x + g * p1.x
    const b = p3.x - p0.x + h * p3.x
    const c = p0.x
    const d = p1.y - p0.y + g * p1.y
    const e = p3.y - p0.y + h * p3.y
    const f = p0.y
    const crop = record.layout.crop
    const sourceWidth = video.videoWidth * (crop.right - crop.left)
    const sourceHeight = video.videoHeight * (crop.bottom - crop.top)
    const coefficients = [
      a / sourceWidth,
      d / sourceWidth,
      g / sourceWidth,
      b / sourceHeight,
      e / sourceHeight,
      h / sourceHeight,
      c,
      f,
    ]
    if (!coefficients.every(Number.isFinite))
      return hideNativeVideoOverlay(media, false)
    const transform = `matrix3d(${coefficients[0]},${coefficients[1]},0,${coefficients[2]},${coefficients[3]},${coefficients[4]},0,${coefficients[5]},0,0,1,0,${coefficients[6]},${coefficients[7]},0,1)`
    const videoWidth = `${sourceWidth}px`
    const videoHeight = `${sourceHeight}px`
    const nativeFrame = media.nativeFrame
    if (nativeFrame.style.transform !== transform)
      nativeFrame.style.transform = transform
    if (nativeFrame.style.width !== videoWidth)
      nativeFrame.style.width = videoWidth
    if (nativeFrame.style.height !== videoHeight)
      nativeFrame.style.height = videoHeight
    if (
      nativeFrame.dataset.source !==
      `${video.videoWidth}:${video.videoHeight}:${crop.left}:${crop.top}`
    ) {
      video.style.width = `${video.videoWidth}px`
      video.style.height = `${video.videoHeight}px`
      video.style.left = `${-crop.left * video.videoWidth}px`
      video.style.top = `${-crop.top * video.videoHeight}px`
      nativeFrame.dataset.source = `${video.videoWidth}:${video.videoHeight}:${crop.left}:${crop.top}`
    }
    nativeFrame.style.opacity = String(media.material.opacity)
    media.nativeOverlayPositioned = true
  }

  async function showSpatialVideo(slot: BookSlot) {
    const media = spatialRef.current
    if (!media || !slot.arVideoUrl) return
    const requestId = ++spatialPlayRequestRef.current
    media.ready = false
    const isCurrentRequest = () =>
      spatialRef.current === media &&
      spatialPlayRequestRef.current === requestId &&
      activePageSlotRef.current?.id === slot.id
    setError("")
    const asset = await findVideoAsset(slot)
    if (!isCurrentRequest()) return
    media.profile =
      (videoPresentations as Record<string, VideoPresentation>)[asset.id] ||
      DEFAULT_VIDEO_PRESENTATION
    setSelectedAsset(asset)
    hideNativeVideoOverlay(media)
    const safari = isSafariOrIOS()
    const hasSplitAlpha = Boolean(
      asset.alpha && asset.alphaColorUrl && asset.alphaMaskUrl,
    )
    media.fallbackActive = Boolean(hasSplitAlpha && safari)
    media.packedActive = false
    media.video.pause()
    media.colorVideo.pause()
    media.maskVideo.pause()
    media.video.muted = true
    media.colorVideo.muted = true
    media.maskVideo.muted = true

    const setSource = (video: HTMLVideoElement, url: string) => {
      const absoluteUrl = new URL(url, window.location.origin).href
      if (video.src === absoluteUrl) {
        if (video.error) video.load()
        return
      }
      video.pause()
      video.src = url
      video.load()
    }
    const playTexture = async (
      video: HTMLVideoElement,
      texture: Texture,
      url: string,
    ) => {
      setSource(video, url)
      const playback = video.play()
      await playback
      await waitForVideoFrame(video)
      texture.needsUpdate = true
    }
    const playSplitAlpha = async () => {
      if (!hasSplitAlpha) throw new Error("Không có video alpha dự phòng.")
      const colorUrl = asset.alphaColorUrl!
      const maskUrl = asset.alphaMaskUrl!
      media.fallbackActive = true
      media.packedActive = false
      media.packedAlpha.value = 0
      media.colorTexture.repeat.set(1, 1)
      media.material.map = media.colorTexture
      media.material.alphaMap = media.maskTexture
      media.material.transparent = true
      media.currentVideo = media.colorVideo
      await Promise.all([
        playTexture(media.colorVideo, media.colorTexture, colorUrl),
        playTexture(media.maskVideo, media.maskTexture, maskUrl),
      ])
    }
    const playCompatibleAlpha = async () => {
      const packed = media.profile.packedVideoUrl
      if (!packed) return playSplitAlpha()
      try {
        media.fallbackActive = true
        media.packedActive = true
        media.packedAlpha.value = 1
        media.colorTexture.repeat.set(0.5, 1)
        media.material.map = media.colorTexture
        media.material.alphaMap = null
        media.material.transparent = true
        media.currentVideo = media.colorVideo
        await playTexture(media.colorVideo, media.colorTexture, packed)
      } catch (error) {
        console.warn(
          "Packed alpha could not play; trying separate matte streams.",
          error,
        )
        await playSplitAlpha()
      }
    }
    const playNative = async () => {
      const source =
        asset.alpha && asset.alphaVideoUrl ? asset.alphaVideoUrl : asset.url
      if (!source) throw new Error("Thiếu đường dẫn video AR.")
      media.fallbackActive = false
      media.packedActive = false
      media.packedAlpha.value = 0
      media.material.map = media.texture
      media.material.alphaMap = null
      media.material.transparent = Boolean(asset.alpha)
      media.currentVideo = media.video
      await playTexture(media.video, media.texture, source)
      if (asset.alpha && hasSplitAlpha && !videoPreservesAlpha(media.video)) {
        console.warn(
          "Browser decoded the AR WebM without transparency; switching to the color/matte fallback.",
        )
        media.video.pause()
        await playCompatibleAlpha()
      }
    }

    try {
      if (media.fallbackActive) await playCompatibleAlpha()
      else await playNative()
    } catch (playError) {
      if (!isCurrentRequest()) return
      console.warn(
        "AR video playback failed; trying the compatible source.",
        playError,
      )
      media.video.pause()
      media.colorVideo.pause()
      media.maskVideo.pause()
      try {
        if (hasSplitAlpha && !media.fallbackActive) await playCompatibleAlpha()
        else if (hasSplitAlpha && safari) await playNative()
        else throw playError
      } catch (fallbackError) {
        if (!isCurrentRequest()) return
        console.error("No AR video source could be played.", fallbackError)
        setError(
          "Video AR chưa phát được trên trình duyệt này. Hãy thử tải lại trang hoặc chạm bắt đầu quét lại.",
        )
        return
      }
    }
    if (!isCurrentRequest()) return
    media.material.needsUpdate = true
    media.ready = true
    const activeRecord = planeRecordsRef.current.find(
      (record) => record.slot.id === slot.id,
    )
    if (activeRecord) activeRecord.enteredAt = performance.now()
    media.nativeOverlayActive =
      !media.fallbackActive && media.currentVideo === media.video
    if (!media.nativeOverlayActive) hideNativeVideoOverlay(media)
    const activeVideo = media.currentVideo
    const resize = () => {
      const ratio =
        activeVideo?.videoWidth && activeVideo.videoHeight
          ? activeVideo.videoWidth /
            activeVideo.videoHeight /
            (media.packedActive ? 2 : 1)
          : slot.arVideoUrl.endsWith("/RIKO.webm")
            ? 9 / 16
            : 16 / 9
      for (const record of planeRecordsRef.current) resizePlane(record, ratio)
    }
    activeVideo?.addEventListener("loadedmetadata", resize, { once: true })
    resize()
  }

  function createTrackerScene(
    tracker: MindARInstance,
    THREE: typeof import("three"),
  ) {
    const video = makeVideoElement()
    const colorVideo = makeVideoElement()
    const maskVideo = makeVideoElement()
    const texture = new THREE.VideoTexture(video)
    const colorTexture = new THREE.VideoTexture(colorVideo)
    const maskTexture = new THREE.VideoTexture(maskVideo)
    for (const item of [texture, colorTexture]) {
      item.colorSpace = THREE.SRGBColorSpace
      item.minFilter = THREE.LinearFilter
      item.magFilter = THREE.LinearFilter
      item.generateMipmaps = false
    }
    maskTexture.colorSpace = THREE.NoColorSpace
    maskTexture.minFilter = THREE.LinearFilter
    maskTexture.magFilter = THREE.LinearFilter
    maskTexture.generateMipmaps = false
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      forceSinglePass: true,
    })
    const packedAlpha = configurePackedAlpha(
      material,
      THREE.ShaderChunk.map_fragment,
    )
    const shadowCanvas = document.createElement("canvas")
    shadowCanvas.width = 128
    shadowCanvas.height = 128
    const shadowContext = shadowCanvas.getContext("2d")!
    const gradient = shadowContext.createRadialGradient(64, 64, 2, 64, 64, 64)
    gradient.addColorStop(0, "rgba(13,18,25,0.64)")
    gradient.addColorStop(0.35, "rgba(13,18,25,0.3)")
    gradient.addColorStop(1, "rgba(13,18,25,0)")
    shadowContext.fillStyle = gradient
    shadowContext.fillRect(0, 0, 128, 128)
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas)
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      forceSinglePass: true,
    })
    const nativeFrame = document.createElement("div")
    nativeFrame.dataset.arVideoSurface = "upright"
    Object.assign(nativeFrame.style, {
      position: "absolute",
      left: "0",
      top: "0",
      transformOrigin: "0 0",
      overflow: "hidden",
      opacity: "0",
      willChange: "transform",
    })
    videoOverlayRef.current?.append(nativeFrame)
    const media: SpatialMedia = {
      video,
      colorVideo,
      maskVideo,
      texture,
      colorTexture,
      maskTexture,
      packedAlpha,
      material,
      shadowMaterial,
      shadowTexture,
      nativeFrame,
      profile: DEFAULT_VIDEO_PRESENTATION,
      currentVideo: null,
      fallbackActive: false,
      packedActive: false,
      ready: false,
      nativeOverlayActive: false,
      nativeOverlayPositioned: false,
    }
    for (const [element, textureToRefresh] of [
      [video, texture],
      [colorVideo, colorTexture],
      [maskVideo, maskTexture],
    ] as const) {
      const refreshTexture = () => {
        if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
          textureToRefresh.needsUpdate = true
      }
      element.addEventListener("loadeddata", refreshTexture)
      element.addEventListener("playing", refreshTexture)
      element.addEventListener("timeupdate", refreshTexture)
      element.setAttribute("aria-hidden", "true")
      Object.assign(element.style, {
        position: "absolute",
        left: "0",
        top: "0",
        width: "1px",
        height: "1px",
        opacity: "0",
        pointerEvents: "none",
        zIndex: "-1",
      })
      if (element === video) {
        Object.assign(element.style, {
          left: "0",
          top: "0",
          width: "1px",
          height: "1px",
          transformOrigin: "0 0",
          objectFit: "fill",
          opacity: "1",
          zIndex: "1",
        })
        nativeFrame.append(element)
      } else {
        cameraLayerRef.current?.append(element)
      }
    }
    spatialRef.current = media
    const records: PlaneRecord[] = []

    for (const target of pageTargets) {
      const slot = slots.find((item) => item.id === target.slotId)
      if (!slot?.arVideoUrl) continue
      const anchor = tracker.addAnchor(target.index)
      // MindAR owns its raw anchor matrix. Render a separate, filtered pose.
      const root = new THREE.Group()
      root.visible = false
      tracker.scene.add(root)
      const geometry = new THREE.PlaneGeometry(1, 1)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.frustumCulled = false
      mesh.renderOrder = 5
      mesh.visible = false
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        shadowMaterial,
      )
      shadow.renderOrder = 4
      shadow.visible = false
      const record: PlaneRecord = {
        anchor,
        root,
        mesh,
        shadow,
        slot,
        target,
        enteredAt: 0,
        lastPose: new THREE.Matrix4(),
        poseReady: false,
        fitScale: 1,
        offset: { x: 0, y: 0 },
        layout: getPresentationLayout(
          target,
          DEFAULT_VIDEO_PRESENTATION,
          16 / 9,
        ),
      }
      resizePlane(
        record,
        slot.arVideoUrl.endsWith("/RIKO.webm") ? 9 / 16 : 16 / 9,
      )
      root.add(shadow, mesh)
      records.push(record)

      anchor.onTargetFound = () => {
        record.lastPose.copy(anchor.group.matrix)
        const previous = activePageSlotRef.current
        if (previous?.id !== slot.id) record.poseReady = false
        if (targetLostTimeoutRef.current !== null) {
          window.clearTimeout(targetLostTimeoutRef.current)
          targetLostTimeoutRef.current = null
        }
        if (previous && previous.id !== slot.id) dismissedSlotRef.current = null
        activePageSlotRef.current = slot
        pendingQRRef.current = null
        qrFallbackRef.current = null
        setScannedQR("")
        setTrackedPageLabel(slot.label)
        setSoundOn(false)
        if (dismissedSlotRef.current !== slot.id) {
          chooseSelection({ slot, box: null, source: "page" })
          // Keep playback continuous when MindAR reacquires the same page
          // during the brief lost-target grace period.
          if (previous?.id !== slot.id) {
            record.enteredAt = performance.now()
            void showSpatialVideo(slot)
          }
        }
      }
      anchor.onTargetLost = () => {
        if (activePageSlotRef.current?.id !== slot.id) return
        if (targetLostTimeoutRef.current !== null)
          window.clearTimeout(targetLostTimeoutRef.current)
        targetLostTimeoutRef.current = window.setTimeout(() => {
          targetLostTimeoutRef.current = null
          if (activePageSlotRef.current?.id !== slot.id) return
          spatialPlayRequestRef.current += 1
          activePageSlotRef.current = null
          setTrackedPageLabel("")
          setBoxStyle(undefined)
          if (
            selectionRef.current?.slot.id === slot.id &&
            selectionRef.current.source !== "qr"
          ) {
            chooseSelection(null)
          }
          spatialRef.current?.currentVideo?.pause()
          spatialRef.current?.maskVideo.pause()
          hideNativeVideoOverlay()
        }, TARGET_LOST_GRACE_MS)
      }
    }
    planeRecordsRef.current = records
    tracker.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    tracker.renderer.setClearColor(0x000000, 0)
    tracker.renderer.setClearAlpha(0)
    const localCamera = new THREE.Vector3()
    const localScreenUp = new THREE.Vector3()
    const inverseAnchor = new THREE.Matrix4()
    const rightAxis = new THREE.Vector3()
    const upAxis = new THREE.Vector3()
    const normalAxis = new THREE.Vector3()
    const rotationMatrix = new THREE.Matrix4()
    const projectedPoint = new THREE.Vector3()
    const projectedFoot = new THREE.Vector3()
    const overlayCorners = Array.from({ length: 4 }, () => new THREE.Vector3())
    const desiredPosition = new THREE.Vector3()
    const desiredRotation = new THREE.Quaternion()
    const desiredScale = new THREE.Vector3()
    const screenCorners = [
      [-0.5, 0.5],
      [0.5, 0.5],
      [-0.5, -0.5],
      [0.5, -0.5],
    ]
    const updateViewport = () => {
      const frame = frameRef.current
      const overlay = videoOverlayRef.current
      if (!frame || !overlay) return
      viewportRef.current = {
        renderer: tracker.renderer.domElement.getBoundingClientRect(),
        frame: frame.getBoundingClientRect(),
        overlay: overlay.getBoundingClientRect(),
      }
    }
    const viewportObserver = new ResizeObserver(updateViewport)
    viewportObserver.observe(tracker.renderer.domElement)
    if (frameRef.current) viewportObserver.observe(frameRef.current)
    window.addEventListener("resize", updateViewport)
    window.visualViewport?.addEventListener("resize", updateViewport)
    window.visualViewport?.addEventListener("scroll", updateViewport)
    updateViewport()

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const localRay = new THREE.Ray()
    const pagePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const intersection = new THREE.Vector3()
    const activeRecord = () =>
      records.find(
        (record) =>
          record.slot.id === activePageSlotRef.current?.id &&
          record.root.visible,
      )
    const gestureCleanup = frameRef.current
      ? installARGestures(frameRef.current, {
          canStart: () =>
            Boolean(
              activeRecord() &&
                media.ready &&
                dismissedSlotRef.current !== activePageSlotRef.current?.id,
            ),
          project: (x, y) => {
            const record = activeRecord()
            const rect = viewportRef.current?.renderer
            if (!record || !rect?.width || !rect.height) return null
            pointer.set(
              ((x - rect.left) / rect.width) * 2 - 1,
              1 - ((y - rect.top) / rect.height) * 2,
            )
            raycaster.setFromCamera(pointer, tracker.camera)
            localRay
              .copy(raycaster.ray)
              .applyMatrix4(
                inverseAnchor.copy(record.root.matrixWorld).invert(),
              )
            if (Math.abs(localRay.direction.z) < 0.08) return null
            pagePlane.constant = -record.layout.lift
            if (!localRay.intersectPlane(pagePlane, intersection)) return null
            return { x: intersection.x, y: intersection.y }
          },
          getTransform: () => ({
            x: activeRecord()?.offset.x || 0,
            y: activeRecord()?.offset.y || 0,
            scale: presentationScaleRef.current,
          }),
          setTransform: (value) => {
            const record = activeRecord()
            if (!record) return
            record.offset.x = Math.min(1.25, Math.max(-1.25, value.x))
            const pageHeight =
              record.target.targetSize.height / record.target.targetSize.width
            record.offset.y = Math.min(
              pageHeight,
              Math.max(-pageHeight, value.y),
            )
            if (Math.abs(value.scale - presentationScaleRef.current) > 0.0001) {
              presentationScaleRef.current = value.scale
              const video = media.currentVideo
              if (video?.videoWidth && video.videoHeight)
                resizePlane(
                  record,
                  video.videoWidth /
                    video.videoHeight /
                    (media.packedActive ? 2 : 1),
                )
            }
          },
          commit: () => setPresentationScale(presentationScaleRef.current),
        })
      : () => {}
    stageCleanupRef.current = () => {
      gestureCleanup()
      viewportObserver.disconnect()
      window.removeEventListener("resize", updateViewport)
      window.visualViewport?.removeEventListener("resize", updateViewport)
      window.visualViewport?.removeEventListener("scroll", updateViewport)
      viewportRef.current = null
    }
    let previousFrameAt = 0
    tracker.renderer.setAnimationLoop((now: number) => {
      const delta = previousFrameAt ? (now - previousFrameAt) / 1000 : 1 / 60
      previousFrameAt = now
      const active = activePageSlotRef.current?.id
      for (const record of records) {
        if (record.anchor.visible)
          record.lastPose.copy(record.anchor.group.matrix)
        const isActive =
          record.slot.id === active &&
          dismissedSlotRef.current !== active &&
          media.ready
        record.root.visible = isActive
        record.shadow.visible = isActive && media.profile.grounded
        if (isActive) {
          // Interpolate position/rotation/scale, never raw matrix elements (which shear).
          record.lastPose.decompose(
            desiredPosition,
            desiredRotation,
            desiredScale,
          )
          if (!record.poseReady) {
            record.root.position.copy(desiredPosition)
            record.root.quaternion.copy(desiredRotation)
            record.root.scale.copy(desiredScale)
            record.poseReady = true
          } else {
            const alpha = poseSmoothingAlpha(
              delta,
              record.root.position.distanceTo(desiredPosition) /
                Math.max(0.001, desiredScale.x),
              record.root.quaternion.angleTo(desiredRotation),
            )
            record.root.position.lerp(desiredPosition, alpha)
            record.root.quaternion.slerp(desiredRotation, alpha)
            record.root.scale.lerp(desiredScale, alpha)
          }
          record.root.updateWorldMatrix(true, false)
          tracker.camera.getWorldPosition(localCamera)
          record.root.worldToLocal(localCamera)
          localScreenUp
            .set(0, 1, 0)
            .transformDirection(tracker.camera.matrixWorld)
            .transformDirection(
              inverseAnchor.copy(record.root.matrixWorld).invert(),
            )
          const layout = record.layout
          const baseX = layout.baseX + record.offset.x
          const baseY = layout.baseY + record.offset.y
          const basis = getBillboardBasis(
            localCamera.x - baseX,
            localCamera.y - baseY,
            localCamera.z - layout.lift,
            localScreenUp.toArray(),
          )
          rightAxis.fromArray(basis.right)
          upAxis.fromArray(basis.up)
          normalAxis.fromArray(basis.normal)
          rotationMatrix.makeBasis(rightAxis, upAxis, normalAxis)
          record.mesh.quaternion.setFromRotationMatrix(rotationMatrix)
          const progress = Math.min(1, (now - record.enteredAt) / 260)
          const reveal = 1 - Math.pow(1 - progress, 3)
          const entryScale = 0.94 + reveal * 0.06
          let width = layout.width * entryScale
          let height = layout.height * entryScale
          const place = () => {
            record.mesh.scale.set(width, height, 1)
            record.mesh.position
              .set(baseX, baseY, layout.lift)
              .addScaledVector(upAxis, height / 2)
            record.mesh.updateWorldMatrix(true, false)
          }
          place()
          const viewport = viewportRef.current?.renderer
          const frame = viewportRef.current?.frame
          let fit = 1
          if (frame && viewport && viewport.width > 0 && frame.width > 0) {
            projectedFoot
              .set(baseX, baseY, layout.lift)
              .applyMatrix4(record.root.matrixWorld)
              .project(tracker.camera)
            const footX =
              viewport.left +
              ((projectedFoot.x + 1) * viewport.width) / 2 -
              frame.left
            const footY =
              viewport.top +
              ((1 - projectedFoot.y) * viewport.height) / 2 -
              frame.top
            for (const [x, y] of screenCorners) {
              projectedPoint
                .set(x, y, 0)
                .applyMatrix4(record.mesh.matrixWorld)
                .project(tracker.camera)
              const px =
                viewport.left +
                ((projectedPoint.x + 1) * viewport.width) / 2 -
                frame.left
              const py =
                viewport.top +
                ((1 - projectedPoint.y) * viewport.height) / 2 -
                frame.top
              const dx = px - footX
              const dy = py - footY
              if (dx > 1 && footX < frame.width * 0.96)
                fit = Math.min(fit, (frame.width * 0.96 - footX) / dx)
              if (dx < -1 && footX > frame.width * 0.04)
                fit = Math.min(fit, (frame.width * 0.04 - footX) / dx)
              if (dy < -1 && footY > frame.height * 0.14)
                fit = Math.min(fit, (frame.height * 0.14 - footY) / dy)
              if (dy > 1 && footY < frame.height * 0.86)
                fit = Math.min(fit, (frame.height * 0.86 - footY) / dy)
            }
          }
          fit = Math.max(0.25, fit)
          // Ease automatic fitting instead of changing size on every noisy pose.
          record.fitScale +=
            (fit - record.fitScale) *
            (1 - Math.exp(-Math.min(delta, 0.1) / 0.12))
          if (record.fitScale < 0.999) {
            width *= record.fitScale
            height *= record.fitScale
            place()
          }
          record.shadow.position.set(baseX, baseY, 0.003)
          record.shadow.scale.set(
            layout.shadowWidth * record.fitScale,
            layout.shadowDepth * record.fitScale,
            1,
          )
          media.material.opacity = reveal
          media.shadowMaterial.opacity = reveal * 0.65
        }
        if (isActive && media.nativeOverlayActive && !media.fallbackActive) {
          record.root.updateWorldMatrix(true, false)
          tracker.camera.updateWorldMatrix(true, false)
          positionNativeVideoOverlay(record, tracker, overlayCorners)
        }
        record.mesh.visible =
          isActive &&
          (media.fallbackActive ||
            !media.nativeOverlayActive ||
            !media.nativeOverlayPositioned)
      }
      if (
        (!active || dismissedSlotRef.current === active) &&
        media.nativeOverlayActive
      )
        hideNativeVideoOverlay(media, false)
      if (
        media.fallbackActive &&
        !media.packedActive &&
        media.currentVideo &&
        media.maskVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        if (
          Math.abs(
            media.maskVideo.currentTime - media.currentVideo.currentTime,
          ) > 0.08
        ) {
          media.maskVideo.currentTime = media.currentVideo.currentTime
        }
      }
      // VideoTexture schedules uploads on decoded frames via requestVideoFrameCallback.
      // Setting needsUpdate each display frame re-uploads the same 24fps image.
      tracker.renderer.render(tracker.scene, tracker.camera)
    })
  }

  function disposeTracker() {
    spatialPlayRequestRef.current += 1
    if (targetLostTimeoutRef.current !== null) {
      window.clearTimeout(targetLostTimeoutRef.current)
      targetLostTimeoutRef.current = null
    }
    scanLoopRef.current?.()
    scanLoopRef.current = null
    disposeARDetector()
    stageCleanupRef.current?.()
    stageCleanupRef.current = null
    modelReadyRef.current = false
    activePageSlotRef.current = null
    pendingQRRef.current = null
    const tracker = trackerRef.current
    trackerRef.current = null
    if (tracker) {
      tracker.renderer.setAnimationLoop(null)
      try {
        tracker.stop()
      } catch {
        /* A partially initialized tracker may not have a controller yet. */
      }
      tracker.renderer.dispose()
    }
    const media = spatialRef.current
    if (media) {
      for (const video of [media.video, media.colorVideo, media.maskVideo]) {
        video.pause()
        video.removeAttribute("src")
        video.load()
        video.remove()
      }
      media.material.dispose()
      media.texture.dispose()
      media.colorTexture.dispose()
      media.maskTexture.dispose()
      media.shadowTexture.dispose()
      media.shadowMaterial.dispose()
      media.nativeFrame.remove()
    }
    for (const record of planeRecordsRef.current) {
      record.mesh.geometry.dispose()
      record.shadow.geometry.dispose()
      record.root.removeFromParent()
    }
    planeRecordsRef.current = []
    hideNativeVideoOverlay(media || undefined)
    spatialRef.current = null
    cameraVideoRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    cameraLayerRef.current?.replaceChildren()
    videoOverlayRef.current?.replaceChildren()
  }

  useEffect(() => () => disposeTracker(), [])

  useEffect(() => {
    if (!selection?.box || !cameraVideoRef.current || !frameRef.current) {
      setBoxStyle(undefined)
      return
    }
    const camera = cameraVideoRef.current
    const frame = frameRef.current
    const update = () => {
      const rect = getCoverRect(
        selection.box!,
        camera.videoWidth,
        camera.videoHeight,
        frame.clientWidth,
        frame.clientHeight,
      )
      if (!rect) return setBoxStyle(undefined)
      setBoxStyle({
        left: `${(rect.left / frame.clientWidth) * 100}%`,
        top: `${(rect.top / frame.clientHeight) * 100}%`,
        width: `${(rect.width / frame.clientWidth) * 100}%`,
        height: `${(rect.height / frame.clientHeight) * 100}%`,
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(frame)
    camera.addEventListener("resize", update)
    window.addEventListener("resize", update)
    return () => {
      observer.disconnect()
      camera.removeEventListener("resize", update)
      window.removeEventListener("resize", update)
    }
  }, [selection, cameraOn])

  async function startCamera() {
    setError("")
    setStarting(true)
    chooseSelection(null)
    dismissedSlotRef.current = null
    setScannedQR("")
    setTrackedPageLabel("")
    setTrackerStatus("loading")
    setModelStatus("loading")
    setCameraOn(true)
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )
      const stream = await requestCameraStream()
      streamRef.current = stream
      const cameraTrack = stream.getVideoTracks()[0]
      const capabilities =
        cameraTrack?.getCapabilities?.() as MediaTrackCapabilities & {
          focusMode?: string[]
          exposureMode?: string[]
          torch?: boolean
        } | undefined
      setTorchSupported(Boolean(capabilities?.torch))
      setTorchOn(false)
      const automaticControls: Array<{
        focusMode?: string
        exposureMode?: string
      }> = []
      if (capabilities?.focusMode?.includes("continuous"))
        automaticControls.push({ focusMode: "continuous" })
      if (capabilities?.exposureMode?.includes("continuous"))
        automaticControls.push({ exposureMode: "continuous" })
      if (automaticControls.length && cameraTrack) {
        void cameraTrack
          .applyConstraints({
            advanced: automaticControls as MediaTrackConstraintSet[],
          })
          .catch(() => undefined)
      }
      const container = cameraLayerRef.current
      if (!container) throw new Error("Không tìm thấy vùng camera.")
      const [mindArModule, THREE] = await Promise.all([
        import("mind-ar/dist/mindar-image-three.prod.js"),
        import("three"),
      ])
      const MindARThree = mindArModule.MindARThree as unknown as new (
        options: Record<string, unknown>,
      ) => MindARInstance
      const targetSrc = import.meta.env.DEV
        ? "/ar/book-pages.mind"
        : "/ar/book-pages.mind.br"
      const tracker = new MindARThree({
        container,
        imageTargetSrc: targetSrc,
        maxTrack: 1,
        uiLoading: "no",
        uiScanning: "no",
        uiError: "no",
        // MindAR's normal OneEuro response avoids a visibly trailing cutout.
        filterMinCF: 0.001,
        filterBeta: 1000,
        warmupTolerance: 5,
        missTolerance: 6,
      })
      trackerRef.current = tracker
      createTrackerScene(tracker, THREE)
      await startMindARWithStream(tracker, stream)
      cameraVideoRef.current = tracker.video
      setCameraSize(
        `${tracker.video.videoWidth} × ${tracker.video.videoHeight}`,
      )
      setTrackerStatus("ready")
      beginScanLoop(tracker.video)
      setStarting(false)

      try {
        await detectBookTarget(
          tracker.video,
          classNames.length,
          detectionConfidence,
        )
        if (trackerRef.current !== tracker) return
        modelReadyRef.current = true
        setModelStatus("ready")
      } catch (modelError) {
        if (trackerRef.current !== tracker) return
        console.warn(
          "Popup detector is unavailable; MindAR page tracking and QR fallback remain active.",
          modelError,
        )
        setModelStatus("unavailable")
      }
    } catch (cameraError) {
      disposeTracker()
      setCameraOn(false)
      setTorchSupported(false)
      setTorchOn(false)
      setTrackerStatus("idle")
      setModelStatus("idle")
      setError(cameraErrorMessage(cameraError))
      setStarting(false)
    }
  }

  function beginScanLoop(camera: HTMLVideoElement) {
    let active = true
    let detecting = false
    let lastDetectionAt = 0
    let lastQrAt = 0
    let lastQrLocationAt = 0
    let stablePopupKey = ""
    let stablePopupFrames = 0
    let popupDetection: ARDetection | null = null
    let qrBusy = false
    let qrWorker: Worker | null = null
    try {
      qrWorker = new Worker(new URL("../lib/arQr.worker.ts", import.meta.url), {
        type: "module",
      })
      qrWorker.onmessage = (
        event: MessageEvent<{ data: string | null; located: boolean }>,
      ) => {
        qrBusy = false
        if (!active) return
        const now = performance.now()
        if (event.data.located) lastQrLocationAt = now
        if (event.data.data) {
          const slot = routeSlotFromQR(
            event.data.data,
            slots,
            bookVideoManifest.publicOrigin,
          )
          if (
            slot?.arVideoUrl &&
            activePageSlotRef.current?.id !== slot.id &&
            qrFallbackRef.current !== slot.id
          ) {
            if (pendingQRRef.current?.slot.id !== slot.id) {
              pendingQRRef.current = { slot, foundAt: now }
              setScannedQR(slot.id)
            }
          }
        } else if (now - lastQrLocationAt > 1200 && qrFallbackRef.current) {
          qrFallbackRef.current = null
        }
      }
      qrWorker.onerror = () => {
        qrBusy = false
        qrWorker?.terminate()
        qrWorker = null
      }
    } catch (workerError) {
      console.warn(
        "QR worker is unavailable; image tracking remains active.",
        workerError,
      )
    }
    const canvas = captureCanvasRef.current || document.createElement("canvas")
    captureCanvasRef.current = canvas
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) {
      setError("Không thể khởi tạo bộ quét hình ảnh.")
      return
    }
    scanLoopRef.current = () => {
      active = false
      qrWorker?.terminate()
    }

    const frame = (now: number) => {
      if (!active) return
      if (
        camera.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !camera.videoWidth ||
        !camera.videoHeight
      ) {
        requestAnimationFrame(frame)
        return
      }
      if (
        qrWorker &&
        !qrBusy &&
        now - lastQrAt > (activePageSlotRef.current ? 1200 : 250)
      ) {
        lastQrAt = now
        const width = 480
        const height = Math.max(
          1,
          Math.round((camera.videoHeight / camera.videoWidth) * width),
        )
        if (canvas.width !== width) canvas.width = width
        if (canvas.height !== height) canvas.height = height
        context.drawImage(camera, 0, 0, width, height)
        const pixels = context.getImageData(0, 0, width, height).data.buffer
        qrBusy = true
        qrWorker.postMessage({ pixels, width, height }, [pixels])
      }

      if (
        modelReadyRef.current &&
        !detecting &&
        now - lastDetectionAt > 450 &&
        activePageSlotRef.current
      ) {
        lastDetectionAt = now
        detecting = true
        // Keep the QR fallback clock independent of an asynchronous inference.
        void (async () => {
          try {
            const page = activePageSlotRef.current
            if (!page) return
            const detections = await detectBookTarget(
              camera,
              classNames.length,
              detectionConfidence,
            )
            if (!active || activePageSlotRef.current?.id !== page.id) {
              popupDetection = null
              stablePopupFrames = 0
              return
            }
            const popup = detections.find(
              (item) =>
                classNames[item.classId]?.startsWith("popup_") &&
                slotFromDetection(item, page)?.arVideoUrl,
            )
            const popupSlot = popup ? slotFromDetection(popup, page) : null
            if (popup && popupSlot?.id === page.id) {
              const key = `${page.id}:${classNames[popup.classId]}`
              stablePopupFrames =
                key === stablePopupKey ? stablePopupFrames + 1 : 1
              stablePopupKey = key
              popupDetection = popup
              if (stablePopupFrames >= arTargetManifest.stableFramesRequired) {
                const current = selectionRef.current
                if (
                  current?.slot.id === page.id &&
                  (current.source !== "popup" ||
                    !current.box ||
                    Math.abs(current.box.x - popup.box.x) > 8 ||
                    Math.abs(current.box.y - popup.box.y) > 8)
                ) {
                  chooseSelection({
                    slot: page,
                    box: popup.box,
                    source: "popup",
                    score: popup.score,
                  })
                }
              }
            } else {
              stablePopupFrames = 0
              stablePopupKey = ""
              popupDetection = null
              const current = selectionRef.current
              if (current?.slot.id === page.id && current.source === "popup")
                chooseSelection({ slot: page, box: null, source: "page" })
            }
          } catch (modelError) {
            console.warn("Popup detection failed for this frame.", modelError)
            modelReadyRef.current = false
            setModelStatus("unavailable")
          } finally {
            detecting = false
          }
        })()
      }

      const pending = pendingQRRef.current
      if (
        pending &&
        !activePageSlotRef.current &&
        !popupDetection &&
        now - pending.foundAt >= 800 &&
        qrFallbackRef.current !== pending.slot.id
      ) {
        qrFallbackRef.current = pending.slot.id
        pendingQRRef.current = null
        dismissedSlotRef.current = null
        chooseSelection({ slot: pending.slot, box: null, source: "qr" })
        void findVideoAsset(pending.slot).then(setSelectedAsset)
      }
      if (active) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }

  function stopCamera() {
    disposeTracker()
    setCameraOn(false)
    chooseSelection(null)
    setSelectedAsset(null)
    setTrackedPageLabel("")
    setCameraSize("")
    setTorchSupported(false)
    setTorchOn(false)
    setTrackerStatus("idle")
    setModelStatus("idle")
    setScannedQR("")
    dismissedSlotRef.current = null
  }

  function toggleSound() {
    const next = !soundOn
    setSoundOn(next)
    const media = spatialRef.current
    if (media?.currentVideo) media.currentVideo.muted = !next
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track || !torchSupported) return
    const next = !torchOn
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      })
      setTorchOn(next)
    } catch (torchError) {
      console.warn("This camera cannot change its torch state.", torchError)
      setTorchSupported(false)
      setTorchOn(false)
    }
  }

  const targetLabel =
    selectedTarget?.label ||
    selection?.slot.label ||
    trackedPageLabel ||
    "Riko đang tìm trang sách"
  const cameraStatus = trackedPageLabel
    ? `Đã nhận ${trackedPageLabel}`
    : starting
      ? "Đang kết nối camera và chuẩn bị nhận diện 54 trang…"
      : trackerStatus === "loading"
        ? "Đang nạp mục tiêu ảnh của 54 trang…"
        : modelStatus === "unavailable"
          ? "Đưa trọn trang vào khung hình · QR là dự phòng"
          : "Đưa trọn trang vào khung hình · giữ yên 1–2 giây"
  const qrVideoSrc =
    selectedAsset?.alpha && isSafariOrIOS()
      ? selectedAsset.alphaColorUrl || selection?.slot.arVideoUrl || ""
      : selectedAsset?.alphaVideoUrl || selection?.slot.arVideoUrl || ""

  return (
    <main
      className={
        cameraOn
          ? "fixed inset-0 z-[60] h-[100dvh] w-screen overflow-clip bg-[#071320] p-0"
          : "mx-auto min-h-[70vh] max-w-[1120px] px-5 py-8 sm:px-8 sm:py-12"
      }
    >
      {!cameraOn && (
        <>
          <Link
            to="/book"
            className="inline-flex items-center gap-2 text-sm text-[#4A5461] hover:text-primary"
          >
            <ArrowLeft size={17} /> Về trang sách
          </Link>
          <div className="mx-auto mt-7 max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#E7F5F7] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary">
              <Camera size={15} /> Riko AR
            </span>
            <h1 className="mt-4 text-3xl font-bold text-primary sm:text-4xl">
              Đưa trọn trang sách vào khung hình
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#4A5461] sm:text-base">
              Đưa trang sách vào khung để nhân vật hiện ra trên sách. Di chuyển
              máy nhẹ nhàng để khám phá. Kéo một ngón để di chuyển nhân vật,
              chụm hoặc mở hai ngón để chỉnh kích thước.
            </p>
          </div>
        </>
      )}

      <div
        className={
          cameraOn
            ? "relative h-full w-full overflow-clip bg-[#142333]"
            : "mx-auto mt-8 max-w-4xl overflow-hidden rounded-[28px] border border-[#DFE5E8] bg-[#142333] shadow-xl"
        }
      >
        <div
          ref={frameRef}
          data-ar-stage="true"
          style={{
            touchAction: cameraOn ? "none" : "auto",
            userSelect: "none",
          }}
          className={`relative bg-[#142333] ${
            cameraOn
              ? "h-full w-full overflow-clip"
              : "aspect-video overflow-hidden"
          }`}
        >
          <div
            ref={cameraLayerRef}
            className={`absolute inset-0 ${cameraOn ? "block" : "hidden"}`}
          />
          {cameraOn && (
            <div
              ref={videoOverlayRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
            />
          )}
          {cameraOn && trackerStatus !== "ready" && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#071320] px-6 text-center text-white">
              <Camera size={42} className="text-[#A8D8E8]" />
              <p className="text-base font-semibold">
                {starting ? "Đang kết nối camera…" : "Đang nạp nhận diện AR…"}
              </p>
              <p className="max-w-sm text-sm leading-6 text-white/75">
                Màn hình quét đã mở toàn màn hình. Cho phép camera để hiện hình
                trực tiếp và bắt đầu nhận diện.
              </p>
            </div>
          )}
          {cameraOn && (
            <>
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-4 bg-gradient-to-b from-black/75 to-transparent px-4 pb-8 pt-4 text-white sm:px-6"
                style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold">Riko AR · camera sau</p>
                  <p className="mt-1 max-w-[75vw] text-xs text-white/90">
                    {cameraStatus}
                  </p>
                </div>
                <div className="pointer-events-auto flex shrink-0 items-center gap-2">
                  {torchSupported && (
                    <button
                      type="button"
                      onClick={() => void toggleTorch()}
                      className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-2 text-sm font-semibold text-white transition hover:bg-black/70"
                      aria-label={torchOn ? "Tắt đèn camera" : "Bật đèn camera"}
                    >
                      <Flashlight size={16} /> {torchOn ? "Tắt đèn" : "Bật đèn"}
                    </button>
                  )}
                  <Link
                    to="/"
                    className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-2 text-sm font-semibold text-white transition hover:bg-black/70"
                  >
                    <X size={17} /> Thoát
                  </Link>
                </div>
              </div>
              {!trackedPageLabel && (
                <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[68%] w-[82%] max-w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-2xl sm:h-[74%] sm:w-[56%]">
                  <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-[3px] border-t-[3px] border-white drop-shadow" />
                  <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-[3px] border-t-[3px] border-white drop-shadow" />
                  <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-[3px] border-l-[3px] border-white drop-shadow" />
                  <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-[3px] border-r-[3px] border-white drop-shadow" />
                  <span className="absolute inset-x-2 bottom-3 rounded-xl bg-black/60 px-3 py-2 text-center text-xs font-semibold text-white sm:text-sm">
                    Giữ trọn trang sách trong khung · tránh lóa · cách camera
                    khoảng 25–40 cm
                  </span>
                </div>
              )}
              {cameraOn && selection?.box && boxStyle && (
                <div
                  style={boxStyle}
                  className="pointer-events-none absolute z-20 rounded-xl border-[3px] border-[#FFD45B] shadow-[0_0_0_999px_rgba(4,20,36,.08)]"
                >
                  <span className="absolute -top-8 left-0 whitespace-nowrap rounded-full bg-[#173E72] px-3 py-1 text-xs font-bold text-white shadow">
                    Pop-up{" "}
                    {selection.score
                      ? `· ${Math.round(selection.score * 100)}%`
                      : "đã nhận"}
                  </span>
                </div>
              )}
              {cameraOn && error && (
                <div
                  role="alert"
                  className="absolute inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-red-950/90 px-4 py-3 text-sm font-semibold text-white shadow-xl"
                  style={{
                    bottom:
                      "max(5rem, calc(env(safe-area-inset-bottom) + 4rem))",
                  }}
                >
                  <span>{error}</span>
                  <button
                    type="button"
                    className="shrink-0 rounded-full bg-white/15 px-3 py-2 text-xs"
                    onClick={() => {
                      const slot =
                        selectionRef.current?.slot || activePageSlotRef.current
                      if (slot) void showSpatialVideo(slot)
                    }}
                  >
                    Thử lại
                  </button>
                </div>
              )}
              {selection && selection.source !== "qr" && (
                <div
                  data-ar-controls="true"
                  className="absolute bottom-5 left-1/2 z-30 flex max-w-[94vw] -translate-x-1/2 flex-col gap-2 rounded-2xl bg-[#173E72]/95 px-4 py-3 text-xs font-semibold text-white shadow-lg backdrop-blur-sm"
                  style={{
                    bottom: "max(1.25rem, env(safe-area-inset-bottom))",
                  }}
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="max-w-[54vw] truncate">{targetLabel}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleSound}
                        className="rounded-full p-1 hover:bg-white/15"
                        aria-label={
                          soundOn ? "Tắt tiếng video AR" : "Bật tiếng video AR"
                        }
                      >
                        {soundOn ? (
                          <Volume2 size={16} />
                        ) : (
                          <VolumeX size={16} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          dismissedSlotRef.current = selection.slot.id
                          spatialPlayRequestRef.current += 1
                          chooseSelection(null)
                          spatialRef.current?.currentVideo?.pause()
                          spatialRef.current?.maskVideo.pause()
                          hideNativeVideoOverlay()
                        }}
                        className="rounded-full p-1 hover:bg-white/15"
                        aria-label="Ẩn video AR"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-3 border-t border-white/15 pt-2">
                    <span className="text-white/75">Kích thước</span>
                    <button
                      type="button"
                      onClick={() => changePresentationScale(-0.25)}
                      disabled={presentationScale <= MIN_AR_SCALE}
                      aria-label="Thu nhỏ video AR"
                      className="rounded-full bg-white/15 p-2 disabled:opacity-30"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-10 text-center tabular-nums">
                      {Math.round(presentationScale * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => changePresentationScale(0.25)}
                      disabled={presentationScale >= MAX_AR_SCALE}
                      aria-label="Phóng to video AR"
                      className="rounded-full bg-white/15 p-2 disabled:opacity-30"
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={resetPresentation}
                      aria-label="Đặt lại vị trí và kích thước AR"
                      className="rounded-full bg-white/15 p-2"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                  <p className="text-center text-[10px] font-normal text-white/75">
                    Kéo để di chuyển · Chụm hai ngón để thu phóng
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={stopCamera}
                className="absolute left-3 top-20 z-30 inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-2 text-xs font-semibold text-white hover:bg-black/75 sm:bottom-4 sm:left-4 sm:top-auto"
              >
                <RotateCcw size={15} /> Dừng camera
              </button>
              {scannedQR && !selection && (
                <span
                  className="absolute bottom-5 right-3 z-20 rounded-full bg-black/65 px-3 py-2 text-xs text-white"
                  style={{
                    bottom: "max(1.25rem, env(safe-area-inset-bottom))",
                  }}
                >
                  Đã đọc QR · chờ nhận ảnh 0,8 giây
                </span>
              )}
            </>
          )}
          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center text-white">
              <Camera size={48} className="text-[#A8D8E8]" />
              <p className="mt-4 text-lg font-semibold">
                Khung camera hiển thị toàn màn hình
              </p>
              <p className="mt-2 max-w-md text-sm text-white/75">
                Cho phép camera sau, đưa trọn một trang sách vào khung và giữ
                yên để MindAR khóa hình.
              </p>
              <button
                type="button"
                onClick={startCamera}
                disabled={starting}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#F45B40] px-6 py-3 font-semibold text-white transition hover:bg-[#dc4c33] disabled:opacity-60"
              >
                <Camera size={18} />{" "}
                {starting ? "Đang mở camera…" : "Bắt đầu quét"}
              </button>
            </div>
          )}
          {cameraOn &&
            selection?.source === "qr" &&
            selection.slot.arVideoUrl && (
              <div className="absolute inset-x-3 bottom-3 z-20 max-h-[55dvh] overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:w-[min(42%,420px)]">
                <div className="flex items-center justify-between gap-3 bg-[#173E72] px-3 py-2 text-white">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{targetLabel}</p>
                    <p className="text-[11px] text-white/75">
                      QR dự phòng · chưa khóa được trang
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      chooseSelection(null)
                      qrFallbackRef.current = null
                    }}
                    className="rounded-full p-1.5 hover:bg-white/15"
                    aria-label="Đóng video"
                  >
                    <X size={17} />
                  </button>
                </div>
                <video
                  key={`${selection.slot.id}:${qrVideoSrc}`}
                  src={qrVideoSrc}
                  autoPlay
                  loop
                  playsInline
                  muted={!soundOn}
                  controls
                  className="aspect-video w-full bg-black object-contain"
                />
                <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-[#596575]">
                  <button
                    type="button"
                    onClick={toggleSound}
                    className="inline-flex items-center gap-1.5 font-semibold text-primary"
                  >
                    {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}{" "}
                    {soundOn ? "Tắt tiếng" : "Bật tiếng"}
                  </button>
                  <Link
                    to={`/watch/${selection.slot.id}`}
                    className="shrink-0 font-semibold text-primary underline underline-offset-2"
                  >
                    Mở trang video
                  </Link>
                </div>
              </div>
            )}
        </div>
        <canvas ref={captureCanvasRef} className="hidden" aria-hidden="true" />
        {!cameraOn && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-4 sm:px-6">
            <p className="text-xs leading-5 text-[#596575]">
              Dùng sách thật, giữ trọn trang trong khung hình và tránh ánh phản
              chiếu. Nhân vật sẽ hiện ra ngay khi trang được nhận diện.
            </p>
            <div className="flex gap-2">
              <Link
                to="/book"
                className="inline-flex items-center gap-2 rounded-full border border-[#D9E0E5] px-4 py-2 text-sm font-semibold text-primary hover:bg-[#F5F8FA]"
              >
                Xem sách
              </Link>
            </div>
          </div>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="mx-auto mt-4 max-w-3xl rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {selection &&
        selectedAsset?.alpha &&
        isSafariOrIOS() &&
        selection.source === "qr" && (
          <p className="mx-auto mt-3 max-w-3xl text-center text-xs text-[#6B7480]">
            Safari dùng clip màu MP4 ở thẻ dự phòng; khi trang được khóa, video
            alpha được ghép trực tiếp lên sách.
          </p>
        )}
      {!cameraOn && (
        <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-5 text-[#6B7480]">
          Trên iPhone hãy mở bằng Safari và cho phép camera. Hãy bật đủ sáng,
          tránh ánh phản chiếu và giữ nguyên trang khoảng 1–2 giây.
        </p>
      )}
    </main>
  )
}
