import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  ExternalLink,
  LoaderCircle,
  Minus,
  Plus,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { Link } from "react-router"
import ARScanIntro from "./ARScanIntro"
import type {
  Camera as ThreeCamera,
  Group,
  Mesh,
  MeshBasicMaterial,
  Scene,
  Texture,
  WebGLRenderer,
} from "three"
import { installARGestures } from "../lib/arGestures"
import { configurePackedAlpha } from "../lib/arPackedMaterial"
import {
  getARPixelRatio,
  playARVideo,
  preferredARSource,
  setARVideoSource,
  type ARVideoAsset,
} from "../lib/arVideoPlayback.js"
import { createARPlaybackSession, getLockedVideoLayout } from "../lib/arPlaybackSession.js"
import { createRecognitionPause, type RecognitionController } from "../lib/arRecognitionPause.js"
import {
  clampARScale,
  MAX_AR_SCALE,
  MIN_AR_SCALE,
} from "../lib/arMotion.js"
import bookVideoManifest from "../data/bookVideoSlots.json"
import arTargetManifest from "../data/arTargets.json"
import mindArTargetManifest from "../data/arPageTargets.json"
import videoPresentations from "../data/arVideoPresentation.json"
import {
  detectBookTarget,
  disposeARDetector,
  warmARDetector,
  type ARDetection,
} from "../lib/arDetector"
import { PAGE_CONFIRMATION_WINDOW_MS, QR_FALLBACK_DELAY_MS, VISUAL_SCAN_INTERVAL_MS, createVisualConsensus, routeSlotFromQR, shouldWaitForPopupDetection, videoCandidates } from "../lib/arScanLogic.js"
import {
  DEFAULT_VIDEO_PRESENTATION,
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
type VideoAsset = ARVideoAsset
type MindARAnchor = {
  group: Group
  visible: boolean
  onTargetFound: (() => void) | null
  onTargetLost: (() => void) | null
}
type MindARInstance = {
  controller: RecognitionController
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
  shadow: Mesh
  offset: { x: number; y: number }
}
type SpatialMedia = {
  video: HTMLVideoElement
  colorVideo: HTMLVideoElement
  texture: Texture
  colorTexture: Texture
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

type StageViewport = { frame: DOMRect }

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
  video.autoplay = false
  video.muted = true
  video.loop = true
  video.playsInline = true
  video.setAttribute("playsinline", "")
  video.setAttribute("webkit-playsinline", "")
  return video
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

type ARScanRuntime = {
  loadTracker?: () => Promise<{ MindARThree: unknown }>
  detect?: typeof detectBookTarget
  warm?: () => Promise<void>
}

export default function ARScan({ runtime }: { runtime?: ARScanRuntime } = {}) {
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
  const modelWarmingRef = useRef(false)
  const modelWarmPromiseRef = useRef<Promise<void> | null>(null)
  const trackedCandidateRef = useRef<PendingQR | null>(null)
  const activePageSlotRef = useRef<BookSlot | null>(null)
  const pendingQRRef = useRef<PendingQR | null>(null)
  const qrFallbackRef = useRef<string | null>(null)
  const dismissedSlotRef = useRef<string | null>(null)
  const spatialPlayRequestRef = useRef(0)
  const presentationScaleRef = useRef(1)
  const selectionRef = useRef<Selection | null>(null)
  const videoManifestRef = useRef<Promise<VideoAsset[]> | null>(null)
  const videoAssetCacheRef = useRef<VideoAsset[]>([])
  const playbackSessionRef = useRef(createARPlaybackSession())
  const soundOnRef = useRef(true)
  const recognitionPauseRef = useRef<ReturnType<typeof createRecognitionPause> | null>(null)
  const presentStageRef = useRef<(() => void) | null>(null)
  const followVideoRef = useRef<(() => void) | null>(null)
  const cameraSessionRef = useRef(0)
  const openedAtRef = useRef(0)
  const dismissedSourceRef = useRef<Selection["source"] | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState("")
  const [trackerStatus, setTrackerStatus] =
    useState<"idle" | "loading" | "ready">("idle")
  const [modelStatus, setModelStatus] =
    useState<"idle" | "loading" | "ready" | "unavailable">("idle")
  const [selection, setSelection] = useState<Selection | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<VideoAsset | null>(null)
  const [soundOn, setSoundOn] = useState(true)
  const [mediaStatus, setMediaStatus] = useState<"idle" | "loading" | "ready" | "buffering" | "error">("idle")
  const [presentationScale, setPresentationScale] = useState(1)

  useEffect(() => {
    if (!cameraOn) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = previousOverflow }
  }, [cameraOn])

  function chooseSelection(next: Selection | null) {
    selectionRef.current = next
    setSelection(next)
    presentStageRef.current?.()
  }

  function pauseRecognition() {
    scanLoopRef.current?.()
    scanLoopRef.current = null
    pendingQRRef.current = null
    recognitionPauseRef.current?.pause()
    trackedCandidateRef.current = null
    // Keep the worker warm: a lifted popup on the next scan may not match
    // the printed page. Only camera teardown disposes its compiled model.
  }

  function openARVideo(next: Selection) {
    if (!next.slot.arVideoUrl || playbackSessionRef.current.open(next.slot.id) === null) return
    openedAtRef.current = performance.now()
    if (frameRef.current) delete frameRef.current.dataset.arFirstFrameMs
    activePageSlotRef.current = next.source === "qr" ? null : next.slot
    pendingQRRef.current = null
    soundOnRef.current = true
    setSoundOn(true)
    setMediaStatus("loading")
    presentationScaleRef.current = 1
    setPresentationScale(1)
    for (const record of planeRecordsRef.current) record.offset = { x: 0, y: 0 }
    chooseSelection(next)
    pauseRecognition()
    if (next.source !== "qr") void showSpatialVideo(next.slot)
    else setSelectedAsset(cachedVideoAsset(next.slot))
  }

  async function closeARVideo() {
    if (!playbackSessionRef.current.close()) return
    const tracker = trackerRef.current
    const camera = cameraVideoRef.current
    const generation = playbackSessionRef.current.snapshot().generation
    dismissedSlotRef.current = selectionRef.current?.slot.id || null
    dismissedSourceRef.current = selectionRef.current?.source || null
    spatialPlayRequestRef.current++
    const media = spatialRef.current
    if (media) {
      media.ready = false
      for (const video of [media.video, media.colorVideo]) video.pause()
    }
    hideNativeVideoOverlay()
    followVideoRef.current?.()
    activePageSlotRef.current = null
    pendingQRRef.current = null
    qrFallbackRef.current = null
    setSelectedAsset(null)
    setMediaStatus("idle")
    setError("")
    chooseSelection(null)
    for (const record of planeRecordsRef.current) {
      record.anchor.visible = false
      record.anchor.group.visible = false
    }
    if (!tracker || !camera) return
    const stillScanning = () => trackerRef.current === tracker &&
      playbackSessionRef.current.canScan() &&
      playbackSessionRef.current.snapshot().generation === generation
    await recognitionPauseRef.current?.resume(camera, stillScanning)
    if (stillScanning()) beginScanLoop(camera)
  }

  function videoAssets() {
    if (!videoManifestRef.current) {
      videoManifestRef.current = fetch("/videos/ar/manifest.json?v=native-v3", {
        cache: "no-cache",
      }).then(async (response) => {
        if (!response.ok) throw new Error("Could not load AR video manifest")
        const assets = (await response.json()) as VideoAsset[]
        videoAssetCacheRef.current = assets
        return assets
      }).catch((cause) => {
        videoManifestRef.current = null
        throw cause
      })
    }
    return videoManifestRef.current
  }

  function cachedVideoAsset(slot: BookSlot): VideoAsset {
    const id = slot.arTargetId || slot.arVideoUrl?.split("/").pop()?.replace(/\.webm$/, "") || slot.id
    const profile = (videoPresentations as Record<string, VideoPresentation>)[id]
    return videoAssetCacheRef.current.find(item => item.id === id) || {
      id,
      url: slot.arVideoUrl || "",
      alpha: Boolean(profile?.packedVideoUrl),
      packedVideoUrl: profile?.packedVideoUrl,
      compatiblePackedVideoUrl: profile?.compatiblePackedVideoUrl,
      previewVideoUrl: profile?.previewVideoUrl,
    }
  }

  function preloadCandidate(slot: BookSlot) {
    const media = spatialRef.current
    if (!media || !playbackSessionRef.current.canScan() || !slot.arVideoUrl) return
    const id = slot.arTargetId || slot.arVideoUrl.split("/").pop()?.replace(/\.webm$/, "") || slot.id
    const profile = (videoPresentations as Record<string, VideoPresentation>)[id]
    if (!profile) return
    const source = preferredARSource({ id, url: slot.arVideoUrl, alpha: true }, profile)
    const video = source.kind === "packed" ? media.colorVideo : media.video
    // preload=auto decodes the first frame without playing audio or starting a second clock.
    setARVideoSource(video, source.url, window.location.origin)
  }

  function resizePlane(record: PlaneRecord, _aspect: number) {
    const crop = spatialRef.current?.profile.bounds || DEFAULT_VIDEO_PRESENTATION.bounds
    const uv = record.mesh.geometry.attributes.uv
    uv.setXY(0, crop.left, 1 - crop.top)
    uv.setXY(1, crop.right, 1 - crop.top)
    uv.setXY(2, crop.left, 1 - crop.bottom)
    uv.setXY(3, crop.right, 1 - crop.bottom)
    uv.needsUpdate = true
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
    const record = planeRecordsRef.current.find(item => item.slot.id === selectionRef.current?.slot.id)
    if (record) resizePlane(record, aspect)
    presentStageRef.current?.()
  }

  function resetPresentation() {
    for (const record of planeRecordsRef.current) record.offset = { x: 0, y: 0 }
    changePresentationScale(1 - presentationScaleRef.current)
    presentStageRef.current?.()
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

  async function showSpatialVideo(slot: BookSlot) {
    const media = spatialRef.current
    if (!media || !slot.arVideoUrl) return
    const requestId = ++spatialPlayRequestRef.current
    media.ready = false
    setMediaStatus("loading")
    const isCurrentRequest = () =>
      spatialRef.current === media &&
      spatialPlayRequestRef.current === requestId &&
      activePageSlotRef.current?.id === slot.id
    setError("")
    // Recognition already identifies the media URL. A slow manifest request
    // must not block playback of the bundled, versioned source.
    const asset = cachedVideoAsset(slot)
    if (!isCurrentRequest()) return
    media.profile =
      (videoPresentations as Record<string, VideoPresentation>)[asset.id] ||
      DEFAULT_VIDEO_PRESENTATION
    setSelectedAsset(asset)
    hideNativeVideoOverlay(media)
    const hasAlpha = Boolean(asset.alpha)
    const nativeScene = media.profile.mode === "scene"
    const preferred = preferredARSource(asset, media.profile)
    media.fallbackActive = preferred.kind === "packed"
    media.packedActive = false
    media.video.pause()
    media.colorVideo.pause()
    media.video.muted = !soundOnRef.current
    media.colorVideo.muted = !soundOnRef.current

    const playTexture = async (
      video: HTMLVideoElement,
      texture: Texture,
      url: string,
    ) => {
      setARVideoSource(video, url, window.location.origin)
      try {
        await playARVideo(video)
      } catch (cause) {
        if (cause instanceof Error && cause.name === "NotAllowedError" && !video.muted) {
          soundOnRef.current = false
          setSoundOn(false)
          video.muted = true
          await playARVideo(video)
        } else {
          throw cause
        }
      }
      texture.needsUpdate = true
    }
    const playCompatibleAlpha = async () => {
      const packed = asset.packedVideoUrl || media.profile.packedVideoUrl
      if (!packed) throw new Error("Không có video nền trong suốt tương thích.")
      const sources = [...new Set([packed, asset.compatiblePackedVideoUrl].filter(Boolean))] as string[]
      let lastError: unknown
      for (const source of sources) {
        media.fallbackActive = true
        media.packedActive = true
        media.packedAlpha.value = 1
        media.colorTexture.repeat.set(0.5, 1)
        media.material.map = media.colorTexture
        media.material.alphaMap = null
        media.material.transparent = true
        media.currentVideo = media.colorVideo
        try {
          await playTexture(media.colorVideo, media.colorTexture, source)
          return
        } catch (cause) {
          if (!isCurrentRequest()) throw cause
          lastError = cause
          media.colorVideo.pause()
        }
      }
      throw lastError
    }
    const playNative = async () => {
      const source =
        nativeScene
          ? asset.previewVideoUrl || asset.alphaColorUrl || asset.alphaVideoUrl || asset.url
          : asset.alpha && asset.alphaVideoUrl ? asset.alphaVideoUrl : asset.url
      if (!source) throw new Error("Thiếu đường dẫn video AR.")
      media.fallbackActive = false
      media.packedActive = false
      media.packedAlpha.value = 0
      media.material.map = media.texture
      media.material.alphaMap = null
      media.material.transparent = Boolean(asset.alpha)
      media.currentVideo = media.video
      await playTexture(media.video, media.texture, source)
      if (
        asset.alpha &&
        hasAlpha &&
        media.profile.mode !== "scene" &&
        media.profile.mode !== "mixed" &&
        !videoPreservesAlpha(media.video)
      ) {
        media.video.pause()
        throw new Error("Trình duyệt giải mã video này không giữ được nền trong suốt.")
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
      try {
        if (hasAlpha && !media.fallbackActive) await playCompatibleAlpha()
        else if (hasAlpha) await playNative()
        else throw playError
      } catch (fallbackError) {
        if (!isCurrentRequest()) return
        console.error("No AR video source could be played.", fallbackError)
        setMediaStatus("error")
        setError(
          "Video AR chưa phát được trên trình duyệt này. Hãy thử tải lại trang hoặc chạm bắt đầu quét lại.",
        )
        return
      }
    }
    if (!isCurrentRequest()) return
    media.material.needsUpdate = true
    media.ready = true
    setMediaStatus("ready")
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
    followVideoRef.current?.()
    presentStageRef.current?.()
  }

  function createTrackerScene(
    tracker: MindARInstance,
    THREE: typeof import("three"),
  ) {
    const video = makeVideoElement()
    const colorVideo = makeVideoElement()
    const texture = new THREE.VideoTexture(video)
    const colorTexture = new THREE.VideoTexture(colorVideo)
    for (const item of [texture, colorTexture]) {
      item.colorSpace = THREE.SRGBColorSpace
      item.minFilter = THREE.LinearFilter
      item.magFilter = THREE.LinearFilter
      item.generateMipmaps = false
    }
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
      texture,
      colorTexture,
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
    ] as const) {
      const refreshTexture = () => {
        if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
          textureToRefresh.needsUpdate = true
      }
      element.addEventListener("loadeddata", refreshTexture)
      element.addEventListener("playing", refreshTexture)
      const updatePlaybackStatus = () => {
        if (spatialRef.current !== media || !media.ready || media.currentVideo !== element) return
        setMediaStatus(element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ? "buffering" : "ready")
      }
      element.addEventListener("waiting", updatePlaybackStatus)
      element.addEventListener("stalled", updatePlaybackStatus)
      element.addEventListener("playing", updatePlaybackStatus)
      element.addEventListener("canplay", updatePlaybackStatus)
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
    const recordsById = new Map<string, PlaneRecord>()
    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, .1, 10)
    camera.position.z = 2
    let disposed = false, pendingPaint = 0, frameRequest = 0, fallbackFrame = 0, frameWatchdog = 0
    let followedVideo: HTMLVideoElement | null = null
    let visibleRecord: PlaneRecord | null = null
    let lastMediaTime = -1
    let renders = 0
    tracker.renderer.setAnimationLoop(null)
    tracker.renderer.setClearColor(0x000000, 0)
    tracker.renderer.setClearAlpha(0)

    const invalidate = () => {
      if (!disposed && !pendingPaint && !document.hidden)
        pendingPaint = requestAnimationFrame(paint)
    }
    const updateViewport = () => {
      const frame = frameRef.current
      const overlay = videoOverlayRef.current
      if (!frame || !overlay) return
      const rect = frame.getBoundingClientRect()
      viewportRef.current = { frame: rect }
      const ratio = getARPixelRatio(rect.width, rect.height, window.devicePixelRatio)
      if (tracker.renderer.getPixelRatio() !== ratio) tracker.renderer.setPixelRatio(ratio)
      const surface = tracker.renderer.domElement
      if (surface.width !== Math.floor(rect.width * ratio) || surface.height !== Math.floor(rect.height * ratio))
        tracker.renderer.setSize(rect.width, rect.height, false)
      // MindAR sizes its canvas for its perspective camera during start/resize.
      // This stage uses viewport pixels and must reset that CSS size as well.
      Object.assign(tracker.renderer.domElement.style, { width: "100%", height: "100%", left: "0", top: "0" })
      camera.right = rect.width; camera.top = rect.height
      camera.updateProjectionMatrix()
      invalidate()
    }

    function paint() {
      pendingPaint = 0
      if (disposed) return
      const rect = viewportRef.current?.frame
      const chosen = selectionRef.current
      const record = chosen?.source !== "qr" && chosen ? recordsById.get(chosen.slot.id) : null
      if (visibleRecord && visibleRecord !== record) visibleRecord.root.visible = false
      visibleRecord = record || null
      if (record) record.root.visible = Boolean(media.ready && !playbackSessionRef.current.canScan())
      if (record?.root.visible && rect && media.currentVideo) {
        const video = media.currentVideo
        const crop = media.profile.bounds
        const aspect = video.videoWidth / video.videoHeight / (media.packedActive ? 2 : 1) *
          (crop.right-crop.left) / (crop.bottom-crop.top)
        const layout = getLockedVideoLayout(rect.width, rect.height, aspect,
          presentationScaleRef.current, record.offset)
        record.root.position.set(0, 0, 0)
        record.root.quaternion.identity(); record.root.scale.set(1, 1, 1)
        record.mesh.position.set(layout.x, rect.height-layout.y, 0)
        record.mesh.quaternion.identity()
        record.mesh.scale.set(layout.width, layout.height, 1)
        record.shadow.visible = media.profile.grounded
        record.shadow.position.set(layout.x, rect.height-layout.y-layout.height/2, -.01)
        record.shadow.scale.set(layout.width*.72, Math.max(8,layout.height*.09), 1)
        media.material.opacity = 1
        if (media.nativeOverlayActive) {
          // Native alpha is composited by the browser. Update its transform only
          // on layout/gesture events; phone movement cannot modify this pose.
          const v = media.video
          const scaleX = layout.width / (v.videoWidth * (crop.right - crop.left))
          const scaleY = layout.height / (v.videoHeight * (crop.bottom - crop.top))
          Object.assign(media.nativeFrame.style, {
            width: `${layout.width}px`, height: `${layout.height}px`, opacity: "1",
            transform: `translate3d(${layout.x-layout.width/2}px,${layout.y-layout.height/2}px,0)`,
          })
          Object.assign(v.style, {width:`${v.videoWidth * scaleX}px`,height:`${v.videoHeight * scaleY}px`,
            left:`${-crop.left*v.videoWidth * scaleX}px`,top:`${-crop.top*v.videoHeight * scaleY}px`})
          media.nativeOverlayPositioned = true
        }
        record.mesh.visible = !media.nativeOverlayActive
      } else {
        hideNativeVideoOverlay(media, false)
      }
      tracker.renderer.render(tracker.scene,camera)
      if (import.meta.env.DEV && record?.root.visible && frameRef.current && !frameRef.current.dataset.arFirstFrameMs)
        frameRef.current.dataset.arFirstFrameMs = (performance.now() - openedAtRef.current).toFixed(1)
      if (import.meta.env.DEV) tracker.renderer.domElement.dataset.arRenders=String(++renders)
    }

    const cancelVideoFrames = () => {
      if (frameRequest && followedVideo?.cancelVideoFrameCallback)
        followedVideo.cancelVideoFrameCallback(frameRequest)
      if (fallbackFrame) cancelAnimationFrame(fallbackFrame)
      if (frameWatchdog) window.clearTimeout(frameWatchdog)
      frameRequest=fallbackFrame=frameWatchdog=0
      followedVideo=null
    }
    const followVideo = () => {
      cancelVideoFrames()
      invalidate()
      const video=media.currentVideo
      if (!media.ready || media.nativeOverlayActive || !video || document.hidden) return
      followedVideo=video; lastMediaTime=-1
      let lastCallbackAt=performance.now()
      const frameCurrent=()=>!disposed && followedVideo===video && media.ready && !document.hidden
      const freshFrame = () => {
        if (!frameCurrent()) return
        lastCallbackAt=performance.now()
        invalidate()
        frameRequest=video.requestVideoFrameCallback(freshFrame)
      }
      const compatibleFrame = () => {
        if (!frameCurrent()) return
        // All delivered clips are 24 fps. Cap the fallback to media frames,
        // rather than uploading a 720p texture at the display's 60/120 Hz.
        const mediaFrame=Math.floor(video.currentTime*24)
        if (mediaFrame!==lastMediaTime) {
          lastMediaTime=mediaFrame
          const currentTexture=media.packedActive ? media.colorTexture : media.texture
          currentTexture.needsUpdate=true
          invalidate()
        }
        fallbackFrame=requestAnimationFrame(compatibleFrame)
      }
      const watchFrames = () => {
        frameWatchdog=0
        if (!frameCurrent()) return
        if (!video.paused && performance.now()-lastCallbackAt>400) {
          // Some mobile compositors suppress callbacks for hidden videos even
          // while their playback clock advances. Keep the texture progressing.
          if(frameRequest)video.cancelVideoFrameCallback?.(frameRequest)
          frameRequest=0
          compatibleFrame()
        } else frameWatchdog=window.setTimeout(watchFrames,450)
      }
      if (typeof video.requestVideoFrameCallback==="function") {
        frameRequest=video.requestVideoFrameCallback(freshFrame)
        frameWatchdog=window.setTimeout(watchFrames,450)
      } else compatibleFrame()
    }
    const visibility = () => {
      if (document.hidden) cancelVideoFrames()
      else {updateViewport();followVideo()}
    }
    presentStageRef.current=updateViewport
    followVideoRef.current=followVideo
    media.nativeFrame.dataset.arVideoSurface="locked"

    for (const target of pageTargets) {
      const slot=slots.find(item=>item.id===target.slotId)
      if (!slot?.arVideoUrl) continue
      const anchor=tracker.addAnchor(target.index)
      const root=new THREE.Group();root.visible=false
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material)
      mesh.frustumCulled=false;mesh.renderOrder=5
      const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),shadowMaterial)
      shadow.renderOrder=4
      root.add(shadow,mesh);tracker.scene.add(root)
      const record:PlaneRecord={anchor,root,mesh,shadow,slot,offset:{x:0,y:0}}
      records.push(record);recordsById.set(slot.id,record)
      anchor.onTargetFound=()=>{
        if (trackerRef.current!==tracker || !playbackSessionRef.current.canScan()) return
        if (!pendingQRRef.current) preloadCandidate(slot)
        trackedCandidateRef.current={slot,foundAt:performance.now()}
      }
      anchor.onTargetLost=()=>{
        // Loss never closes an open video. It only rearms a dismissed page
        // once that page actually leaves the camera after the user pressed X.
        if (trackerRef.current!==tracker || !playbackSessionRef.current.canScan()) return
        if (trackedCandidateRef.current?.slot.id===slot.id) trackedCandidateRef.current=null
        playbackSessionRef.current.lost(slot.id)
        if (dismissedSlotRef.current===slot.id) dismissedSlotRef.current=null
      }
    }
    planeRecordsRef.current=records
    const resizeObserver=new ResizeObserver(updateViewport)
    if (frameRef.current) resizeObserver.observe(frameRef.current)
    window.addEventListener("resize",updateViewport)
    document.addEventListener("visibilitychange",visibility)
    window.visualViewport?.addEventListener("resize",updateViewport)
    updateViewport()
    const activeRecord=()=>recordsById.get(selectionRef.current?.slot.id||"")
    const gestureCleanup=frameRef.current ? installARGestures(frameRef.current,{
      canStart:()=>Boolean(selectionRef.current?.source!=="qr" && activeRecord() && media.ready &&
        playbackSessionRef.current.snapshot().phase==="playing"),
      project:(x,y)=>{
        const rect=viewportRef.current?.frame
        return rect?.width&&rect.height ? {x:x/rect.width,y:y/rect.height}:null
      },
      getTransform:()=>({x:activeRecord()?.offset.x||0,y:activeRecord()?.offset.y||0,
        scale:presentationScaleRef.current}),
      setTransform:value=>{
        const record=activeRecord();if (!record) return
        record.offset.x=Math.max(-.8,Math.min(.8,value.x))
        record.offset.y=Math.max(-.65,Math.min(.65,value.y))
        presentationScaleRef.current=value.scale
        invalidate()
      },
      commit:()=>setPresentationScale(presentationScaleRef.current),
    }):()=>{}
    stageCleanupRef.current=()=>{
      disposed=true
      cancelVideoFrames()
      if (pendingPaint) cancelAnimationFrame(pendingPaint)
      gestureCleanup();resizeObserver.disconnect()
      window.removeEventListener("resize",updateViewport)
      document.removeEventListener("visibilitychange",visibility)
      window.visualViewport?.removeEventListener("resize",updateViewport)
      presentStageRef.current=null;followVideoRef.current=null;viewportRef.current=null
    }
  }

  function disposeTracker() {
    cameraSessionRef.current++
    playbackSessionRef.current.stop()
    recognitionPauseRef.current?.dispose()
    recognitionPauseRef.current = null
    spatialPlayRequestRef.current += 1
    scanLoopRef.current?.()
    scanLoopRef.current = null
    disposeARDetector()
    modelWarmPromiseRef.current = null
    stageCleanupRef.current?.()
    stageCleanupRef.current = null
    modelReadyRef.current = false
    modelWarmingRef.current = false
    trackedCandidateRef.current = null
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
      for (const video of [media.video, media.colorVideo]) {
        video.pause()
        video.removeAttribute("src")
        video.load()
        video.remove()
      }
      media.material.dispose()
      media.texture.dispose()
      media.colorTexture.dispose()
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

  function ensureModelWarm() {
    if (modelWarmPromiseRef.current) return modelWarmPromiseRef.current
    modelWarmingRef.current = true
    const request = runtime ? runtime.warm?.() || Promise.resolve() : warmARDetector(classNames.length)
    const warm = request
      .then(() => {
        if (modelWarmPromiseRef.current === warm) {
          modelReadyRef.current = true
          modelWarmingRef.current = false
        }
      }, cause => {
        if (modelWarmPromiseRef.current === warm) {
          modelReadyRef.current = false
          modelWarmingRef.current = false
          modelWarmPromiseRef.current = null
        }
        throw cause
      })
    modelWarmPromiseRef.current = warm
    return warm
  }

  useEffect(() => {
    // Compile the detector as soon as the scanner route mounts. This moves the
    // expensive TFLite/WASM startup out of the first camera frame, while the
    // compiled worker remains available for the scan loop.
    void ensureModelWarm().catch(() => undefined)
    return () => disposeTracker()
  }, [])

  async function startCamera() {
    const cameraSession = ++cameraSessionRef.current
    playbackSessionRef.current.start()
    setError("")
    setStarting(true)
    chooseSelection(null)
    dismissedSlotRef.current = null
    setTrackerStatus("loading")
    setModelStatus("loading")
    setCameraOn(true)
    void videoAssets().catch(() => undefined)
    const warm = ensureModelWarm()
    void warm.then(() => {
      if (cameraSessionRef.current!==cameraSession) return
      modelReadyRef.current=true
      setModelStatus("ready")
    }).catch(() => {
      if (cameraSessionRef.current===cameraSession) {
        modelReadyRef.current=false
        setModelStatus("unavailable")
      }
    })
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )
      const stream = await requestCameraStream()
      if (cameraSessionRef.current !== cameraSession) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      streamRef.current = stream
      const cameraTrack = stream.getVideoTracks()[0]
      const capabilities =
        cameraTrack?.getCapabilities?.() as MediaTrackCapabilities & {
          focusMode?: string[]
          exposureMode?: string[]
        } | undefined
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
        runtime?.loadTracker?.() || import("mind-ar/dist/mindar-image-three.prod.js"),
        import("three"),
      ])
      if (cameraSessionRef.current !== cameraSession) return
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
      if (trackerRef.current !== tracker || cameraSessionRef.current !== cameraSession) return
      presentStageRef.current?.()
      recognitionPauseRef.current = createRecognitionPause(tracker.controller,
        () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
      cameraVideoRef.current = tracker.video
      setTrackerStatus("ready")
      if (playbackSessionRef.current.canScan()) beginScanLoop(tracker.video)
      else recognitionPauseRef.current.pause()
      setStarting(false)

    } catch (cameraError) {
      if (cameraSessionRef.current !== cameraSession) return
      disposeTracker()
      setCameraOn(false)
      setTrackerStatus("idle")
      setModelStatus("idle")
      setError(cameraErrorMessage(cameraError))
      setStarting(false)
    }
  }

  function beginScanLoop(camera: HTMLVideoElement) {
    scanLoopRef.current?.()
    if (!playbackSessionRef.current.canScan()) return
    let active=true, detecting=false, qrBusy=false, frameId=0
    let lastVisualSampleAt=-Infinity, visualUnavailable=false
    let lastDetectionAt=performance.now()-VISUAL_SCAN_INTERVAL_MS, lastQrAt=0, lastQrLocationAt=performance.now()
    let lastDismissedSeen=performance.now(), lastIndependentPopupAt=-Infinity
    const consensus=createVisualConsensus(arTargetManifest.stableFramesRequired)
    const generation=playbackSessionRef.current.snapshot().generation
    const current=()=>active && playbackSessionRef.current.canScan() &&
      playbackSessionRef.current.snapshot().generation===generation
    let qrWorker:Worker|null=null
    try {
      qrWorker=new Worker(new URL("../lib/arQr.worker.ts",import.meta.url),{type:"module"})
      qrWorker.onmessage=(event:MessageEvent<{data:string|null;located:boolean}>)=>{
        qrBusy=false
        if (!current()) return
        const now=performance.now()
        if (event.data.located) lastQrLocationAt=now
        if (event.data.data) {
          const slot=routeSlotFromQR(event.data.data,slots,bookVideoManifest.publicOrigin)
          if (slot?.id===playbackSessionRef.current.snapshot().dismissedId) {
            lastDismissedSeen=now
            return
          }
          if (slot?.arVideoUrl && pendingQRRef.current?.slot.id!==slot.id) {
            preloadCandidate(slot)
            pendingQRRef.current={slot,foundAt:now}
          }
        } else if (!event.data.located && now-lastQrLocationAt>1200) {
          const dismissed=playbackSessionRef.current.snapshot().dismissedId
          if (dismissed && dismissedSourceRef.current === "qr" &&
            !planeRecordsRef.current.some(r=>r.slot.id===dismissed&&r.anchor.visible))
            playbackSessionRef.current.lost(dismissed)
          qrFallbackRef.current=null
        }
      }
      qrWorker.onerror=()=>{qrBusy=false;qrWorker?.terminate();qrWorker=null}
    } catch (workerError) {console.warn("QR worker unavailable.",workerError)}
    const canvas=captureCanvasRef.current||document.createElement("canvas")
    captureCanvasRef.current=canvas
    const context=canvas.getContext("2d",{willReadFrequently:true})
    if (!context) {qrWorker?.terminate();setError("Không thể khởi tạo bộ quét hình ảnh.");return}
    scanLoopRef.current=()=>{
      active=false
      if(frameId)cancelAnimationFrame(frameId)
      qrWorker?.terminate();qrWorker=null
    }
    const frame=(now:number)=>{
      if (!current()) return
      if (camera.readyState<2 || !camera.videoWidth || !camera.videoHeight) {
        frameId=requestAnimationFrame(frame);return
      }
      if (qrWorker&&!qrBusy&&now-lastQrAt>300) {
        lastQrAt=now
        const width=480,height=Math.max(1,Math.round(camera.videoHeight/camera.videoWidth*width))
        if(canvas.width!==width)canvas.width=width
        if(canvas.height!==height)canvas.height=height
        context.drawImage(camera,0,0,width,height)
        const pixels=context.getImageData(0,0,width,height).data.buffer
        qrBusy=true;qrWorker.postMessage({pixels,width,height},[pixels])
      }
      if (!detecting && !modelWarmingRef.current && now-lastDetectionAt>=VISUAL_SCAN_INTERVAL_MS) {
        lastDetectionAt=now;detecting=true
        const sampleAt=now
        if(!modelReadyRef.current)setModelStatus("loading")
        void (runtime?.detect || detectBookTarget)(camera,classNames.length,detectionConfidence).then(detections=>{
          if(!current())return
          lastVisualSampleAt=sampleAt;visualUnavailable=false
          modelReadyRef.current=true;setModelStatus("ready")
          const dismissed=playbackSessionRef.current.snapshot().dismissedId
          const trustedSlot=pendingQRRef.current?.slot ||
            planeRecordsRef.current.find(record=>record.anchor.visible)?.slot || null
          const candidates=videoCandidates(detections,classNames,targets,slots,trustedSlot)
          const firstCandidate=candidates[0]
          if(firstCandidate && firstCandidate.detection.score>=.5 &&
            classNames[firstCandidate.detection.classId]?.startsWith("popup_")) lastIndependentPopupAt=performance.now()
          if(dismissed&&candidates.some(item=>item.slot?.id===dismissed))lastDismissedSeen=performance.now()
          else if(dismissed&&dismissedSourceRef.current!=="qr"&&performance.now()-lastDismissedSeen>1600&&
            !planeRecordsRef.current.some(r=>r.slot.id===dismissed&&r.anchor.visible))
            playbackSessionRef.current.lost(dismissed)
          const candidate=candidates.find(item=>item.slot?.id!==playbackSessionRef.current.snapshot().dismissedId)
          const confirmed=consensus.observe(candidate,performance.now())
          if(!candidate?.slot)return
          preloadCandidate(candidate.slot)
          if(confirmed) {
            const popup=classNames[confirmed.detection.classId]?.startsWith("popup_")
            openARVideo({slot:confirmed.slot,box:popup?confirmed.detection.box:null,
              source:popup?"popup":"page",score:confirmed.detection.score})
          }
        }).catch(modelError=>{
          if(!current())return
          visualUnavailable=true
          modelReadyRef.current=false;setModelStatus("unavailable")
          console.warn("Popup detection unavailable for this frame.",modelError)
        }).finally(()=>{detecting=false})
      }
      const pending=pendingQRRef.current
      const popupRecent=now-lastIndependentPopupAt<1100
      const awaitingVisual=(candidate:PendingQR)=>shouldWaitForPopupDetection({
        now,foundAt:candidate.foundAt,lastSampleAt:lastVisualSampleAt,unavailable:visualUnavailable,
      })
      if(pending&&!popupRecent&&!awaitingVisual(pending)&&now-pending.foundAt>=QR_FALLBACK_DELAY_MS) {
        qrFallbackRef.current=pending.slot.id;pendingQRRef.current=null
        openARVideo({slot:pending.slot,box:null,source:"qr"})
      }
      const tracked=trackedCandidateRef.current
      if(tracked&&!pending&&!popupRecent&&!awaitingVisual(tracked)&&now-tracked.foundAt>=PAGE_CONFIRMATION_WINDOW_MS &&
        planeRecordsRef.current.some(record=>record.slot.id===tracked.slot.id&&record.anchor.visible)) {
        trackedCandidateRef.current=null
        openARVideo({slot:tracked.slot,box:null,source:"page"})
      }
      if(current())frameId=requestAnimationFrame(frame)
    }
    frameId=requestAnimationFrame(frame)
  }

  function stopCamera() {
    disposeTracker()
    setStarting(false)
    setCameraOn(false)
    chooseSelection(null)
    setSelectedAsset(null)
    setMediaStatus("idle")
    setTrackerStatus("idle")
    setModelStatus("idle")
    dismissedSlotRef.current = null
  }

  function toggleSound() {
    const next = !soundOn
    soundOnRef.current = next
    setSoundOn(next)
    const media = spatialRef.current
    if (media?.currentVideo) {
      media.currentVideo.muted = !next
      if (next) {
        void media.currentVideo.play().catch((cause: unknown) => {
          if (cause instanceof Error && cause.name === "NotAllowedError") {
            soundOnRef.current = false
            setSoundOn(false)
            media.currentVideo!.muted = true
          }
        })
      }
    }
  }

  const qrVideoSrc =
    selectedAsset?.previewVideoUrl ||
    (videoPresentations as Record<string, VideoPresentation>)[
      selection?.slot.arVideoUrl?.split("/").pop()?.replace(/\.webm$/, "") || ""
    ]?.previewVideoUrl ||
    (selectedAsset?.alpha && isSafariOrIOS()
      ? selectedAsset.alphaColorUrl || selection?.slot.arVideoUrl || ""
      : selectedAsset?.alphaVideoUrl || selection?.slot.arVideoUrl || "")

  return (
    <div className={cameraOn ? "ar-camera" : "ar-page"}>
      {!cameraOn && <ARScanIntro onStart={startCamera} starting={starting} error={error} />}
      <div className={cameraOn ? "relative h-full w-full" : "hidden"}>
        <div
          ref={frameRef}
          data-ar-stage="true"
          data-ar-phase={selection ? "playing" : cameraOn ? "scanning" : "idle"}
          data-ar-source={selection?.source || ""}
          data-ar-media={mediaStatus}
          data-ar-detector={modelStatus}
          style={{ touchAction: cameraOn ? "none" : "auto", userSelect: "none" }}
          className="relative h-full w-full overflow-clip bg-[#071320]"
        >
          <div ref={cameraLayerRef} className="absolute inset-0" />
          {cameraOn && <div ref={videoOverlayRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden" />}

          {cameraOn && trackerStatus !== "ready" && (
            <div role="status" aria-label="Đang mở camera" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#071320]">
              <LoaderCircle size={32} className="animate-spin text-white/80" aria-hidden="true" />
            </div>
          )}
          {cameraOn && selection && (mediaStatus === "loading" || mediaStatus === "buffering") && (
            <div role="status" aria-label="Đang tải video AR" className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
              <span className="rounded-full bg-black/50 p-4"><LoaderCircle size={26} className="animate-spin text-white" aria-hidden="true" /></span>
            </div>
          )}
          {cameraOn && (
            <>
              <div className="ar-camera-topbar" data-ar-controls="true">
                <button type="button" onClick={stopCamera} aria-label="Đóng camera" className="ar-camera-button">
                  <ArrowLeft size={22} aria-hidden="true" />
                </button>
                {selection && (
                  <button type="button" onClick={() => void closeARVideo()} aria-label="Đóng video AR và quét tiếp" className="ar-camera-button">
                    <X size={24} aria-hidden="true" />
                  </button>
                )}
              </div>

              {!selection && trackerStatus === "ready" && (
                <div aria-hidden="true" className="ar-camera-viewfinder">
                  <span className="ar-viewfinder-corner ar-viewfinder-tl" />
                  <span className="ar-viewfinder-corner ar-viewfinder-tr" />
                  <span className="ar-viewfinder-corner ar-viewfinder-bl" />
                  <span className="ar-viewfinder-corner ar-viewfinder-br" />
                </div>
              )}

              {selection?.source === "qr" && selection.slot.arVideoUrl && (
                <div className="ar-qr-video" data-ar-controls="true">
                  <video
                    key={`${selection.slot.id}:${qrVideoSrc}`}
                    src={qrVideoSrc}
                    autoPlay loop playsInline muted={!soundOn} controls
                    onPlaying={() => setMediaStatus("ready")}
                    onWaiting={() => setMediaStatus("buffering")}
                    onCanPlay={(event) => {
                      const video = event.currentTarget
                      if (!soundOnRef.current) return
                      void video.play().catch((cause: unknown) => {
                        if (cause instanceof Error && cause.name === "NotAllowedError") {
                          soundOnRef.current = false
                          setSoundOn(false)
                          video.muted = true
                          void video.play().catch(() => undefined)
                        }
                      })
                    }}
                    className="block max-h-[70dvh] w-full bg-black object-contain"
                  />
                </div>
              )}

              {selection && (
                <div role="toolbar" aria-label="Điều khiển video AR" data-ar-controls="true" className="ar-camera-toolbar">
                  <button type="button" onClick={toggleSound} aria-label={soundOn ? "Tắt tiếng video AR" : "Bật tiếng video AR"} aria-pressed={soundOn} className="ar-camera-tool">
                    {soundOn ? <Volume2 size={20} aria-hidden="true" /> : <VolumeX size={20} aria-hidden="true" />}
                  </button>
                  {selection.source !== "qr" ? (
                    <>
                      <span className="mx-1 h-5 w-px bg-white/20" aria-hidden="true" />
                      <button type="button" onClick={() => changePresentationScale(-0.25)} disabled={presentationScale <= MIN_AR_SCALE} aria-label="Thu nhỏ video AR" className="ar-camera-tool"><Minus size={20} aria-hidden="true" /></button>
                      <button type="button" onClick={() => changePresentationScale(0.25)} disabled={presentationScale >= MAX_AR_SCALE} aria-label="Phóng to video AR" className="ar-camera-tool"><Plus size={20} aria-hidden="true" /></button>
                      <button type="button" onClick={resetPresentation} aria-label="Đặt lại vị trí và kích thước AR" className="ar-camera-tool"><RotateCcw size={19} aria-hidden="true" /></button>
                    </>
                  ) : (
                    <Link to={`/watch/${selection.slot.id}`} aria-label="Mở trang video" className="ar-camera-tool"><ExternalLink size={19} aria-hidden="true" /></Link>
                  )}
                </div>
              )}
              {error && (
                <div role="alert" className="ar-camera-error">
                  <span>{error}</span>
                  <button type="button" aria-label="Thử phát lại video" className="ar-camera-tool shrink-0" onClick={() => {
                    const slot = selectionRef.current?.slot || activePageSlotRef.current
                    if (slot) void showSpatialVideo(slot)
                  }}><RotateCcw size={19} aria-hidden="true" /></button>
                </div>
              )}
            </>
          )}
        </div>
        <canvas ref={captureCanvasRef} className="hidden" aria-hidden="true" />
      </div>
    </div>
  )
}
