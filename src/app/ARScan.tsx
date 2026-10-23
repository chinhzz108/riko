import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { ArrowLeft, Camera, RotateCcw, Volume2, VolumeX, X } from "lucide-react"
import { Link } from "react-router"
import jsQR from "jsqr"
import bookVideoManifest from "../data/bookVideoSlots.json"
import arTargetManifest from "../data/arTargets.json"
import { detectBookTarget, type ARDetection, type ARMaskRegion } from "../lib/arDetector"
import {
  resolveSlotFromLabel,
  routeSlotFromQR,
  shouldCommitQrFallback,
} from "../lib/arScanLogic.js"

type BookSlot = (typeof bookVideoManifest.slots)[number] & {
  arTargetId?: string | null
  arVideoUrl?: string | null
  pageClass?: string
}
type Target = (typeof arTargetManifest.targets)[number] & {
  popupLabel: string
  videoUrl: string
  pages: string[]
}

const slots = bookVideoManifest.slots as BookSlot[]
const targets = arTargetManifest.targets as Target[]
const classNames = [
  ...slots.map((slot) => slot.pageClass || `page_${slot.id.replace(/-/g, "_")}`),
  ...targets.map((target) => target.popupLabel),
]
const detectionConfidence = (classId: number) => {
  const label = classNames[classId]
  return label?.startsWith("popup_")
    ? arTargetManifest.minimumConfidenceByType.popup
    : arTargetManifest.minimumConfidenceByType.page
}
type Selection = {
  slot: BookSlot
  box: ARDetection["box"] | null
  source: "popup" | "page" | "qr"
  score?: number
}

const CAMERA_START_TIMEOUT_MS = 15_000

function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Chưa được cấp quyền dùng camera. Hãy cho phép camera rồi bấm thử lại nhé."
    }
    if (error.name === "TimeoutError") {
      return "Camera chưa phản hồi. Hãy kiểm tra quyền camera của trình duyệt rồi thử lại nhé."
    }
    if (error.name === "NotFoundError") {
      return "Thiết bị này không tìm thấy camera. Hãy thử trên điện thoại hoặc máy có camera nhé."
    }
  }
  return "Không mở được camera. Hãy kiểm tra quyền camera và thử lại trên HTTPS hoặc localhost."
}

async function requestCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access is unavailable in this browser.")
  }

  let requestTimedOut = false
  let timeoutId: number | undefined
  const request = navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })
    .then((stream) => {
      if (requestTimedOut) stream.getTracks().forEach((track) => track.stop())
      return requestTimedOut ? null : stream
    })
  const timeout = new Promise<null>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      requestTimedOut = true
      reject(new DOMException("Camera permission or device request timed out.", "TimeoutError"))
    }, CAMERA_START_TIMEOUT_MS)
  })

  try {
    const stream = await Promise.race([request, timeout])
    if (!stream) throw new DOMException("Camera request timed out.", "TimeoutError")
    return stream
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}

function slotFromDetection(detection: ARDetection, pageContext?: BookSlot | null) {
  return resolveSlotFromLabel(classNames[detection.classId], pageContext?.id, targets, slots)
}

function getCoverRect(
  box: ARDetection["box"],
  videoWidth: number,
  videoHeight: number,
  frameWidth: number,
  frameHeight: number,
) {
  const scale = Math.max(frameWidth / videoWidth, frameHeight / videoHeight)
  const renderedWidth = videoWidth * scale
  const renderedHeight = videoHeight * scale
  const offsetX = (frameWidth - renderedWidth) / 2
  const offsetY = (frameHeight - renderedHeight) / 2
  return {
    left: offsetX + box.x * scale,
    top: offsetY + box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  }
}

