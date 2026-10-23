import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import {
  ArrowLeft,
  Camera,
  Flashlight,
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
  Scene,
  Texture,
  WebGLRenderer,
} from "three"
import jsQR from "jsqr"
import bookVideoManifest from "../data/bookVideoSlots.json"
import arTargetManifest from "../data/arTargets.json"
import mindArTargetManifest from "../data/arPageTargets.json"
import { detectBookTarget, type ARDetection } from "../lib/arDetector"
import { getCoverRect } from "../lib/arScanGeometry"
import { resolveSlotFromLabel, routeSlotFromQR } from "../lib/arScanLogic.js"

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
  mesh: Mesh
  slot: BookSlot
  target: MindARPageTarget
}
type SpatialMedia = {
  video: HTMLVideoElement
  colorVideo: HTMLVideoElement
  maskVideo: HTMLVideoElement
  texture: Texture
  colorTexture: Texture
  maskTexture: Texture
  material: MeshBasicMaterial
  currentVideo: HTMLVideoElement | null
  fallbackActive: boolean
  nativeOverlayActive: boolean
  nativeOverlayPositioned: boolean
  lastTextureTime: number
}

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
const TRACKED_VIDEO_SCALE = 1.35
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
      () => finishWithError(new Error("Video không tạo được khung hình đầu tiên.")),
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
  const modelReadyRef = useRef(false)
  const activePageSlotRef = useRef<BookSlot | null>(null)
  const targetLostTimeoutRef = useRef<number | null>(null)
  const pendingQRRef = useRef<PendingQR | null>(null)
  const qrFallbackRef = useRef<string | null>(null)
  const dismissedSlotRef = useRef<string | null>(null)
  const spatialPlayRequestRef = useRef(0)
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
    const { left, top, right, bottom } = record.target.overlayBox
    const { width: targetWidth, height: targetHeight } =
      record.target.targetSize
    // MindAR's post matrix scales every image target to one world unit wide.
    // targetSize is in source-image pixels, so only its aspect ratio belongs
    // in anchor-local coordinates.
    const normalizedTargetHeight = targetHeight / targetWidth
    const maxWidth = Math.max(0.001, right - left)
    const maxHeight = Math.max(0.001, (bottom - top) * normalizedTargetHeight)
    let width = maxWidth
    let height = maxHeight
    if (width / height > aspect) width = height * aspect
    else height = width / aspect
    width *= TRACKED_VIDEO_SCALE
    height *= TRACKED_VIDEO_SCALE
    record.mesh.scale.set(width, height, 1)
    record.mesh.position.set(
      (left + right) / 2 - 0.5,
      (0.5 - (top + bottom) / 2) * normalizedTargetHeight,
      0.012,
    )
  }

  function hideNativeVideoOverlay(
    media = spatialRef.current,
    deactivate = true,
  ) {
    if (!media) return
    if (deactivate) media.nativeOverlayActive = false
    media.nativeOverlayPositioned = false
    media.video.style.opacity = "0"
    media.video.style.transform = "translate3d(-10000px, -10000px, 0)"
  }

  function positionNativeVideoOverlay(
    record: PlaneRecord,
    tracker: MindARInstance,
    THREE: typeof import("three"),
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

    const viewport = tracker.renderer.domElement.getBoundingClientRect()
    const overlayRect = overlay.getBoundingClientRect()
    if (
      viewport.width < 1 ||
      viewport.height < 1 ||
      overlayRect.width < 1 ||
      overlayRect.height < 1
    )
      return hideNativeVideoOverlay(media, false)

    const { left, top, right, bottom } = record.target.overlayBox
    const { width: targetWidth, height: targetHeight } = record.target.targetSize
    const normalizedTargetHeight = targetHeight / targetWidth
    const maxWidth = Math.max(0.001, right - left)
    const maxHeight = Math.max(
      0.001,
      (bottom - top) * normalizedTargetHeight,
    )
    const aspect = video.videoWidth / video.videoHeight
    let width = maxWidth
    let height = maxHeight
    if (width / height > aspect) width = height * aspect
    else height = width / aspect
    width *= TRACKED_VIDEO_SCALE
    height *= TRACKED_VIDEO_SCALE
    const centerX = (left + right) / 2 - 0.5
    const centerY = (0.5 - (top + bottom) / 2) * normalizedTargetHeight
    const corners = [
      [centerX - width / 2, centerY + height / 2],
      [centerX + width / 2, centerY + height / 2],
      [centerX + width / 2, centerY - height / 2],
      [centerX - width / 2, centerY - height / 2],
    ].map(([x, y]) => {
      const point = new THREE.Vector3(x, y, 0.012)
        .applyMatrix4(record.anchor.group.matrixWorld)
        .project(tracker.camera)
      return {
        x: viewport.left + ((point.x + 1) / 2) * viewport.width - overlayRect.left,
        y: viewport.top + ((1 - point.y) / 2) * viewport.height - overlayRect.top,
        z: point.z,
      }
    })
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

    // Map the native video rectangle to the projected page quadrilateral.
    // This keeps its corners attached while the book is tilted or rotated.
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
    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
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
    if (video.style.transform !== transform) video.style.transform = transform
    if (video.style.width !== videoWidth) video.style.width = videoWidth
    if (video.style.height !== videoHeight) video.style.height = videoHeight
    if (video.style.opacity !== "1") video.style.opacity = "1"
    media.nativeOverlayPositioned = true
  }

  async function showSpatialVideo(slot: BookSlot) {
    const media = spatialRef.current
    if (!media || !slot.arVideoUrl) return
    const requestId = ++spatialPlayRequestRef.current
    const isCurrentRequest = () =>
      spatialRef.current === media &&
      spatialPlayRequestRef.current === requestId &&
      activePageSlotRef.current?.id === slot.id
    setError("")
    const asset = await findVideoAsset(slot)
    if (!isCurrentRequest()) return
    setSelectedAsset(asset)
    hideNativeVideoOverlay(media)
    const safari = isSafariOrIOS()
    const hasSplitAlpha = Boolean(
      asset.alpha && asset.alphaColorUrl && asset.alphaMaskUrl,
    )
    media.fallbackActive = Boolean(hasSplitAlpha && safari)
    media.video.pause()
    media.colorVideo.pause()
    media.maskVideo.pause()
    media.video.muted = true
    media.colorVideo.muted = true
    media.maskVideo.muted = true
    media.lastTextureTime = -1

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
      media.material.map = media.colorTexture
      media.material.alphaMap = media.maskTexture
      media.material.transparent = true
      media.currentVideo = media.colorVideo
      await Promise.all([
        playTexture(media.colorVideo, media.colorTexture, colorUrl),
        playTexture(media.maskVideo, media.maskTexture, maskUrl),
      ])
    }
    const playNative = async () => {
      const source = asset.alpha && asset.alphaVideoUrl
        ? asset.alphaVideoUrl
        : asset.url
      if (!source) throw new Error("Thiếu đường dẫn video AR.")
      media.fallbackActive = false
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
        await playSplitAlpha()
      }
    }

    try {
      if (media.fallbackActive) await playSplitAlpha()
      else await playNative()
    } catch (playError) {
      if (!isCurrentRequest()) return
      console.warn("AR video playback failed; trying the compatible source.", playError)
      media.video.pause()
      media.colorVideo.pause()
      media.maskVideo.pause()
      try {
        if (hasSplitAlpha && !media.fallbackActive) await playSplitAlpha()
        else if (hasSplitAlpha && safari) await playNative()
        else throw playError
      } catch (fallbackError) {
        if (!isCurrentRequest()) return
        console.error("No AR video source could be played.", fallbackError)
        setError("Video AR chưa phát được trên trình duyệt này. Hãy thử tải lại trang hoặc chạm bắt đầu quét lại.")
        return
      }
    }
    if (!isCurrentRequest()) return
    media.material.needsUpdate = true
    media.nativeOverlayActive =
      !media.fallbackActive && media.currentVideo === media.video
    if (!media.nativeOverlayActive) hideNativeVideoOverlay(media)
    const activeVideo = media.currentVideo
    const resize = () => {
      const ratio =
        activeVideo?.videoWidth && activeVideo.videoHeight
          ? activeVideo.videoWidth / activeVideo.videoHeight
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
      toneMapped: false,
    })
    const media: SpatialMedia = {
      video,
      colorVideo,
      maskVideo,
      texture,
      colorTexture,
      maskTexture,
      material,
      currentVideo: null,
      fallbackActive: false,
      nativeOverlayActive: false,
      nativeOverlayPositioned: false,
      lastTextureTime: -1,
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
          willChange: "transform",
          zIndex: "1",
        })
        videoOverlayRef.current?.append(element)
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
      const geometry = new THREE.PlaneGeometry(1, 1)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.renderOrder = 5
      mesh.visible = true
      const record = { anchor, mesh, slot, target }
      resizePlane(
        record,
        slot.arVideoUrl.endsWith("/RIKO.webm") ? 9 / 16 : 16 / 9,
      )
      anchor.group.add(mesh)
      records.push(record)

      anchor.onTargetFound = () => {
        const previous = activePageSlotRef.current
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
          if (previous?.id !== slot.id) void showSpatialVideo(slot)
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
    tracker.renderer.setAnimationLoop(() => {
      const active = activePageSlotRef.current?.id
      for (const record of records) {
        const isActive =
          record.slot.id === active && dismissedSlotRef.current !== active
        if (isActive && media.nativeOverlayActive && !media.fallbackActive) {
          record.anchor.group.updateWorldMatrix(true, false)
          tracker.camera.updateWorldMatrix(true, false)
          positionNativeVideoOverlay(record, tracker, THREE)
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
      const currentVideo = media.currentVideo
      if (
        currentVideo &&
        currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        currentVideo.videoWidth > 0 &&
        currentVideo.currentTime !== media.lastTextureTime
      ) {
        if (media.fallbackActive) {
          media.colorTexture.needsUpdate = true
          media.maskTexture.needsUpdate = true
        } else if (
          !media.nativeOverlayActive ||
          !media.nativeOverlayPositioned
        ) {
          media.texture.needsUpdate = true
        }
        media.lastTextureTime = currentVideo.currentTime
      }
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
    }
    for (const record of planeRecordsRef.current) record.mesh.geometry.dispose()
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
        filterMinCF: 0.0001,
        filterBeta: 0.001,
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
        modelReadyRef.current = true
        setModelStatus("ready")
      } catch (modelError) {
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
    const canvas = captureCanvasRef.current || document.createElement("canvas")
    captureCanvasRef.current = canvas
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) {
      setError("Không thể khởi tạo bộ quét hình ảnh.")
      return
    }
    scanLoopRef.current = () => {
      active = false
    }

    const frame = async (now: number) => {
      if (!active) return
      if (
        camera.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !camera.videoWidth ||
        !camera.videoHeight
      ) {
        requestAnimationFrame(frame)
        return
      }
      if (now - lastQrAt > 350) {
        lastQrAt = now
        const width = 480
        const height = Math.max(
          1,
          Math.round((camera.videoHeight / camera.videoWidth) * width),
        )
        canvas.width = width
        canvas.height = height
        context.drawImage(camera, 0, 0, width, height)
        const decoded = jsQR(
          context.getImageData(0, 0, width, height).data,
          width,
          height,
          { inversionAttempts: "attemptBoth" },
        )
        if (decoded?.location) lastQrLocationAt = now
        if (decoded) {
          const slot = routeSlotFromQR(
            decoded.data,
            slots,
            bookVideoManifest.publicOrigin,
          )
          if (
            slot?.arVideoUrl &&
            activePageSlotRef.current?.id !== slot.id &&
            qrFallbackRef.current !== slot.id
          ) {
            const pending = pendingQRRef.current
            if (pending?.slot.id !== slot.id) {
              pendingQRRef.current = { slot, foundAt: now }
              setScannedQR(slot.id)
            }
          }
        } else if (now - lastQrLocationAt > 1200 && qrFallbackRef.current) {
          qrFallbackRef.current = null
        }
      }

      if (
        modelReadyRef.current &&
        !detecting &&
        now - lastDetectionAt > 450 &&
        activePageSlotRef.current
      ) {
        lastDetectionAt = now
        detecting = true
        try {
          const page = activePageSlotRef.current
          const detections = await detectBookTarget(
            camera,
            classNames.length,
            detectionConfidence,
          )
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
          ? "fixed inset-0 z-[60] h-[100dvh] w-screen overflow-hidden bg-[#071320] p-0"
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
              <Camera size={15} /> Riko AR · MindAR
            </span>
            <h1 className="mt-4 text-3xl font-bold text-primary sm:text-4xl">
              Đưa trọn trang sách vào khung hình
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#4A5461] sm:text-base">
              MindAR khóa và bám theo trang sách để đặt video đúng vị trí. Bộ
              nhận diện pop-up chạy bổ sung; QR chỉ mở video nếu hình chưa được
              nhận ra sau 0,8 giây.
            </p>
          </div>
        </>
      )}

      <div
        className={
          cameraOn
            ? "relative h-full w-full overflow-hidden bg-[#142333]"
            : "mx-auto mt-8 max-w-4xl overflow-hidden rounded-[28px] border border-[#DFE5E8] bg-[#142333] shadow-xl"
        }
      >
        <div
          ref={frameRef}
          className={`relative overflow-hidden bg-[#142333] ${
            cameraOn ? "h-full w-full" : "aspect-video"
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
                  <p className="text-sm font-bold">
                    Riko AR · camera sau{" "}
                    {cameraSize && (
                      <span className="font-normal text-white/75">
                        {cameraSize}
                      </span>
                    )}
                  </p>
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
                    bottom: "max(5rem, calc(env(safe-area-inset-bottom) + 4rem))",
                  }}
                >
                  <span>{error}</span>
                  <button
                    type="button"
                    className="shrink-0 rounded-full bg-white/15 px-3 py-2 text-xs"
                    onClick={() => {
                      const slot = selectionRef.current?.slot || activePageSlotRef.current
                      if (slot) void showSpatialVideo(slot)
                    }}
                  >
                    Thử lại
                  </button>
                </div>
              )}
              {selection && selection.source !== "qr" && (
                <div
                  className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#173E72]/95 px-3 py-2 text-xs font-semibold text-white shadow-lg"
                  style={{
                    bottom: "max(1.25rem, env(safe-area-inset-bottom))",
                  }}
                >
                  <span className="max-w-[46vw] truncate">{targetLabel}</span>
                  {selectedAsset?.alpha && (
                    <span className="rounded-full bg-emerald-300/20 px-2 py-0.5 text-emerald-100">
                      alpha
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={toggleSound}
                    className="rounded-full p-1 hover:bg-white/15"
                    aria-label={
                      soundOn ? "Tắt tiếng video AR" : "Bật tiếng video AR"
                    }
                  >
                    {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
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
              MindAR dò ảnh cả 54 trang; mô hình TFLite bổ sung vùng pop-up. Bộ
              nhận diện ảnh chạy trong camera, không phải ảnh giả lập.
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
