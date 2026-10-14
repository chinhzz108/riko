import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from "react"
import {
  motion,
  MotionConfig,
  useMotionValue,
  useSpring,
  useTransform,
  useScroll,
  useMotionValueEvent,
  useInView,
  animate,
  AnimatePresence,
} from "motion/react"
import { Sparkles, Pause, Play, ArrowRight, Star } from "lucide-react"
import rikoWelcome from "../assets/riko/welcome.png"

const MotionContext = createContext({
  enabled: true,
  desktop: false,
  cursor: false,
  toggle: () => {},
})
export const useMotionPreferences = () => useContext(MotionContext)
function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [query])
  return matches
}
export function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = useMedia("(prefers-reduced-motion: reduce)")
  const desktop = useMedia("(min-width: 1024px)")
  const pointer = useMedia("(hover: hover) and (pointer: fine)")
  const [paused, setPaused] = useState(
    () => localStorage.getItem("rikokid-motion") === "paused",
  )
  const enabled = !reduced && !paused
  useEffect(() => {
    document.documentElement.dataset.motion = enabled ? "full" : "off"
  }, [enabled])
  return (
    <MotionContext.Provider
      value={{
        enabled,
        desktop,
        cursor: enabled && desktop && pointer,
        toggle: () => {
          setPaused(!paused)
          localStorage.setItem("rikokid-motion", !paused ? "paused" : "full")
        },
      }}
    >
      <MotionConfig reducedMotion={enabled ? "user" : "always"}>
        {children}
      </MotionConfig>
    </MotionContext.Provider>
  )
}
export function MotionToggle() {
  const { enabled, toggle } = useMotionPreferences()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={enabled ? "Tạm dừng chuyển động" : "Bật chuyển động"}
      aria-pressed={!enabled}
      title={enabled ? "Tạm dừng chuyển động" : "Bật chuyển động"}
      className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-background/80 text-primary transition hover:bg-primary/5"
    >
      {enabled ? <Pause size={15} /> : <Play size={15} />}
    </button>
  )
}
export function Reveal({
  children,
  className = "",
  delay = 0,
  direction = "up",
}: {
  children: ReactNode
  className?: string
  delay?: number
  direction?: "up" | "left" | "right" | "scale"
}) {
  const { enabled } = useMotionPreferences()
  return (
    <motion.div
      initial={
        enabled
          ? {
              opacity: 0,
              y: direction === "up" ? 22 : 0,
              x: direction === "left" ? -22 : direction === "right" ? 22 : 0,
              scale: direction === "scale" ? 0.96 : 1,
            }
          : false
      }
      whileInView={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{
        duration: enabled ? 0.65 : 0,
        delay: enabled ? delay : 0,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
export function Tilt({
  children,
  className = "",
  book = false,
}: {
  children: ReactNode
  className?: string
  book?: boolean
}) {
  const { cursor } = useMotionPreferences()
  const rotateX = useSpring(0, { stiffness: 130, damping: 22 })
  const rotateY = useSpring(0, { stiffness: 130, damping: 22 })
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!cursor || event.pointerType !== "mouse") return
    const rect = event.currentTarget.getBoundingClientRect()
    rotateX.set(
      (-(event.clientY - rect.top - rect.height / 2) / rect.height) * 8,
    )
    rotateY.set(
      ((event.clientX - rect.left - rect.width / 2) / rect.width) * 10,
    )
  }
  useEffect(() => {
    if (!cursor) {
      rotateX.set(0)
      rotateY.set(0)
    }
  }, [cursor, rotateX, rotateY])
  return (
    <motion.div
      className={`relative ${className}`}
      onPointerMove={move}
      onPointerLeave={() => {
        rotateX.set(0)
        rotateY.set(0)
      }}
      style={{ rotateX, rotateY, transformPerspective: book ? 900 : 1200 }}
      whileHover={cursor ? { y: -5, scale: book ? 1.015 : 1 } : undefined}
      transition={{ duration: 0.35 }}
    >
      {children}
    </motion.div>
  )
}
export function useMagnetic(active: boolean) {
  const { cursor } = useMotionPreferences()
  const x = useSpring(0, { stiffness: 180, damping: 20 })
  const y = useSpring(0, { stiffness: 180, damping: 20 })
  useEffect(() => {
    if (!cursor || !active) {
      x.set(0)
      y.set(0)
    }
  }, [cursor, active, x, y])
  return {
    style: { x, y },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (!cursor || !active || event.pointerType !== "mouse") return
      const rect = event.currentTarget.getBoundingClientRect()
      x.set(
        Math.max(
          -6,
          Math.min(6, (event.clientX - rect.left - rect.width / 2) * 0.09),
        ),
      )
      y.set(
        Math.max(
          -4,
          Math.min(4, (event.clientY - rect.top - rect.height / 2) * 0.09),
        ),
      )
    },
    onPointerLeave: () => {
      x.set(0)
      y.set(0)
    },
    whileHover: cursor && active ? { scale: 1.035 } : undefined,
    whileTap: { scale: 0.97 },
  }
}
export function Floating({
  children,
  className = "",
  duration = 6,
  delay = 0,
  orbit = false,
}: {
  children: ReactNode
  className?: string
  duration?: number
  delay?: number
  orbit?: boolean
}) {
  const { enabled } = useMotionPreferences()
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { margin: "100px" })
  return (
    <motion.div
      ref={ref}
      className={className}
      animate={
        enabled && visible
          ? { y: [0, -8, 0], x: orbit ? [0, 5, -3, 0] : 0, rotate: [0, 2, 0] }
          : { y: 0, x: 0, rotate: 0 }
      }
      transition={{
        duration,
        delay,
        repeat: enabled && visible ? Infinity : 0,
        ease: "easeInOut",
      }}
    >
      {children}
    </motion.div>
  )
}
export function DepthScene({
  render,
}: {
  render: (
    layer: (
      speed: number,
    ) => {
      x: ReturnType<typeof useSpring>
      y: ReturnType<typeof useSpring>
    },
  ) => ReactNode
}) {
  const { cursor, enabled } = useMotionPreferences()
  const targetX = useMotionValue(0)
  const targetY = useMotionValue(0)
  const x = useSpring(targetX, { stiffness: 55, damping: 18 })
  const y = useSpring(targetY, { stiffness: 55, damping: 18 })
  const backX = useTransform(x, (value) => value * 0.45)
  const backY = useTransform(y, (value) => value * 0.45)
  const rikoX = useTransform(x, (value) => value * -0.65)
  const rikoY = useTransform(y, (value) => value * -0.4)
  const frontX = useTransform(x, (value) => value)
  const frontY = useTransform(y, (value) => value)
  useEffect(() => {
    if (!cursor) {
      targetX.set(0)
      targetY.set(0)
    }
  }, [cursor, targetX, targetY])
  return (
    <motion.div
      initial={enabled ? { opacity: 0, scale: 0.96 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.15 }}
      className="relative mx-auto h-[390px] w-full max-w-[530px] sm:h-[475px] lg:h-[510px]"
      onPointerMove={(event) => {
        if (!cursor || event.pointerType !== "mouse") return
        const rect = event.currentTarget.getBoundingClientRect()
        targetX.set(
          ((event.clientX - rect.left - rect.width / 2) / rect.width) * 24,
        )
        targetY.set(
          ((event.clientY - rect.top - rect.height / 2) / rect.height) * 18,
        )
      }}
      onPointerLeave={() => {
        targetX.set(0)
        targetY.set(0)
      }}
    >
      {render((speed) =>
        speed < 0
          ? { x: rikoX, y: rikoY }
          : speed < 1
            ? { x: backX, y: backY }
            : { x: frontX, y: frontY },
      )}
    </motion.div>
  )
}
export function AnimatedNumber({
  value,
  delay = 0,
}: {
  value: number
  delay?: number
}) {
  const { enabled } = useMotionPreferences()
  const ref = useRef<HTMLSpanElement>(null)
  const visible = useInView(ref, { once: true })
  const [number, setNumber] = useState(enabled ? 0 : value)
  const previous = useRef(number)
  useEffect(() => {
    if (!enabled) {
      setNumber(value)
      previous.current = value
      return
    }
    if (!visible) return
    const control = animate(previous.current, value, {
      duration: 1.15,
      delay,
      ease: "easeOut",
      onUpdate: (latest) => {
        previous.current = latest
        setNumber(Math.round(latest))
      },
    })
    return () => control.stop()
  }, [visible, enabled, value, delay])
  return (
    <span ref={ref} aria-label={String(value)}>
      {number}
    </span>
  )
}
export function Marquee() {
  return (
    <div
      className="overflow-hidden bg-primary py-4 text-background"
      aria-label="Đọc, khám phá, xem video, chơi quiz, học cùng Riko"
    >
      <div
        className="motion-marquee flex w-max gap-10 pr-10 text-sm font-bold tracking-[.14em]"
        aria-hidden="true"
      >
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className="flex items-center gap-10">
            ĐỌC <Sparkles size={17} className="text-[#FBAF37]" /> KHÁM PHÁ{" "}
            <Sparkles size={17} className="text-[#FBAF37]" /> XEM VIDEO{" "}
            <Sparkles size={17} className="text-[#FBAF37]" /> CHƠI QUIZ{" "}
            <Sparkles size={17} className="text-[#FBAF37]" /> HỌC CÙNG RIKO{" "}
            <Sparkles size={17} className="text-[#FBAF37]" />
          </span>
        ))}
      </div>
    </div>
  )
}
export type StoryStage = {
  title: string
  label: string
  text: string
  visual: ReactNode
}
export function ScrollStory({ stages }: { stages: StoryStage[] }) {
  const { enabled, desktop } = useMotionPreferences()
  const cinematic = enabled && desktop
  const ref = useRef<HTMLElement>(null)
  const [stage, setStage] = useState(0)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  })
  const pathLength = useTransform(scrollYProgress, [0, 1], [0.02, 1])
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (cinematic)
      setStage(
        Math.min(
          stages.length - 1,
          Math.floor(Math.max(0, value) * stages.length),
        ),
      )
  })
  function go(index: number) {
    if (cinematic && ref.current) {
      const top = window.scrollY + ref.current.getBoundingClientRect().top
      window.scrollTo({
        top:
          top +
          (ref.current.offsetHeight - window.innerHeight) *
            ((index + 0.2) / stages.length),
        behavior: "smooth",
      })
    } else setStage(index)
  }
  return (
    <section
      ref={ref}
      className={`relative bg-[#3F97D2]/[.07] ${
        cinematic ? "h-[350vh]" : "py-12"
      }`}
      aria-label="Đọc, quét, xem và chơi cùng Riko"
    >
      <div
        className={
          cinematic
            ? "sticky top-0 flex min-h-screen items-center px-6 py-28"
            : "px-6"
        }
      >
        <div className="mx-auto w-full max-w-[1100px]">
          <Reveal>
            <p className="mb-3 text-center text-xs font-bold tracking-[.14em] text-[#1D80C4]">
              TỪ TRANG SÁCH ĐẾN THẾ GIỚI SỐ
            </p>
            <h2 className="mb-9 text-center text-3xl md:text-[42px]">
              Đọc. Quét. Xem. Chơi.
              <br className="sm:hidden" /> Cả một thế giới!
            </h2>
          </Reveal>
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <div
                className="mb-6 flex flex-wrap gap-2"
                role="group"
                aria-label="Các bước khám phá"
              >
                {stages.map((item, index) => (
                  <button
                    type="button"
                    aria-pressed={stage === index}
                    aria-label={`${index + 1}. ${item.title}`}
                    aria-controls="story-stage"
                    id={`story-tab-${index}`}
                    key={item.title}
                    onClick={() => go(index)}
                    className={`flex size-10 items-center justify-center rounded-full border text-sm font-bold transition ${
                      stage === index
                        ? "border-primary bg-primary text-white"
                        : "border-primary/15 bg-white text-primary hover:border-primary"
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={stage}
                  initial={enabled ? { opacity: 0, y: 14 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={enabled ? { opacity: 0, y: -10 } : undefined}
                  transition={{ duration: 0.3 }}
                >
                  <p className="mb-3 text-xs font-bold tracking-widest text-[#1D80C4]">
                    {stages[stage].label}
                  </p>
                  <h3 className="text-3xl leading-tight md:text-4xl">
                    {stages[stage].title}
                  </h3>
                  <p className="mt-4 max-w-md text-base leading-8 text-[#4A5461]">
                    {stages[stage].text}
                  </p>
                </motion.div>
              </AnimatePresence>
              <div className="relative mt-8">
                <svg
                  viewBox="0 0 450 90"
                  className="w-full max-w-md"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12 48C80-9 128 105 205 45S330 12 435 48"
                    stroke="#374BA0"
                    opacity=".12"
                    strokeWidth="3"
                  />
                  <motion.path
                    d="M12 48C80-9 128 105 205 45S330 12 435 48"
                    stroke="#1D80C4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    style={
                      cinematic
                        ? { pathLength }
                        : { pathLength: (stage + 1) / stages.length }
                    }
                  />
                  {[12, 98, 183, 267, 352, 435].map((x, index) => (
                    <circle
                      key={x}
                      cx={x}
                      cy={index % 2 ? 43 : 48}
                      r="5"
                      fill={index <= stage ? "#1D80C4" : "#3F97D2"}
                      opacity={index <= stage ? 1 : 0.25}
                    />
                  ))}
                </svg>
                <p className="mt-1 text-xs font-semibold text-primary/60">
                  {cinematic
                    ? "Cuộn chậm để mở từng điều kỳ diệu"
                    : "Chạm vào mỗi bước để khám phá"}{" "}
                  <ArrowRight size={12} className="ml-1 inline" />
                </p>
              </div>
            </div>
            <div
              id="story-stage"
              role="region"
              aria-labelledby={`story-tab-${stage}`}
              className="relative flex h-[330px] items-center justify-center overflow-hidden rounded-[32px] border border-primary/10 bg-white/80 shadow-[0_20px_70px_#374BA008] sm:h-[410px]"
            >
              <div className="absolute inset-8 rounded-[45%] bg-[#3F97D2]/10" />
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={stage}
                  className="relative flex h-full w-full items-center justify-center"
                  initial={enabled ? { opacity: 0, scale: 0.92, y: 12 } : false}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={
                    enabled ? { opacity: 0, scale: 1.04, y: -12 } : undefined
                  }
                  transition={{ duration: 0.4 }}
                >
                  {stages[stage].visual}
                </motion.div>
              </AnimatePresence>
              <Sparkles
                size={24}
                className="absolute right-7 top-7 text-[#FBAF37]"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
export function HorizontalAdventure({
  children,
  title,
}: {
  children: ReactNode
  title: ReactNode
}) {
  const { enabled, desktop } = useMotionPreferences()
  const cinematic = enabled && desktop
  const section = useRef<HTMLElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [distance, setDistance] = useState(0)
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end end"],
  })
  const x = useTransform(
    scrollYProgress,
    (value) => -Math.max(0, value) * distance,
  )
  useEffect(() => {
    const measure = () => {
      const style = viewport.current ? getComputedStyle(viewport.current) : null
      const padding = style
        ? parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
        : 0
      setDistance(
        Math.max(
          0,
          (track.current?.scrollWidth || 0) -
            (viewport.current?.clientWidth || 0) +
            padding,
        ),
      )
    }
    const observer = new ResizeObserver(measure)
    if (track.current) observer.observe(track.current)
    if (viewport.current) observer.observe(viewport.current)
    measure()
    return () => observer.disconnect()
  }, [])
  return (
    <section
      ref={section}
      className={`relative ${cinematic ? "h-[230vh]" : "py-14"}`}
    >
      <div
        className={
          cinematic
            ? "sticky top-0 flex h-screen flex-col justify-center py-28"
            : ""
        }
      >
        <div className="mx-auto mb-8 w-full max-w-[1160px] px-6">
          <Reveal>{title}</Reveal>
          <p className="mt-3 text-sm text-[#4A5461]">
            {cinematic
              ? "Cuộn để đi qua từng chương cùng Riko."
              : "Vuốt ngang để chọn cuộc phiêu lưu của bạn."}
          </p>
        </div>
        <div
          ref={viewport}
          className={`mx-auto w-full max-w-[1160px] px-6 ${
            cinematic
              ? "overflow-hidden"
              : "overflow-x-auto snap-x snap-mandatory"
          }`}
        >
          <motion.div
            ref={track}
            className="flex w-max gap-6 pb-6 pt-3"
            style={{ x: cinematic ? x : 0 }}
          >
            {children}
          </motion.div>
        </div>
        <div className="mx-auto mt-3 w-full max-w-[1112px] px-6">
          <div className="h-1 overflow-hidden rounded-full bg-primary/10">
            <motion.div
              className="h-full origin-left rounded-full bg-[#1D80C4]"
              style={cinematic ? { scaleX: scrollYProgress } : { scaleX: 1 }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
export function QRScanner({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      {children}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl"
        aria-hidden="true"
      >
        <span className="absolute -left-1 -top-1 size-5 rounded-tl-lg border-l-2 border-t-2 border-[#1D80C4]" />
        <span className="absolute -right-1 -top-1 size-5 rounded-tr-lg border-r-2 border-t-2 border-[#1D80C4]" />
        <span className="absolute -bottom-1 -left-1 size-5 rounded-bl-lg border-b-2 border-l-2 border-[#1D80C4]" />
        <span className="absolute -bottom-1 -right-1 size-5 rounded-br-lg border-b-2 border-r-2 border-[#1D80C4]" />
        <span className="motion-scan absolute inset-x-3 top-3 h-px bg-[#1D80C4]/50 shadow-[0_0_8px_#3F97D233]" />
      </div>
    </div>
  )
}
export function RewardBurst({ points = 10 }: { points?: number }) {
  const { enabled } = useMotionPreferences()
  return (
    <div
      className="pointer-events-none absolute right-6 top-4"
      aria-hidden="true"
    >
      <motion.span
        className="block text-2xl font-bold text-[#28823F]"
        initial={enabled ? { opacity: 0, y: 12, scale: 0.8 } : false}
        animate={{ opacity: 1, y: -7, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        +{points}
      </motion.span>
      {enabled &&
        [-1, 0, 1].map((direction, index) => (
          <motion.span
            key={index}
            className="absolute left-2 top-4 text-[#FBAF37]"
            initial={{ opacity: 1, x: 0, y: 0, scale: 0.6 }}
            animate={{
              opacity: 0,
              x: direction * 35,
              y: -45 - index * 10,
              scale: 1,
              rotate: direction * 35,
            }}
            transition={{ duration: 1, delay: index * 0.08 }}
          >
            <Star size={13} fill="currentColor" />
          </motion.span>
        ))}
    </div>
  )
}
export function RikoLoading({
  label = "Riko đang chuẩn bị...",
}: {
  label?: string
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-background p-8"
    >
      <div className="relative">
        <Floating duration={4}>
          <img src={rikoWelcome} alt="" className="h-24 w-20 object-contain" />
        </Floating>
        <Star
          size={18}
          className="motion-orbit absolute -right-3 top-3 text-[#FBAF37]"
          fill="currentColor"
        />
      </div>
      <span className="text-sm font-semibold text-primary">{label}</span>
      <span className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`size-1.5 rounded-full bg-[#3F97D2] motion-dot ${
              index === 1
                ? "[animation-delay:.2s]"
                : index === 2
                  ? "[animation-delay:.4s]"
                  : ""
            }`}
          />
        ))}
      </span>
    </div>
  )
}
