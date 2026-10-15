import { useEffect, useRef, useState } from "react"
import { motion, useInView } from "motion/react"
import { useMotionPreferences } from "./Motion"
import rikoWelcome from "../assets/riko/welcome.png"

const canvasWidth = 420
const canvasHeight = 660
const canvasFill = 0.96

export default function VideoMascot() {
  const { enabled } = useMotionPreferences()
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const visible = useInView(hostRef, { margin: "80px" })
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    const output = canvasRef.current
    if (!video || !output || failed) return

    const source = document.createElement("canvas")
    const read = source.getContext("2d", { willReadFrequently: true })
    const paint = output.getContext("2d")
    if (!read || !paint) {
      setFailed(true)
      return
    }

    let width = 0
    let height = 0
    let total = 0
    let distances = new Uint8Array()
    let visited = new Uint8Array()
    let componentIds = new Uint32Array()
    let queue = new Int32Array()
    let frameRequest = 0
    let lastTime = -1
    let disposed = false
    let referenceScale = 0
    let hasDrawnFrame = false

    const mobile = window.matchMedia("(max-width: 600px)").matches
    const maxSourceWidth = mobile ? 240 : 320
    const minFrameInterval = mobile ? 1 / 10 : 1 / 12

    const sizeSource = () => {
      if (!video.videoWidth || !video.videoHeight) return false
      const scale = Math.min(1, maxSourceWidth / video.videoWidth)
      width = Math.max(1, Math.round(video.videoWidth * scale))
      height = Math.max(1, Math.round(video.videoHeight * scale))
      total = width * height
      source.width = width
      source.height = height
      if (output.width !== canvasWidth) output.width = canvasWidth
      if (output.height !== canvasHeight) output.height = canvasHeight
      distances = new Uint8Array(total)
      visited = new Uint8Array(total)
      componentIds = new Uint32Array(total)
      queue = new Int32Array(total)
      return true
    }

    const draw = () => {
      if (
        disposed ||
        document.visibilityState !== "visible" ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        return
      }
      if (!width && !sizeSource()) return

      read.imageSmoothingEnabled = true
      read.imageSmoothingQuality = "high"
      read.drawImage(video, 0, 0, width, height)
      const frame = read.getImageData(0, 0, width, height)
      const pixels = frame.data
      const corners = [
        4 + 4 * width,
        width - 5 + 4 * width,
        4 + (height - 5) * width,
        width - 5 + (height - 5) * width,
      ]
      const background = [0, 1, 2].map((channel) => {
        const values = corners
          .map((index) => pixels[index * 4 + channel])
          .sort((a, b) => a - b)
        return Math.round((values[1] + values[2]) / 2)
      })

      for (let index = 0; index < total; index++) {
        const offset = index * 4
        distances[index] = Math.max(
          Math.abs(pixels[offset] - background[0]),
          Math.abs(pixels[offset + 1] - background[1]),
          Math.abs(pixels[offset + 2] - background[2]),
        )
      }

      visited.fill(0)
      let head = 0
      let tail = 0
      const addBackdrop = (index: number) => {
        if (visited[index] || distances[index] > 38) return
        visited[index] = 1
        queue[tail++] = index
      }
      for (let x = 0; x < width; x++) {
        addBackdrop(x)
        addBackdrop((height - 1) * width + x)
      }
      for (let y = 0; y < height; y++) {
        addBackdrop(y * width)
        addBackdrop(y * width + width - 1)
      }
      while (head < tail) {
        const index = queue[head++]
        const x = index % width
        pixels[index * 4 + 3] = 0
        if (x) addBackdrop(index - 1)
        if (x < width - 1) addBackdrop(index + 1)
        if (index >= width) addBackdrop(index - width)
        if (index < total - width) addBackdrop(index + width)
      }

      visited.fill(0)
      componentIds.fill(0)
      let largest = 0
      let largestId = 0
      let largestBounds: { left: number; top: number; right: number; bottom: number } | null = null
      let componentId = 0
      const addSubject = (index: number) => {
        if (visited[index] || pixels[index * 4 + 3] === 0) return
        visited[index] = 1
        componentIds[index] = componentId
        queue[tail++] = index
      }

      for (let index = 0; index < total; index++) {
        if (visited[index] || pixels[index * 4 + 3] === 0) continue
        componentId++
        head = 0
        tail = 0
        let left = width
        let top = height
        let right = -1
        let bottom = -1
        addSubject(index)
        while (head < tail) {
          const current = queue[head++]
          const x = current % width
          const y = Math.floor(current / width)
          left = Math.min(left, x)
          top = Math.min(top, y)
          right = Math.max(right, x)
          bottom = Math.max(bottom, y)
          if (x) addSubject(current - 1)
          if (x < width - 1) addSubject(current + 1)
          if (y) addSubject(current - width)
          if (y < height - 1) addSubject(current + width)
          if (x && y) addSubject(current - width - 1)
          if (x < width - 1 && y) addSubject(current - width + 1)
          if (x && y < height - 1) addSubject(current + width - 1)
          if (x < width - 1 && y < height - 1)
            addSubject(current + width + 1)
        }
        if (tail > largest) {
          largest = tail
          largestId = componentId
          largestBounds = { left, top, right, bottom }
        }
      }

      if (largest < total * 0.003 || !largestBounds) return
      for (let index = 0; index < total; index++) {
        if (componentIds[index] !== largestId) pixels[index * 4 + 3] = 0
      }

      read.putImageData(frame, 0, 0)
      const subjectWidth = largestBounds.right - largestBounds.left + 1
      const subjectHeight = largestBounds.bottom - largestBounds.top + 1
      const fitScale = Math.min(
        (canvasHeight * canvasFill) / subjectHeight,
        (canvasWidth * 0.9) / subjectWidth,
      )
      if (!referenceScale) referenceScale = fitScale
      const drawWidth = subjectWidth * referenceScale
      const drawHeight = subjectHeight * referenceScale
      const drawX = Math.max(
        0,
        Math.min(canvasWidth - drawWidth, canvasWidth / 2 - drawWidth / 2),
      )
      const drawY = canvasHeight - drawHeight
      paint.imageSmoothingEnabled = true
      paint.imageSmoothingQuality = "high"
      paint.clearRect(0, 0, canvasWidth, canvasHeight)
      paint.drawImage(
        source,
        largestBounds.left,
        largestBounds.top,
        subjectWidth,
        subjectHeight,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
      )
      if (!hasDrawnFrame) {
        hasDrawnFrame = true
        setReady(true)
      }
    }

    const tick = () => {
      frameRequest = 0
      if (disposed || video.paused) return
      if (
        video.currentTime !== lastTime &&
        (lastTime < 0 ||
          video.currentTime < lastTime ||
          video.currentTime - lastTime >= minFrameInterval)
      ) {
        draw()
        lastTime = video.currentTime
      }
      frameRequest = requestAnimationFrame(tick)
    }
    const start = () => {
      if (!disposed && !frameRequest)
        frameRequest = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (frameRequest) cancelAnimationFrame(frameRequest)
      frameRequest = 0
    }
    const updatePlayback = () => {
      if (document.visibilityState !== "visible") {
        video.pause()
        stop()
        return
      }
      if (enabled && visible) {
        void video.play().then(start).catch(() => draw())
      } else {
        video.pause()
        stop()
        draw()
      }
    }
    const onLoadedData = () => {
      sizeSource()
      draw()
      updatePlayback()
    }
    const onError = () => {
      stop()
      setFailed(true)
    }

    video.addEventListener("loadedmetadata", sizeSource)
    video.addEventListener("loadeddata", onLoadedData)
    video.addEventListener("play", start)
    video.addEventListener("pause", stop)
    video.addEventListener("error", onError)
    document.addEventListener("visibilitychange", updatePlayback)

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) sizeSource()
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onLoadedData()
    else updatePlayback()

    return () => {
      disposed = true
      stop()
      video.pause()
      video.removeEventListener("loadedmetadata", sizeSource)
      video.removeEventListener("loadeddata", onLoadedData)
      video.removeEventListener("play", start)
      video.removeEventListener("pause", stop)
      video.removeEventListener("error", onError)
      document.removeEventListener("visibilitychange", updatePlayback)
    }
  }, [enabled, failed, visible])

  return (
    <motion.div
      ref={hostRef}
      role="img"
      aria-label="Riko, mascot hoạt hình"
      className="relative h-full w-full"
      animate={enabled && visible ? { y: [0, -5, 0], rotate: [0, 0.7, 0] } : { y: 0, rotate: 0 }}
      transition={{
        duration: 5.5,
        repeat: enabled && visible ? Infinity : 0,
        ease: "easeInOut",
      }}
      whileHover={enabled ? { scale: 1.025 } : undefined}
    >
      <img
        src={rikoWelcome}
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full object-contain drop-shadow-sm transition-opacity duration-200 ${ready && !failed ? "opacity-0" : "opacity-100"}`}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full object-contain drop-shadow-sm transition-opacity duration-200 ${ready && !failed ? "opacity-100" : "opacity-0"}`}
      />
      <video
        ref={videoRef}
        src="/videos/riko-mascot.mp4"
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0"
      />
    </motion.div>
  )
}