export default function ARScan() {
  const cameraRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement>(null)
  const scanLoopRef = useRef<(() => void) | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState("")
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle")
  const [selection, setSelection] = useState<Selection | null>(null)
  const selectionRef = useRef<Selection | null>(null)
  const dismissedSlotRef = useRef<string | null>(null)
  const [boxStyle, setBoxStyle] = useState<CSSProperties | undefined>()
  const [soundOn, setSoundOn] = useState(false)
  const [scannedQR, setScannedQR] = useState("")

  const selectedTarget = useMemo(() => {
    if (!selection?.slot.arTargetId) return null
    return targets.find((target) => target.id === selection.slot.arTargetId) || null
  }, [selection])

  function chooseSelection(next: Selection | null) {
    selectionRef.current = next
    setSelection(next)
  }

  useEffect(() => {
    if (!selection?.box || !cameraRef.current || !frameRef.current) {
      setBoxStyle(undefined)
      return
    }
    const camera = cameraRef.current
    const frame = frameRef.current
    const rect = getCoverRect(
      selection.box,
      camera.videoWidth,
      camera.videoHeight,
      frame.clientWidth,
      frame.clientHeight,
    )
    setBoxStyle({
      left: `${Math.max(0, (rect.left / frame.clientWidth) * 100)}%`,
      top: `${Math.max(0, (rect.top / frame.clientHeight) * 100)}%`,
      width: `${Math.min(100, (rect.width / frame.clientWidth) * 100)}%`,
      height: `${Math.min(100, (rect.height / frame.clientHeight) * 100)}%`,
    })
  }, [selection, cameraOn])

  useEffect(() => {
    return () => {
      scanLoopRef.current = null
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function startCamera() {
    setError("")
    setStarting(true)
    chooseSelection(null)
    dismissedSlotRef.current = null
    setScannedQR("")
    setModelStatus("loading")
    try {
      const stream = await requestCameraStream()
      streamRef.current = stream
      const camera = cameraRef.current
      if (!camera) throw new Error("Không tìm thấy video camera.")
      camera.srcObject = stream
      await camera.play()
      setCameraOn(true)
      let modelReady = false
      try {
        await detectBookTarget(camera, classNames.length, detectionConfidence)
        modelReady = true
        setModelStatus("ready")
      } catch (modelError) {
        console.warn("Riko AR model could not be loaded; QR fallback remains active.", modelError)
        setModelStatus("unavailable")
      }
      beginScanLoop(modelReady)
    } catch (cameraError) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setCameraOn(false)
      setModelStatus("idle")
      setError(cameraErrorMessage(cameraError))
    } finally {
      setStarting(false)
    }
  }

  function beginScanLoop(modelReady: boolean) {
    let active = true
    let detecting = false
    let lastDetectionAt = 0
    let lastQrAt = 0
    let lastQrLocationAt = 0
    let qrMask: ARMaskRegion | null = null
    let activeVisualKey = ""
    let activeVisualSlot: BookSlot | null = null
    let stableCount = 0
    let pendingQr: BookSlot | null = null
    let committedQrFallback: BookSlot | null = null
    let qrFoundAt = 0
    let qrFallbackCommitted = false
    const canvas = captureCanvasRef.current || document.createElement("canvas")
    captureCanvasRef.current = canvas
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) {
      setError("Không thể khởi tạo bộ quét hình ảnh.")
      return
    }

    const stop = () => {
      active = false
      scanLoopRef.current = null
    }
    scanLoopRef.current = stop

    const frame = async (now: number) => {
      const camera = cameraRef.current
      if (!active || !camera || camera.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (active) requestAnimationFrame(frame)
        return
      }

      if (now - lastQrAt > 350) {
        lastQrAt = now
        const width = 480
        const height = Math.max(1, Math.round((camera.videoHeight / camera.videoWidth) * width))
        canvas.width = width
        canvas.height = height
        context.drawImage(camera, 0, 0, width, height)
        const image = context.getImageData(0, 0, width, height)
        const decoded = jsQR(image.data, width, height, { inversionAttempts: "attemptBoth" })
        if (decoded?.location) {
          const points = [
            decoded.location.topLeftCorner,
            decoded.location.topRightCorner,
            decoded.location.bottomRightCorner,
            decoded.location.bottomLeftCorner,
          ]
          const scaleX = camera.videoWidth / width
          const scaleY = camera.videoHeight / height
          const left = Math.min(...points.map((point) => point.x)) * scaleX
          const top = Math.min(...points.map((point) => point.y)) * scaleY
          const right = Math.max(...points.map((point) => point.x)) * scaleX
          const bottom = Math.max(...points.map((point) => point.y)) * scaleY
          qrMask = { x: left, y: top, width: right - left, height: bottom - top }
          lastQrLocationAt = now
        } else if (now - lastQrLocationAt > 1200) {
          qrMask = null
        }
        if (decoded) {
          const slot = routeSlotFromQR(decoded.data, slots, bookVideoManifest.publicOrigin)
          if (
            slot?.arVideoUrl &&
            slot.id !== pendingQr?.id &&
            slot.id !== selectionRef.current?.slot.id
          ) {
            pendingQr = slot
            qrFoundAt = now
            qrFallbackCommitted = false
            committedQrFallback = null
            setScannedQR(slot.id)
          }
        }
      }

      if (modelReady && !detecting && now - lastDetectionAt > 250) {
        lastDetectionAt = now
        detecting = true
        try {
          const detections = await detectBookTarget(
            camera,
            classNames.length,
            detectionConfidence,
            qrMask,
          )
          const pageMatch = detections.find((item) => {
            const label = classNames[item.classId]
            return label?.startsWith("page_") && slotFromDetection(item)?.arVideoUrl
          })
          const pageSlot = pageMatch ? slotFromDetection(pageMatch) : null
          const popupMatch = detections.find((item) => {
            const label = classNames[item.classId]
            return label?.startsWith("popup_") && slotFromDetection(item, pageSlot)?.arVideoUrl
          })
          const match = popupMatch || pageMatch
          if (match) {
            const label = classNames[match.classId]
            const slot = slotFromDetection(match, pageSlot)
            const visualKey = `${label}:${slot?.id || "unresolved"}`
            if (visualKey === activeVisualKey) stableCount += 1
            else {
              activeVisualKey = visualKey
              stableCount = 1
            }
            activeVisualSlot = slot
            if (stableCount >= arTargetManifest.stableFramesRequired) {
              if (slot?.arVideoUrl) {
                const qrReference = pendingQr || committedQrFallback
                if (!qrReference || slot.arVideoUrl === qrReference.arVideoUrl) {
                  pendingQr = null
                  qrFallbackCommitted = false
                  committedQrFallback = null
                  const nextSelection: Selection = {
                    slot,
                    box: match.box,
                    source: label.startsWith("popup_") ? "popup" : "page",
                    score: match.score,
                  }
                  const current = selectionRef.current
                  if (dismissedSlotRef.current && dismissedSlotRef.current !== slot.id) {
                    dismissedSlotRef.current = null
                  }
                  if (
                    dismissedSlotRef.current !== slot.id &&
                    (!current ||
                      current.slot.id !== slot.id ||
                      current.source === "qr" ||
                      current.source !== nextSelection.source ||
                      !current.box ||
                      Math.abs(current.box.x - nextSelection.box!.x) > 8 ||
                      Math.abs(current.box.y - nextSelection.box!.y) > 8 ||
                      Math.abs(current.box.width - nextSelection.box!.width) > 8 ||
                      Math.abs(current.box.height - nextSelection.box!.height) > 8)
                  ) {
                    chooseSelection(nextSelection)
                  }
                }
              }
            }
          } else {
            activeVisualKey = ""
            activeVisualSlot = null
            stableCount = 0
          }
        } catch (modelError) {
          console.warn("Riko AR frame recognition failed.", modelError)
          modelReady = false
          activeVisualKey = ""
          activeVisualSlot = null
          stableCount = 0
          setModelStatus("unavailable")
        } finally {
          detecting = false
        }
      }

      const qrFallbackSlot = pendingQr
      if (
        qrFallbackSlot &&
        shouldCommitQrFallback({
          pendingQr: qrFallbackSlot,
          qrFoundAt,
          now,
          qrFallbackCommitted,
          stableCount,
          stableFramesRequired: arTargetManifest.stableFramesRequired,
          stableVisualSlot: activeVisualSlot,
        })
      ) {
        const current = selectionRef.current
        if (dismissedSlotRef.current && dismissedSlotRef.current !== qrFallbackSlot.id) {
          dismissedSlotRef.current = null
        }
        if (
          dismissedSlotRef.current !== qrFallbackSlot.id &&
          (current?.slot.id !== qrFallbackSlot.id || current.source !== "qr")
        ) {
          chooseSelection({ slot: qrFallbackSlot, box: null, source: "qr" })
        }
        qrFallbackCommitted = true
        committedQrFallback = qrFallbackSlot
        pendingQr = null
      }
      if (active) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }

  function stopCamera() {
    scanLoopRef.current?.()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (cameraRef.current) cameraRef.current.srcObject = null
    setCameraOn(false)
    chooseSelection(null)
    dismissedSlotRef.current = null
    setScannedQR("")
    setModelStatus("idle")
  }

  const targetLabel = selectedTarget?.label || selection?.slot.label || "Riko đang nhận diện"

  return (
    <main className="mx-auto min-h-[70vh] max-w-[1120px] px-5 py-8 sm:px-8 sm:py-12">
      <Link to="/book" className="inline-flex items-center gap-2 text-sm text-[#4A5461] hover:text-primary">
        <ArrowLeft size={17} /> Về trang sách
      </Link>
      <div className="mx-auto mt-7 max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-[#E7F5F7] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary">
          <Camera size={15} /> Riko AR
        </span>
        <h1 className="mt-4 text-3xl font-bold text-primary sm:text-4xl">Quét hình pop-up để mở video</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#4A5461] sm:text-base">
          Riko ưu tiên nhận diện hình pop-up và hình ảnh của trang sách. Nếu máy chưa nhận ra, mã QR trên trang sẽ mở đúng video dự phòng.
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-4xl overflow-hidden rounded-[28px] border border-[#DFE5E8] bg-[#142333] shadow-xl">
        <div ref={frameRef} className="relative aspect-video overflow-hidden bg-[#142333]">
          <video
            ref={cameraRef}
            muted
            playsInline
            className={`absolute inset-0 h-full w-full object-cover ${cameraOn ? "block" : "hidden"}`}
            aria-label="Hình ảnh camera đang quét sách"
          />
          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center text-white">
              <Camera size={48} className="text-[#A8D8E8]" />
              <p className="mt-4 text-lg font-semibold">Đưa một trang sách vào khung hình</p>
              <p className="mt-2 max-w-md text-sm text-white/75">Riko ưu tiên hình pop-up và hình minh họa; mã QR chỉ mở video dự phòng.</p>
              <button
                type="button"
                onClick={startCamera}
                disabled={starting}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#F45B40] px-6 py-3 font-semibold text-white transition hover:bg-[#dc4c33] disabled:opacity-60"
              >
                <Camera size={18} /> {starting ? "Đang mở camera…" : "Bắt đầu quét"}
              </button>
            </div>
          )}
          {cameraOn && !selection?.box && !selection && (
            <div className="pointer-events-none absolute inset-[12%] rounded-3xl border-2 border-white/70 shadow-[0_0_0_999px_rgba(4,20,36,.12)]">
              <span className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white">
                {modelStatus === "ready" ? "Đang nhận diện pop-up và trang sách" : modelStatus === "loading" ? "Đang nạp mô hình nhận diện…" : "Đang quét QR dự phòng"}
              </span>
            </div>
          )}
          {cameraOn && selection?.box && boxStyle && (
            <div style={boxStyle} className="pointer-events-none absolute z-10 rounded-xl border-2 border-[#FFD45B] shadow-[0_0_0_999px_rgba(4,20,36,.08)]">
              <span className="absolute -top-8 left-0 whitespace-nowrap rounded-full bg-[#173E72] px-3 py-1 text-xs font-bold text-white shadow">
                {targetLabel}{selection.score ? ` · ${Math.round(selection.score * 100)}%` : ""}
              </span>
            </div>
          )}
          {selection && selection.slot.arVideoUrl && (
            <div className="absolute inset-x-3 bottom-3 z-20 overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-auto sm:w-[min(42%,420px)]">
              <div className="flex items-center justify-between gap-3 bg-[#173E72] px-3 py-2 text-white">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{targetLabel}</p>
                  <p className="text-[11px] text-white/75">
                    {selection.source === "popup" ? "Nhận diện hình pop-up" : selection.source === "page" ? "Nhận diện trang sách" : "Mở bằng QR dự phòng"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    dismissedSlotRef.current = selection.slot.id
                    chooseSelection(null)
                  }}
                  className="rounded-full p-1.5 hover:bg-white/15"
                  aria-label="Đóng video AR"
                >
                  <X size={17} />
                </button>
              </div>
              <video
                key={selection.slot.arVideoUrl}
                src={selection.slot.arVideoUrl}
                autoPlay
                loop
                playsInline
                muted={!soundOn}
                controls
                className="aspect-video w-full bg-black object-contain"
              />
              <button
                type="button"
                onClick={() => setSoundOn((value) => !value)}
                className="absolute right-3 top-12 z-10 rounded-full bg-black/55 p-2 text-white hover:bg-black/75"
                aria-label={soundOn ? "Tắt tiếng video" : "Bật tiếng video"}
              >
                {soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
              </button>
              <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-[#596575]">
                <span>{selection.slot.label}</span>
                <Link to={`/watch/${selection.slot.id}`} className="shrink-0 font-semibold text-primary underline underline-offset-2">
                  Mở trang video
                </Link>
              </div>
            </div>
          )}
          {cameraOn && (
            <button
              type="button"
              onClick={stopCamera}
              className="absolute bottom-3 left-3 z-30 inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-2 text-xs font-semibold text-white hover:bg-black/75"
            >
              <X size={15} /> Dừng camera
            </button>
          )}
          {cameraOn && scannedQR && !selection && (
            <span className="absolute bottom-3 right-3 z-10 rounded-full bg-black/55 px-3 py-2 text-xs text-white">
              Đã đọc QR · {scannedQR}
            </span>
          )}
        </div>
        <canvas ref={captureCanvasRef} className="hidden" aria-hidden="true" />
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-4 sm:px-6">
          <p className="text-xs leading-5 text-[#596575]">
            {modelStatus === "ready" ? "Mô hình trang và pop-up là nguồn nhận diện chính." : modelStatus === "unavailable" ? "Chưa tải được mô hình; QR vẫn hoạt động làm dự phòng." : "Mở camera để bắt đầu nhận diện."}
            {scannedQR && !selection
              ? ` Đã thấy QR ${scannedQR}; đang ưu tiên nhận diện hình trong 0,8 giây trước khi dùng QR dự phòng.`
              : ""}
          </p>
          <div className="flex gap-2">
            {cameraOn ? (
              <button type="button" onClick={stopCamera} className="inline-flex items-center gap-2 rounded-full border border-[#D9E0E5] px-4 py-2 text-sm font-semibold text-primary hover:bg-[#F5F8FA]">
                <RotateCcw size={15} /> Quét lại
              </button>
            ) : (
              <Link to="/book" className="inline-flex items-center gap-2 rounded-full border border-[#D9E0E5] px-4 py-2 text-sm font-semibold text-primary hover:bg-[#F5F8FA]">Xem sách</Link>
            )}
          </div>
        </div>
      </div>
      {error && <p role="alert" className="mx-auto mt-4 max-w-3xl rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {selection && !selection.slot.arVideoUrl && (
        <p role="status" className="mx-auto mt-4 max-w-3xl rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Trang {selection.slot.label} chưa có video được gán.</p>
      )}
      <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-5 text-[#6B7480]">
        Nếu đang dùng iPhone, hãy mở trang bằng Safari và cho phép camera. Các trang chưa có video vẫn nhận QR nhưng sẽ chờ gán clip sau.
      </p>
    </main>
  )
}
