import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from "react"
import {
  createBrowserRouter,
  RouterProvider,
  Link,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router"
import {
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Play,
  ShoppingBag,
  Menu,
  X,
  Star,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Minus,
  Plus,
  ShieldCheck,
  Heart,
  Brain,
  ScanLine,
  Gamepad2,
  Check,
  Upload,
  Download,
  Copy,
  Trash2,
  LayoutDashboard,
  Video,
  QrCode,
  Settings,
  Users,
  Package,
  Search,
  Maximize,
  Volume2,
  Mail,
  Camera,
  Globe,
  Leaf,
  Trophy,
  LogOut,
  Pencil,
  Smartphone,
  LockKeyhole,
  UserRound,
} from "lucide-react"
import { motion, AnimatePresence, useInView } from "motion/react"
import {
  MotionProvider,
  MotionToggle,
  useMotionPreferences,
  Reveal,
  Tilt,
  useMagnetic,
  Floating,
  DepthScene,
  AnimatedNumber,
  Marquee,
  ScrollStory,
  HorizontalAdventure,
  QRScanner,
  RewardBurst,
  RikoLoading,
} from "./Motion"
import VideoMascot from "./VideoMascot"
import { isAppwriteConfigured } from "../lib/appwriteConfig"
import type {
  OrderRecord,
  QuizQuestion,
  QuizRecord,
  QuizProfile,
  QuizUser,
  VideoRecord,
} from "../lib/appwrite"
import rikoWelcome from "../assets/riko/welcome.webp"
import rikokidLogo from "../assets/rikokid-logo.webp"
import rikokidLogoTransparent from "../assets/rikokid-logo-transparent.webp"
import rikoHappy from "../assets/riko/happy.png"
import rikoPointing from "../assets/riko/pointing.png"
import rikoThinking from "../assets/riko/thinking.png"
import rikoCelebrating from "../assets/riko/celebrating.png"
import rikoSurprised from "../assets/riko/surprised.png"
import rikoEncouraging from "../assets/riko/encouraging.png"
import rikoActivity from "../assets/riko/activity.png"
import rikoExplaining from "../assets/riko/explaining.png"
import bookVideoManifest from "../data/bookVideoSlots.json"
import arVideoPresentations from "../data/arVideoPresentation.json"
import { bookProducts, getBookProduct } from "../data/bookProducts"
const ARScan = lazy(() => import("./ARScan"))

const createOrder: typeof import("../lib/appwrite").createOrder = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.createOrder(...args))
const createQuiz: typeof import("../lib/appwrite").createQuiz = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.createQuiz(...args))
const createVideo: typeof import("../lib/appwrite").createVideo = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.createVideo(...args))
const deleteQuiz: typeof import("../lib/appwrite").deleteQuiz = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.deleteQuiz(...args))
const deleteVideo: typeof import("../lib/appwrite").deleteVideo = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.deleteVideo(...args))
const getVideoByChapter: typeof import("../lib/appwrite").getVideoByChapter = (
  ...args
) => import("../lib/appwrite").then((appwrite) => appwrite.getVideoByChapter(...args))
const getVideoById: typeof import("../lib/appwrite").getVideoById = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.getVideoById(...args))
const getAdminUser: typeof import("../lib/appwrite").getAdminUser = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.getAdminUser(...args))
const listOrders: typeof import("../lib/appwrite").listOrders = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.listOrders(...args))
const listQuizzes: typeof import("../lib/appwrite").listQuizzes = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.listQuizzes(...args))
const listVideos: typeof import("../lib/appwrite").listVideos = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.listVideos(...args))
const loginAdmin: typeof import("../lib/appwrite").loginAdmin = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.loginAdmin(...args))
const requestPasswordRecovery: typeof import("../lib/appwrite").requestPasswordRecovery = (
  ...args
) => import("../lib/appwrite").then((appwrite) => appwrite.requestPasswordRecovery(...args))
const completePasswordRecovery: typeof import("../lib/appwrite").completePasswordRecovery = (
  ...args
) => import("../lib/appwrite").then((appwrite) => appwrite.completePasswordRecovery(...args))
const getQuizUser: typeof import("../lib/appwrite").getQuizUser = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.getQuizUser(...args))
const registerQuizUser: typeof import("../lib/appwrite").registerQuizUser = (
  ...args
) => import("../lib/appwrite").then((appwrite) => appwrite.registerQuizUser(...args))
const loginQuizUser: typeof import("../lib/appwrite").loginQuizUser = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.loginQuizUser(...args))
const updateQuizProfile: typeof import("../lib/appwrite").updateQuizProfile = (
  ...args
) => import("../lib/appwrite").then((appwrite) => appwrite.updateQuizProfile(...args))
const saveQuizResultToAccount: typeof import("../lib/appwrite").saveQuizResult = (
  ...args
) => import("../lib/appwrite").then((appwrite) => appwrite.saveQuizResult(...args))
const logoutQuizUser: typeof import("../lib/appwrite").logoutQuizUser = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.logoutQuizUser(...args))
const logoutAdmin: typeof import("../lib/appwrite").logoutAdmin = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.logoutAdmin(...args))
const updateOrderStatus: typeof import("../lib/appwrite").updateOrderStatus = (
  ...args
) => import("../lib/appwrite").then((appwrite) => appwrite.updateOrderStatus(...args))
const updateVideo: typeof import("../lib/appwrite").updateVideo = (...args) =>
  import("../lib/appwrite").then((appwrite) => appwrite.updateVideo(...args))

function ARScanRoute() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-5 py-16 text-center text-primary">Đang tải công cụ quét AR…</main>}>
      <ARScan />
    </Suspense>
  )
}

const money = (value: number) => value.toLocaleString("vi-VN") + "đ"
const bookTitle = "Riko & khu rừng kỳ diệu"
const guestQuizScores = (): Record<string, number> => {
  try {
    const scores = JSON.parse(localStorage.getItem("rikokid-quiz-scores") || "{}")
    return scores && typeof scores === "object" ? scores : {}
  } catch {
    return {}
  }
}
async function mergeGuestQuizScores(user: QuizUser) {
  const localScores = guestQuizScores()
  const bestScores = { ...user.quizProfile.bestScores }
  let changed = false
  for (const [key, score] of Object.entries(localScores)) {
    const best = Math.max(0, Number(score) || 0)
    if (best > (bestScores[key] || 0)) {
      bestScores[key] = best
      changed = true
    }
  }
  return changed
    ? updateQuizProfile({ ...user.quizProfile, bestScores })
    : user
}
type VideoItem = VideoRecord
type QRVideoSlot = {
  id: string
  title: string
  chapter: string
  label: string
  group: string
  document: string
  page: number | null
  cover: "front" | "back" | null
  arTargetId?: string | null
  arVideoUrl?: string | null
  pageClass?: string
}
const initialVideos: VideoItem[] = [
  {
    id: "1",
    title: "Cánh cửa vào khu rừng kỳ diệu",
    chapter: "Chương 1",
    duration: "03:24",
  },
  {
    id: "2",
    title: "Bí mật của những người bạn nhỏ",
    chapter: "Chương 2",
    duration: "04:12",
  },
  {
    id: "3",
    title: "Đi tìm ngôi sao dũng cảm",
    chapter: "Chương 3",
    duration: "02:58",
  },
]
const legacyQrVideoSlots: QRVideoSlot[] = [
  {
    id: "chapter-1",
    title: "Cánh cửa vào khu rừng kỳ diệu",
    chapter: "Chương 1",
    label: "Chương 1",
    group: "Chương 1",
    document: "",
    page: null,
    cover: null,
  },
  {
    id: "chapter-2",
    title: "Bí mật của những người bạn nhỏ",
    chapter: "Chương 2",
    label: "Chương 2",
    group: "Chương 2",
    document: "",
    page: null,
    cover: null,
  },
  {
    id: "chapter-3",
    title: "Đi tìm ngôi sao dũng cảm",
    chapter: "Chương 3",
    label: "Chương 3",
    group: "Chương 3",
    document: "",
    page: null,
    cover: null,
  },
]
const bookVideoSlots = bookVideoManifest.slots as QRVideoSlot[]
const qrVideoSlots = [...legacyQrVideoSlots, ...bookVideoSlots]
const publicSiteOrigin = bookVideoManifest.publicOrigin
const bookVideoSlotGroups = bookVideoManifest.sourceDocuments.map(
  ({ chapter }) => ({
    label: `Chương ${chapter}`,
    slots: bookVideoSlots.filter((slot) => slot.group === `Chương ${chapter}`),
  }),
)
function findQrSlot(chapter: string) {
  return qrVideoSlots.find(
    (slot) => slot.chapter === chapter || slot.id === chapter,
  )
}
function displayVideoChapter(chapter: string) {
  return findQrSlot(chapter)?.label || chapter
}
function videoChapterGroup(chapter: string) {
  return findQrSlot(chapter)?.group || chapter
}
const questions = [
  {
    text: "Riko đã tìm thấy gì trong khu rừng?",
    answers: [
      "Một chiếc chìa khóa",
      "Một quyển sách",
      "Một ngôi sao",
      "Một chiếc hộp",
    ],
    correct: 2,
    hint: "Vật này lấp lánh trên bầu trời đêm!",
  },
  {
    text: "Chúng mình nên làm gì để bảo vệ khu rừng?",
    answers: [
      "Trồng thêm cây",
      "Vứt rác xuống suối",
      "Bẻ cành cây",
      "Hái hết hoa",
    ],
    correct: 0,
    hint: "Hãy giúp khu rừng có thêm màu xanh.",
  },
  {
    text: "Khi một người bạn gặp khó khăn, Riko làm gì?",
    answers: ["Bỏ đi", "Giúp đỡ bạn", "Trốn vào nhà", "Không quan tâm"],
    correct: 1,
    hint: "Riko luôn có một trái tim ấm áp.",
  },
  {
    text: "Điều gì làm nên một nhà thám hiểm giỏi?",
    answers: [
      "Đi một mình",
      "Không đặt câu hỏi",
      "Tò mò và dũng cảm",
      "Ngủ cả ngày",
    ],
    correct: 2,
    hint: "Luôn sẵn sàng khám phá và học điều mới.",
  },
]
type Context = {
  quantity: number
  setQuantity: (n: number) => void
  cartProductId: string
  setCartProductId: (id: string) => void
  notify: (s: string) => void
  videos: VideoItem[]
  setVideos: (v: VideoItem[]) => void
  quizzes: QuizRecord[]
  setQuizzes: (v: QuizRecord[]) => void
  score: number
  setScore: (n: number) => void
  lastQuizKey: string
  setLastQuizKey: (key: string) => void
  quizUser: QuizUser | null
  quizAuthReady: boolean
  loginQuiz: (email: string, password: string) => Promise<void>
  registerQuiz: (input: {
    guardianName: string
    email: string
    password: string
    childNickname: string
    interests: string[]
  }) => Promise<void>
  updateQuizAccountProfile: (profile: QuizProfile) => Promise<void>
  logoutQuiz: () => Promise<void>
  saveQuizProgress: (key: string, score: number) => Promise<void>
  adminUser: { $id: string; name: string; email: string } | null
  authReady: boolean
  ensureAdminSession: () => Promise<{ $id: string; name: string; email: string } | null>
  loadVideos: () => Promise<void>
  loadQuizzes: (publishedOnly?: boolean) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  backendError: string
}
const Store = createContext<Context>(null!)
const useStore = () => useContext(Store)
const MotionLink = motion.create(Link)
function Button({
  children,
  to,
  onClick,
  secondary = false,
  className = "",
  disabled = false,
  onGuide,
}: {
  children: ReactNode
  to?: string
  onClick?: () => void
  secondary?: boolean
  className?: string
  disabled?: boolean
  onGuide?: (active: boolean) => void
}) {
  const location = useLocation()
  const { enabled } = useMotionPreferences()
  const magnetic = useMagnetic(
    !secondary && !disabled && !location.pathname.startsWith("/admin"),
  )
  const classes = `group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-semibold transition-colors duration-300 disabled:opacity-40 [&>svg]:transition-transform [&>svg]:duration-300 hover:[&>svg]:translate-x-0.5 ${
    secondary
      ? "border border-primary/15 bg-white/50 text-primary hover:bg-white"
      : "bg-primary text-white shadow-sm hover:bg-[#096193]"
  } ${className}`
  return to ? (
    <MotionLink
      to={to}
      viewTransition={enabled}
      onClick={onClick}
      className={classes}
      {...magnetic}
      onHoverStart={() => onGuide?.(true)}
      onHoverEnd={() => onGuide?.(false)}
      onFocus={() => onGuide?.(true)}
      onBlur={() => onGuide?.(false)}
    >
      {children}
    </MotionLink>
  ) : (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={classes}
      {...magnetic}
      onHoverStart={() => onGuide?.(true)}
      onHoverEnd={() => onGuide?.(false)}
    >
      {children}
    </motion.button>
  )
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose()
      }}
      className="fixed inset-0 m-auto max-h-[85vh] w-[calc(100%-32px)] max-w-lg overflow-y-auto rounded-[24px] border border-primary/10 bg-white p-7 text-foreground shadow-2xl backdrop:bg-primary/25"
    >
      <div className="mb-6 flex items-center justify-between gap-5">
        <h2 className="font-sans text-2xl">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="rounded-full bg-primary/5 p-2"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
const rikoPoses: Record<string, string> = {
  welcome: rikoWelcome,
  happy: rikoHappy,
  pointing: rikoPointing,
  thinking: rikoThinking,
  celebrating: rikoCelebrating,
  surprised: rikoSurprised,
  encouraging: rikoEncouraging,
  activity: rikoActivity,
  explaining: rikoExplaining,
  reading: rikoExplaining,
}
function Mascot({
  pose = "welcome",
  className = "",
}: {
  pose?: string
  className?: string
}) {
  const { enabled } = useMotionPreferences()
  const location = useLocation()
  const ref = useRef<HTMLImageElement>(null)
  const visible = useInView(ref, { margin: "80px" })
  const idle = enabled && visible && !location.pathname.startsWith("/admin")
  return (
    <motion.img
      ref={ref}
      src={rikoPoses[pose] || rikoWelcome}
      alt={`Riko — ${pose}`}
      className={`object-contain ${className}`}
      draggable={false}
      animate={
        idle ? { y: [0, -5, 0], rotate: [0, 0.7, 0] } : { y: 0, rotate: 0 }
      }
      transition={{
        duration: 5.5,
        repeat: idle ? Infinity : 0,
        ease: "easeInOut",
      }}
      whileHover={enabled ? { scale: 1.025 } : undefined}
    />
  )
}
function Scene({
  className = "",
  variant = 0,
  pose,
}: {
  className?: string
  variant?: number
  pose?: string
}) {
  return (
    <div
      className={`relative isolate overflow-hidden bg-[#3F97D2]/10 ${className}`}
    >
      <svg
        viewBox="0 0 650 520"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <circle cx="335" cy="238" r="190" fill="#3F97D2" opacity=".09" />
        <circle
          cx="335"
          cy="238"
          r="220"
          fill="none"
          stroke="#374BA0"
          strokeDasharray="6 14"
          opacity=".12"
        />
        <path
          d="M0 465Q115 390 250 465Q430 385 650 437V520H0Z"
          fill="#374BA0"
          opacity=".08"
        />
        <path
          d="M30 135Q20 107 46 102Q57 70 86 94Q116 90 119 119Q111 139 80 136Z"
          fill="white"
        />
        <path
          d="M493 172Q482 148 511 141Q520 116 545 134Q577 130 581 157Q579 178 541 172Z"
          fill="white"
        />
        <g fill="#FBAF37">
          <path d="M161 78L168 95L187 98L173 111L176 130L161 120L144 130L148 111L134 98L153 95Z" />
          <path d="M520 343L525 355L539 357L529 367L531 381L520 373L508 380L511 367L501 357L515 355Z" />
        </g>
        <g fill="none" stroke="#1D80C4" strokeWidth="3" strokeLinecap="round">
          <path
            d="M97 310Q139 259 156 330Q183 373 126 408"
            strokeDasharray="4 11"
          />
          <path d="M457 75L470 61M464 86L480 87M452 62L451 46" />
        </g>
        <circle cx="86" cy="220" r="7" fill="#F15A3E" opacity=".65" />
        <circle cx="553" cy="276" r="6" fill="#3F97D2" />
      </svg>
      <Mascot
        pose={
          pose ||
          (variant === 2
            ? "activity"
            : variant === 3
              ? "celebrating"
              : "explaining")
        }
        className="absolute bottom-[8%] left-[23%] h-[72%] w-[54%] drop-shadow-sm"
      />
    </div>
  )
}
function Cover({
  className = "",
  shared = false,
}: {
  className?: string
  shared?: boolean
}) {
  return (
    <Tilt book className={className}>
      <div
        style={shared ? { viewTransitionName: "rikokid-book" } : undefined}
        className="@container relative isolate h-full w-full overflow-hidden rounded-r-xl border-l-[7px] border-[#096193] bg-[#374BA0] shadow-[8px_12px_0_#374BA018,0_15px_30px_#374BA025]"
      >
        <div className="absolute inset-x-0 top-[6%] z-10 text-center">
          <p className="text-[3cqw] font-bold uppercase tracking-[.08em] text-white/70">
            Mỗi trang sách, một cuộc phiêu lưu
          </p>
          <h3 className="mt-[3%] font-display text-[16cqw] leading-none text-white">
            RIKOKID
          </h3>
          <p className="mt-[3%] font-display text-[6cqw] font-bold text-[#FBAF37]">
            & khu rừng kỳ diệu
          </p>
        </div>
        <div className="absolute -bottom-8 -left-12 h-[72%] w-[140%] rounded-[50%] bg-[#3F97D2]/10" />
        <div className="absolute -bottom-10 left-10 h-[59%] w-[110%] rounded-[50%] bg-[#FFFEF0]" />
        <Mascot
          pose="explaining"
          className="absolute bottom-[9%] left-[8%] h-[61%] w-[84%]"
        />
        <Star
          size={23}
          fill="#FBAF37"
          className="absolute left-5 top-[38%] -rotate-12 text-[#FBAF37]"
        />
        <Sparkles size={23} className="absolute right-4 top-[46%] text-white" />
        <p className="absolute inset-x-0 bottom-[3%] text-center text-[3.2cqw] font-bold tracking-[.15em] text-[#374BA0]">
          ĐỌC · XEM · CHƠI
        </p>
      </div>
    </Tilt>
  )
}
function Logo({ transparent = false }: { transparent?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="RIKOKID — Trang chủ"
      className="relative flex h-[88px] w-[180px] shrink-0 items-center justify-center overflow-hidden"
    >
      <img
        src={transparent ? rikokidLogoTransparent : rikokidLogo}
        alt=""
        loading={transparent ? "lazy" : undefined}
        decoding="async"
        className="absolute left-1/2 w-[220px] max-w-none -translate-x-1/2 -translate-y-1/2"
        style={{ top: "calc(50% - 2px)" }}
      />
    </Link>
  )
}
function Header() {
  const [open, setOpen] = useState(false)
  const { enabled } = useMotionPreferences()
  const { quantity } = useStore()
  const location = useLocation()
  useEffect(() => setOpen(false), [location])
  const links = [
    ["Trang chủ", "/"],
    ["Sách", "/book"],
    ["Quiz", "/quizzes"],
    ["Trải nghiệm AR", "/scan"],
    ["Về Riko", "/about"],
  ]
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95">
      <div className="mx-auto flex h-23 max-w-[1240px] items-center justify-between px-6 lg:px-10">
        <Logo />
        <nav className="hidden items-center gap-3 lg:flex xl:gap-5">
          {links.map(([label, path]) => (
            <Link
              key={path}
              to={path}
              viewTransition={enabled}
              aria-current={location.pathname === path ? "page" : undefined}
              className={
                path === "/scan"
                  ? `inline-flex shrink-0 items-center gap-2 rounded-full bg-[#F15A3E] px-3 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#D94B33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#374BA0] xl:px-4 ${
                      location.pathname === path
                        ? "ring-2 ring-[#FBAF37] ring-offset-2"
                        : ""
                    }`
                  : `relative shrink-0 py-3 text-sm font-semibold text-primary hover:text-[#1D80C4] xl:text-base ${
                      location.pathname === path
                        ? "after:absolute after:bottom-0 after:left-1/2 after:h-1 after:w-1 after:rounded-full after:bg-[#F15A3E]"
                        : ""
                    }`
              }
            >
              {path === "/scan" && <ScanLine size={17} aria-hidden="true" />}
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-3">
          <div className="hidden lg:block">
            <MotionToggle />
          </div>
          <Link
            to="/cart"
            aria-label="Giỏ hàng"
            className="relative rounded-full p-3 text-primary transition hover:bg-primary/5"
          >
            <ShoppingBag size={21} />
            {quantity > 0 && (
              <span className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-full bg-[#FBAF37] text-xs font-bold">
                {quantity}
              </span>
            )}
          </Link>
          <Link
            to="/tai-khoan"
            aria-label="Tài khoản quiz"
            title="Tài khoản phụ huynh"
            className="rounded-full p-3 text-primary transition hover:bg-primary/5"
          >
            <UserRound size={20} />
          </Link>
          <div className="hidden md:block">
            <Button to="/book" className="!px-5 !py-3">
              Đặt trước <ArrowRight size={15} />
            </Button>
          </div>
          <button
            onClick={() => setOpen(!open)}
            className="rounded-full p-2.5 text-primary hover:bg-primary/5 lg:hidden"
            aria-label="Mở menu"
            aria-expanded={open}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="absolute inset-x-0 top-full flex flex-col gap-4 border-b border-border bg-background p-6 shadow-lg">
          {links.map(([label, path]) => (
            <Link
              key={path}
              to={path}
              aria-current={location.pathname === path ? "page" : undefined}
              className={
                path === "/scan"
                  ? "inline-flex w-fit items-center gap-2 rounded-full bg-[#F15A3E] px-4 py-3 font-bold text-white shadow-sm transition hover:bg-[#D94B33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#374BA0]"
                  : "font-semibold text-primary hover:text-[#1D80C4]"
              }
            >
              {path === "/scan" && <ScanLine size={18} aria-hidden="true" />}
              {label}
            </Link>
          ))}
          <div className="flex items-center gap-3 border-t border-border pt-3">
            <MotionToggle />
            <span className="text-sm text-primary">Chuyển động nhẹ nhàng</span>
          </div>
        </nav>
      )}
    </header>
  )
}
function Footer() {
  return (
    <footer className="mt-10 border-t border-primary/10 bg-primary/5 px-6 py-12">
      <div className="mx-auto grid max-w-[1160px] gap-8 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          <Logo transparent />
          <p className="mt-4 max-w-xs text-sm leading-6 text-[#4A5461]">
            Mỗi trang sách mở ra một thế giới.
            <br />
            Mỗi cuộc phiêu lưu nuôi dưỡng một ước mơ.
          </p>
          <div className="mt-5 flex gap-4">
            <a aria-label="Facebook" href="https://facebook.com">
              <Globe size={17} />
            </a>
            <a aria-label="Instagram" href="https://instagram.com">
              <Camera size={17} />
            </a>
            <a aria-label="Email" href="mailto:hello@rikokid.vn">
              <Mail size={17} />
            </a>
          </div>
        </div>
        {[
          ["Khám phá", ["Sách Riko", "/book"], ["Quiz & trò chơi", "/quizzes"]],
          [
            "Cùng Riko",
            ["Về Riko", "/about"],
            ["Dành cho phụ huynh", "/parents"],
            ["Hướng dẫn", "/parents"],
          ],
          [
            "Kết nối",
            ["hello@rikokid.vn", "mailto:hello@rikokid.vn"],
            ["Đăng nhập tác giả", "/login"],
          ],
        ].map((group, index) => (
          <div key={index}>
            <h4 className="mb-5 text-base">{group[0] as string}</h4>
            {group.slice(1).map((item) => (
              <Link
                key={item[0]}
                to={item[1]}
                className="mb-3 block text-sm text-[#4A5461] hover:text-primary"
              >
                {item[0]}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="mx-auto mt-10 flex max-w-[1160px] flex-wrap justify-between gap-3 border-t border-primary/15 pt-6 text-xs text-[#4A5461]">
        <span>© 2026 RIKOKID. Được tạo nên bằng tình yêu và sự tò mò.</span>
        <span>Một cuốn sách. Vô vàn điều kỳ diệu. ✦</span>
      </div>
    </footer>
  )
}
function Layout() {
  const location = useLocation()
  const { enabled } = useMotionPreferences()
  const { ensureAdminSession, loadVideos, loadQuizzes } = useStore()
  const immersive =
    location.pathname.startsWith("/watch/") ||
    location.pathname === "/scan" ||
    ["/quiz", "/result"].includes(location.pathname)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])
  useEffect(() => {
    if (location.pathname === "/login") void ensureAdminSession()
    if (location.pathname === "/videos") void loadVideos()
    if (["/quizzes", "/quiz"].includes(location.pathname))
      void loadQuizzes(true)
  }, [location.pathname, ensureAdminSession, loadVideos, loadQuizzes])
  return (
    <>
      {immersive ? (
        <header className="mx-auto flex max-w-[1000px] items-center justify-between px-6 py-5">
          <Logo />
          <div className="flex items-center gap-3">
            <MotionToggle />
            <Link
              to={location.pathname.startsWith("/watch/") || location.pathname === "/scan" ? "/" : "/quizzes"}
              className="flex items-center gap-2 rounded-full border border-border bg-white p-3 text-base font-semibold text-primary"
              aria-label="Thoát"
            >
              <X size={18} />
              <span className="hidden sm:block">
                {location.pathname.startsWith("/watch/") || location.pathname === "/scan"
                  ? "Trang chủ"
                  : "Thoát"}
              </span>
            </Link>
          </div>
        </header>
      ) : (
        <Header />
      )}
      <motion.main
        key={location.pathname}
        initial={enabled && location.pathname !== "/scan" ? { opacity: 0, y: 8 } : false}
        animate={enabled && location.pathname !== "/scan" ? { opacity: 1, y: 0 } : false}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <Outlet />
      </motion.main>
      {!immersive && <Footer />}
    </>
  )
}
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[.12em] text-[#1D80C4]">
      <Sparkles size={14} />
      {children}
    </p>
  )
}
function SectionTitle({
  label,
  title,
  subtitle,
}: {
  label: string
  title: string
  subtitle?: string
}) {
  return (
    <Reveal className="mb-9 text-center">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#4A5461]">
        {label}
      </p>
      <h2 className="text-[30px] leading-tight md:text-[40px]">{title}</h2>
      {subtitle && (
        <p className="mt-3 text-base font-medium leading-7 text-[#4A5461]">
          {subtitle}
        </p>
      )}
    </Reveal>
  )
}
function StoryQR() {
  const [image, setImage] = useState("")
  useEffect(() => {
    let active = true
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(`${publicSiteOrigin}/watch/${bookVideoSlots[0].id}`, {
          width: 300,
          margin: 3,
          color: { dark: "#374BA0", light: "#FFFFFF" },
        }),
      )
      .then((value) => {
        if (active) setImage(value)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  return (
    <div className="rounded-2xl border border-primary/10 bg-white p-3 shadow-lg">
      {image ? (
        <img src={image} alt="Mã QR để xem video Riko" className="size-36" />
      ) : (
        <div className="flex size-36 items-center justify-center">
          <QrCode size={60} className="text-primary" />
        </div>
      )}
    </div>
  )
}
function Home() {
  const { quantity, setQuantity, setCartProductId, notify } = useStore()
  const [amount, setAmount] = useState(1)
  const { enabled } = useMotionPreferences()
  return (
    <>
      <motion.section className="relative isolate overflow-hidden bg-background">
        <div className="absolute -right-15 top-10 -z-10 hidden h-[560px] w-[650px] rounded-[45%_55%_60%_40%] brand-blob lg:block" />
        <div className="mx-auto grid max-w-[1240px] items-center gap-7 px-6 pb-13 pt-10 lg:grid-cols-[1.05fr_1fr] lg:px-10 lg:pb-15 lg:pt-13">
          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-primary/15 bg-white px-4 py-2 text-xs font-bold text-primary">
              <span className="size-2 rounded-full bg-[#F15A3E]" /> Đọc{" "}
              <span className="text-[#FBAF37]">•</span> Xem{" "}
              <span className="text-[#FBAF37]">•</span> Chơi
            </div>
            <h1 className="max-w-xl text-[43px] leading-[1.16] sm:text-[55px] lg:text-[63px]">
              <motion.span
                className="inline-block"
                initial={enabled ? { opacity: 0, y: 25 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.08 }}
              >
                Khám phá
              </motion.span>
              <br />
              <motion.span
                className="inline-block"
                initial={enabled ? { opacity: 0, scale: 0.95 } : false}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, delay: 0.2 }}
              >
                thế giới
              </motion.span>{" "}
              <motion.span
                className="inline-block"
                initial={enabled ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.35 }}
              >
                cùng
              </motion.span>
              <br />
              <motion.span
                className="relative inline-block text-[#F15A3E]"
                initial={enabled ? { opacity: 0, scale: 0.82, y: 10 } : false}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  type: "spring",
                  duration: 0.8,
                  bounce: 0.3,
                  delay: 0.45,
                }}
              >
                Riko!
                <svg
                  viewBox="0 0 190 15"
                  className="absolute -bottom-2 left-0 w-full"
                  aria-hidden="true"
                >
                  <motion.path
                    d="M3 8Q84-2 185 8M12 13Q98 4 165 12"
                    fill="none"
                    stroke="#FBAF37"
                    strokeWidth="3"
                    strokeLinecap="round"
                    initial={enabled ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.9, delay: 0.7 }}
                  />
                </svg>
              </motion.span>{" "}
              <motion.span
                className="inline-block -rotate-12 align-top text-[36px] text-[#FBAF37]"
                aria-hidden="true"
                animate={
                  enabled
                    ? { rotate: [-10, 6, -10], scale: [0.9, 1, 0.9] }
                    : undefined
                }
                transition={{ duration: 6, repeat: Infinity }}
              >
                ✦
              </motion.span>
            </h1>
            <p className="mt-7 max-w-[470px] text-base font-medium leading-[1.85] text-[#4A5461]">
              Mỗi trang sách là một cuộc phiêu lưu mới. Đọc câu chuyện, quét mã
              QR, xem video và cùng Riko vượt qua những thử thách thú vị.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                to="/book"
                className="!bg-[#F15A3E] !px-5 !py-4 !text-sm hover:!bg-[#F5801F] sm:!px-7 sm:!text-base"
              >
                Đặt trước sách <ArrowRight size={18} />
              </Button>
              <Button
                secondary
                to="/about"
                className="!px-4 !py-4 !text-sm sm:!px-6 sm:!text-base"
              >
                <Play size={16} /> Khám phá Riko
              </Button>
            </div>
            <div className="mt-8 flex items-center gap-3">
              <div className="flex -space-x-2">
                {["👩🏻", "👨🏽", "👩🏽", "👨🏻"].map((face, index) => (
                  <span
                    key={index}
                    className="flex size-9 items-center justify-center rounded-full border-2 border-background bg-[#3F97D2]/15 text-lg"
                  >
                    {face}
                  </span>
                ))}
              </div>
              <div>
                <div className="flex gap-0.5 text-[#FBAF37]">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star size={12} key={index} fill="currentColor" />
                  ))}
                </div>
                <p className="mt-1 text-xs text-[#4A5461]">
                  <b className="text-primary">1.000+</b> gia đình cùng khám phá
                </p>
              </div>
            </div>
          </div>
          <DepthScene
            render={(layer) => (
              <>
                <motion.div
                  className="brand-blob absolute inset-x-5 bottom-11 top-9 z-0 rounded-[46%_54%_42%_58%]"
                  style={layer(0.4)}
                  aria-hidden="true"
                />
                <motion.div
                  className="absolute inset-x-10 bottom-16 top-14 z-0 rotate-6 rounded-[50%] border-2 border-dashed border-[#3F97D2]/25"
                  style={layer(0.4)}
                  aria-hidden="true"
                />
                <motion.svg
                  viewBox="0 0 520 510"
                  className="absolute inset-0 z-0 h-full w-full"
                  style={layer(0.4)}
                  aria-hidden="true"
                >
                  <path
                    d="M401 91Q451 72 453 117Q447 160 413 148M38 305Q78 275 78 320Q68 358 31 370"
                    fill="none"
                    stroke="#3F97D2"
                    strokeWidth="2"
                    strokeDasharray="4 7"
                  />
                  <path
                    d="M67 399Q56 378 81 371Q91 352 110 368Q134 364 137 386Q133 404 108 400ZM388 238Q378 216 405 209Q415 186 438 203Q466 202 467 224Q464 242 435 239Z"
                    fill="white"
                  />
                  <ellipse
                    cx="255"
                    cy="461"
                    rx="116"
                    ry="12"
                    fill="#374BA0"
                    opacity=".08"
                  />
                </motion.svg>
                <motion.div
                  className="absolute bottom-[2%] left-[19%] z-30 h-[96%] w-[62%] drop-shadow-[0_12px_10px_#374BA015]"
                  style={layer(-1)}
                >
                  <VideoMascot />
                </motion.div>
                <motion.div
                  className="pointer-events-none absolute inset-0 z-20"
                  style={layer(1)}
                >
                  <Floating
                    className="absolute left-0 top-7 z-10 max-w-[230px]"
                    duration={7}
                  >
                    <div className="-rotate-6 rounded-[20px_20px_5px_20px] border border-primary/10 bg-white/90 px-5 py-3 shadow-[0_6px_20px_#374BA009] backdrop-blur-sm">
                      <p className="text-sm font-bold text-primary">
                        Chào bạn, mình là Riko! 👋
                      </p>
                      <p className="mt-1 text-xs text-[#4A5461]">
                        Cùng mình khám phá nhé!
                      </p>
                    </div>
                  </Floating>
                  <Floating
                    className="absolute right-0 top-28"
                    duration={6.5}
                    orbit
                  >
                    <div className="flex size-17 rotate-12 items-center justify-center rounded-2xl border-2 border-white bg-[#FBAF37]/20 shadow-sm">
                      <BookOpen
                        size={34}
                        className="text-[#F5801F]"
                        strokeWidth={1.7}
                      />
                    </div>
                  </Floating>
                  <Floating
                    className="absolute left-12 top-43 text-5xl text-[#FBAF37]"
                    duration={7.5}
                    delay={0.5}
                  >
                    ✦
                  </Floating>
                  <Floating
                    className="absolute right-16 top-4 text-5xl font-bold text-primary/70"
                    duration={8}
                    delay={1}
                  >
                    ?
                  </Floating>
                  <Floating
                    className="absolute bottom-24 right-5 text-[#F15A3E]"
                    duration={6}
                    orbit
                  >
                    <Sparkles size={29} />
                  </Floating>
                  <Floating
                    className="absolute bottom-1 left-0"
                    duration={8}
                    delay={0.7}
                  >
                    <div className="flex -rotate-3 items-center gap-3 rounded-2xl border border-primary/10 bg-white/90 px-5 py-3 shadow-sm backdrop-blur-sm">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-[#374BA0]/10">
                        <ScanLine size={23} className="text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-primary">
                          Một lần quét, thêm điều kỳ diệu!
                        </p>
                        <p className="mt-1 text-[11px] text-[#4A5461]">
                          Kết nối trang sách với thế giới sống động
                        </p>
                      </div>
                    </div>
                  </Floating>
                </motion.div>
                {[
                  [17, 30],
                  [83, 37],
                  [26, 72],
                  [75, 80],
                  [40, 12],
                  [91, 65],
                ].map(([left, top], index) => (
                  <motion.span
                    key={index}
                    aria-hidden="true"
                    className="pointer-events-none absolute size-1 rounded-full bg-[#3F97D2]/60"
                    style={{ left: left + "%", top: top + "%", ...layer(1) }}
                    animate={
                      enabled
                        ? {
                            opacity: [0.2, 0.65, 0.2],
                            y: [0, -7, 0],
                            scale: [0.8, 1.1, 0.8],
                          }
                        : undefined
                    }
                    transition={{
                      duration: 6 + index,
                      repeat: Infinity,
                      delay: index * 0.4,
                    }}
                  />
                ))}
              </>
            )}
          />
        </div>
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-center gap-x-12 gap-y-4 border-t border-primary/10 px-6 py-6 text-xs font-semibold text-[#4A5461]">
          {[
            [BookOpen, "Dành cho trẻ 6–12 tuổi"],
            [ShieldCheck, "Nội dung an toàn, chọn lọc"],
            [ScanLine, "Sách giấy + trải nghiệm số"],
            [Heart, "Học bằng sự tò mò"],
          ].map(([Icon, text]) => {
            const ItemIcon = Icon as typeof BookOpen
            return (
              <span key={String(text)} className="flex items-center gap-2">
                <ItemIcon size={17} className="text-primary" />
                {text as string}
              </span>
            )
          })}
        </div>
      </motion.section>
      <motion.section
        initial={enabled ? { opacity: 0, y: 14 } : false}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.08 }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-[1160px] px-6 py-15"
      >
        <SectionTitle
          label="HÀNH TRÌNH NHỎ, KHÁM PHÁ LỚN"
          title="Một quyển sách – Cả thế giới để khám phá"
          subtitle="Ba bước thật đơn giản. Vô vàn điều mới đang chờ bạn!"
        />
        <div className="relative grid gap-6 md:grid-cols-3">
          <svg
            viewBox="0 0 1000 100"
            className="absolute left-[13%] top-12 hidden w-[75%] md:block"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M0 46C110-15 230 112 360 44S605-3 720 50S875 106 1000 44"
              stroke="#3F97D2"
              strokeWidth="2"
              strokeDasharray="5 9"
            />
          </svg>
          {[
            {
              icon: BookOpen,
              title: "Đọc sách",
              desc: "Khám phá câu chuyện và đồng hành cùng Riko.",
              to: "/preview",
              color: "bg-[#374BA0]/10",
              ink: "text-primary",
            },
            {
              icon: ScanLine,
              title: "Quét QR",
              desc: "Quét mã QR được đặt trong từng phần của cuốn sách.",
              to: "/watch/1",
              color: "bg-[#3F97D2]/15",
              ink: "text-[#1D80C4]",
            },
            {
              icon: Gamepad2,
              title: "Xem & Chơi",
              desc: "Xem video, trả lời câu hỏi và nhận những phần thưởng thú vị.",
              to: "/quizzes",
              color: "bg-[#FBAF37]/15",
              ink: "text-[#F5801F]",
            },
          ].map((step, index) => (
            <Reveal key={step.title} delay={index * 0.1} direction="scale">
              <Tilt>
                <Link
                  to={step.to}
                  viewTransition={enabled}
                  className="group relative text-center"
                >
                  <div
                    className={`relative mx-auto mb-6 flex size-24 -rotate-3 items-center justify-center rounded-[28px] border-4 border-background transition group-hover:rotate-3 ${step.color}`}
                  >
                    <step.icon
                      size={38}
                      strokeWidth={1.6}
                      className={step.ink}
                    />
                    <span className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="text-2xl">{step.title}</h3>
                  <p className="mx-auto mt-3 max-w-[270px] text-sm font-medium leading-6 text-[#4A5461]">
                    {step.desc}
                  </p>
                </Link>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </motion.section>
      <motion.section
        initial={enabled ? { opacity: 0, y: 14 } : false}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.08 }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-[1160px] px-6 pb-15"
      >
        <div className="grid items-center gap-10 overflow-hidden rounded-[28px] border border-primary/10 bg-white px-7 py-10 md:grid-cols-2 md:px-12">
          <div className="relative flex min-h-94 items-center justify-center">
            <div className="absolute inset-5 rotate-6 rounded-[45%] bg-[#3F97D2]/10" />
            {bookProducts.filter((product) => !product.isCombo).map((product, index) => (
              <img
                key={product.id}
                src={product.cover}
                alt={`Bìa ${product.title}`}
                loading="lazy"
                className={`absolute w-[58%] rounded-xl border-4 border-white shadow-xl transition duration-500 hover:z-20 hover:scale-105 ${
                  index === 0
                    ? "left-[4%] top-[17%] -rotate-12"
                    : index === 1
                      ? "left-[21%] top-[7%] z-10 rotate-2"
                      : "right-[4%] top-[17%] rotate-12"
                }`}
              />
            ))}
            <div className="absolute bottom-4 right-4 z-20 rotate-3 rounded-full border-4 border-white bg-[#FBAF37] px-4 py-3 text-center text-xs font-bold text-[#6E493E] shadow-md">
              3 chủ đề
              <br />1 combo
            </div>
          </div>
          <div>
            <Eyebrow>CUỐN SÁCH CỦA RIKO</Eyebrow>
            <h2 className="text-3xl leading-tight md:text-[40px]">
              Ba quyển sách nhỏ.
              <br />
              Cả thế giới khám phá.
            </h2>
            <p className="mt-3 text-lg font-bold text-[#363B47]">
              Phương tiện · Động vật · Hiện tượng thiên nhiên
            </p>
            <p className="mt-3 text-sm font-medium leading-7 text-[#4A5461]">
              Ba quyển sách đưa bé khám phá phương tiện, thế giới động vật và
              những hiện tượng thiên nhiên cùng Riko.
            </p>
            <div className="my-4 flex flex-wrap gap-2">
              {["6–12 tuổi", "64 trang màu", "QR & video", "Quiz thú vị"].map(
                (text) => (
                  <span
                    key={text}
                    className="rounded-full bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary"
                  >
                    {text}
                  </span>
                ),
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-[#4A5461]">
              <span className="text-base text-[#FBAF37]">★★★★★</span> 4.9 / 5 ·
              128 đánh giá
            </div>
            <div className="my-5 flex items-center gap-3">
              <b className="text-3xl text-primary">299.000đ</b>
              <span className="text-sm text-[#4A5461]/60 line-through">
                350.000đ
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Qty value={amount} onChange={setAmount} />
              <Button
                to="/checkout"
                onClick={() => {
                  setCartProductId("vehicles")
                  setQuantity(amount)
                }}
              >
                Đặt trước <ShoppingBag size={16} />
              </Button>
              <Button secondary to="/preview">
                <BookOpen size={16} /> Xem thử
              </Button>
            </div>
            <button
              onClick={() => {
                setCartProductId("vehicles")
                setQuantity(quantity + amount)
                notify("Đã thêm sách vào giỏ. Riko đang chờ bạn!")
              }}
              className="mt-4 text-xs font-bold text-primary underline underline-offset-4"
            >
              Thêm vào giỏ hàng
            </button>
            <Link
              to="/book"
              className="mt-4 block text-sm font-bold text-[#F15A3E] underline underline-offset-4"
            >
              Xem 3 bìa sách · Combo đủ 3 quyển 799.000đ
            </Link>
          </div>
        </div>
      </motion.section>
      <Marquee />
      <ScrollStory
        stages={[
          {
            label: "01 · MỞ TRANG SÁCH",
            title: "Một trang sách. Một cánh cửa mới.",
            text: "Mở cuốn sách Rikokid và bước vào cuộc phiêu lưu cùng người bạn robot nhỏ.",
            visual: <Cover className="h-72 w-51 -rotate-6" />,
          },
          {
            label: "02 · QUÉT MÃ QR",
            title: "Điều kỳ diệu ẩn trong trang sách",
            text: "Tìm mã QR trong từng chương. Mỗi mã mở ra một câu chuyện sống động mới.",
            visual: (
              <>
                <Cover className="absolute left-[12%] h-64 w-45 -rotate-8" />
                <Floating className="absolute right-[15%]" duration={7}>
                  <StoryQR />
                </Floating>
              </>
            ),
          },
          {
            label: "03 · KẾT NỐI CÂU CHUYỆN",
            title: "Chỉ cần một lần quét",
            text: "Dùng camera điện thoại để quét mã. Không cần tài khoản, Riko đã sẵn sàng chào bạn!",
            visual: (
              <div className="relative rounded-[32px] border-[7px] border-primary bg-background px-6 pb-6 pt-10 shadow-xl">
                <div className="absolute left-1/2 top-3 h-1.5 w-14 -translate-x-1/2 rounded-full bg-primary/20" />
                <QRScanner>
                  <StoryQR />
                </QRScanner>
                <p className="mt-4 text-center text-xs font-bold text-primary">
                  Xin chào, nhà thám hiểm!
                </p>
              </div>
            ),
          },
          {
            label: "04 · CHƠI QUIZ",
            title: "Đến lượt bạn tỏa sáng!",
            text: "Cùng trả lời câu hỏi, thử lại nếu cần và khám phá những điều bạn vừa học được.",
            visual: (
              <div className="w-[85%] rotate-2 rounded-2xl border border-primary/10 bg-background p-6 shadow-lg">
                <p className="mb-3 text-xs font-bold text-[#1D80C4]">
                  RIKO CHALLENGE · CÂU 1 / 4
                </p>
                <h3 className="mb-4 text-xl">
                  Riko đã tìm thấy gì trong khu rừng?
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {questions[0].answers.map((answer, index) => (
                    <Link
                      key={answer}
                      to="/quiz"
                      className={`rounded-xl border p-3 text-xs font-semibold ${
                        index === 2
                          ? "border-[#59B447] bg-[#59B447]/10 text-[#28823F]"
                          : "border-primary/10 bg-white"
                      }`}
                    >
                      {answer}
                    </Link>
                  ))}
                </div>
              </div>
            ),
          },
          {
            label: "05 · NHẬN PHẦN THƯỞNG",
            title: "Mỗi khám phá là một kho báu",
            text: "Nhận ngôi sao, sưu tầm huy hiệu và cùng Riko ăn mừng. Học điều mới thật vui!",
            visual: (
              <>
                <Mascot pose="celebrating" className="h-64" />
                <Floating className="absolute right-8 top-14" duration={7}>
                  <Star
                    size={38}
                    fill="currentColor"
                    className="text-[#FBAF37]"
                  />
                </Floating>
                <span className="collectible absolute bottom-6 rounded-2xl border-2 border-dashed border-[#FBAF37] bg-background px-4 py-3 text-sm font-bold text-primary">
                  🏅 Nhà thám hiểm Riko
                </span>
              </>
            ),
          },
        ]}
      />
      <HorizontalAdventure
        title={
          <>
            <Eyebrow>ĐI XA HƠN TRÊN TỪNG TRANG SÁCH</Eyebrow>
            <h2 className="text-3xl md:text-[40px]">Cuộc phiêu lưu của Riko</h2>
          </>
        }
      >
        {[
          {
            title: "Cánh cửa khu rừng",
            text: "Một con đường nhỏ mở ra thế giới thật lớn.",
            pose: "welcome",
            status: "Sẵn sàng khám phá",
            to: "/watch/1",
          },
          {
            title: "Những người bạn nhỏ",
            text: "Đi tìm sức mạnh của tình bạn và lòng tốt.",
            pose: "encouraging",
            status: "Sẵn sàng khám phá",
            to: "/watch/2",
          },
          {
            title: "Ngôi sao dũng cảm",
            text: "Cùng Riko bước qua thử thách và tự tin hơn.",
            pose: "celebrating",
            status: "Sẵn sàng khám phá",
            to: "/watch/3",
          },
          {
            title: "Chuyến đi xanh",
            text: "Những hoạt động mới đang được Riko chuẩn bị.",
            pose: "activity",
            status: "Sắp ra mắt",
            to: "",
          },
          {
            title: "Kho báu tri thức",
            text: "Một bí mật mới đang chờ trên hành trình phía trước.",
            pose: "thinking",
            status: "Sắp ra mắt",
            to: "",
          },
        ].map((chapter, index) => (
          <Tilt
            key={chapter.title}
            className="w-[290px] shrink-0 snap-center sm:w-[330px]"
          >
            <div className="h-full overflow-hidden rounded-[24px] border border-primary/10 bg-white shadow-sm">
              <div className="relative flex h-48 items-center justify-center bg-[#3F97D2]/10">
                <Mascot pose={chapter.pose} className="h-40" />
                <span className="absolute left-5 top-5 rounded-full bg-white/85 px-3 py-1.5 text-xs font-bold text-primary">
                  CHƯƠNG 0{index + 1}
                </span>
                {!chapter.to && (
                  <LockKeyhole
                    size={18}
                    className="absolute right-5 top-6 text-primary/40"
                  />
                )}
              </div>
              <div className="p-6">
                <h3 className="text-xl">{chapter.title}</h3>
                <p className="mt-3 min-h-12 text-sm leading-6 text-[#4A5461]">
                  {chapter.text}
                </p>
                <p className="my-4 text-xs font-semibold text-primary/65">
                  {chapter.status}
                </p>
                {chapter.to ? (
                  <Button to={chapter.to} secondary>
                    Khám phá <ArrowRight size={15} />
                  </Button>
                ) : (
                  <Button disabled secondary>
                    Đang chuẩn bị
                  </Button>
                )}
              </div>
            </div>
          </Tilt>
        ))}
      </HorizontalAdventure>
      <motion.section
        initial={enabled ? { opacity: 0, y: 14 } : false}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.08 }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-[1160px] px-6"
      >
        <div className="grid items-center gap-10 rounded-[28px] bg-primary px-7 py-10 md:grid-cols-[1fr_1.1fr] md:px-12">
          <div>
            <p className="mb-3 text-xs font-bold tracking-[.1em] text-[#FBAF37]">
              THỬ THÁCH NHỎ, NIỀM VUI LỚN
            </p>
            <h2 className="text-4xl leading-tight text-white">
              Thử thách
              <br />
              cùng Riko!
            </h2>
            <p className="my-5 max-w-sm text-sm font-medium leading-7 text-white/80">
              Bạn hiểu câu chuyện đến đâu? Chinh phục câu đố, nhận ngôi sao và
              sưu tầm huy hiệu của riêng mình.
            </p>
            <Button
              to="/quiz"
              className="!bg-[#FBAF37] !text-[#363B47] hover:!bg-[#F5801F]"
            >
              <Gamepad2 size={20} /> Chơi ngay
            </Button>
          </div>
          <div className="relative">
            <div className="rotate-2 rounded-3xl bg-background p-6 shadow-xl">
              <div className="flex justify-between text-xs font-bold text-primary">
                <span>✦ RIKO CHALLENGE</span>
                <span>Câu 1 / 4</span>
              </div>
              <div className="my-4 h-2 rounded-full bg-primary/10">
                <div className="h-full w-1/4 rounded-full bg-[#3F97D2]" />
              </div>
              <h3 className="mb-5 text-xl leading-7">
                Riko đã tìm thấy gì trong khu rừng?
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {questions[0].answers.map((answer, index) => (
                  <Link
                    to="/quiz"
                    key={answer}
                    className="rounded-xl border border-primary/10 bg-white p-3.5 text-xs font-semibold transition hover:border-primary hover:bg-primary/5"
                  >
                    <span className="mr-2 text-primary">
                      {String.fromCharCode(65 + index)}.
                    </span>
                    {answer}
                  </Link>
                ))}
              </div>
            </div>
            <Mascot
              pose="encouraging"
              className="absolute -bottom-9 -right-6 hidden h-30 sm:block"
            />
          </div>
        </div>
      </motion.section>
      <motion.section
        initial={enabled ? { opacity: 0, y: 14 } : false}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.08 }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-[1160px] px-6 py-15"
      >
        <SectionTitle
          label="NIỀM VUI CHO CON, AN TÂM CHO BA MẸ"
          title="Lớn lên cùng những điều tốt đẹp"
        />
        <Reveal>
          <div className="mb-10 grid grid-cols-2 gap-4 rounded-3xl border border-primary/10 bg-white p-6 md:grid-cols-4">
            {[
              [64, "Trang sách đầy màu sắc"],
              [3, "Video câu chuyện"],
              [4, "Câu đố khám phá"],
              [1, "Người bạn đồng hành"],
            ].map(([value, label]) => (
              <div key={String(label)} className="text-center">
                <b className="text-3xl text-primary">
                  <AnimatedNumber value={Number(value)} />
                </b>
                <p className="mt-2 text-sm text-[#4A5461]">{label}</p>
              </div>
            ))}
          </div>
        </Reveal>
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              Heart,
              "Nuôi dưỡng sự tò mò",
              "Khuyến khích con hỏi, nghĩ và khám phá.",
            ],
            [
              Brain,
              "Ghi nhớ tự nhiên",
              "Học thông qua câu chuyện và trò chơi.",
            ],
            [
              ShieldCheck,
              "Nội dung an toàn",
              "Trải nghiệm được chọn lọc cho trẻ nhỏ.",
            ],
            [
              Leaf,
              "Chủ động học tập",
              "Mỗi cuộc phiêu lưu là một bài học mới.",
            ],
          ].map(([Icon, title, text]) => {
            const ItemIcon = Icon as typeof Heart
            return (
              <div key={String(title)} className="text-center">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/5">
                  <ItemIcon size={25} className="text-primary" />
                </div>
                <h3 className="text-base">{title as string}</h3>
                <p className="mt-2 text-sm leading-6 text-[#4A5461]">
                  {text as string}
                </p>
              </div>
            )
          })}
        </div>
        <div className="mt-9 text-center">
          <Link
            to="/parents"
            className="inline-flex items-center gap-2 text-sm font-bold text-primary"
          >
            Dành cho ba mẹ & thầy cô <ArrowRight size={16} />
          </Link>
        </div>
      </motion.section>
    </>
  )
}
function Qty({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div className="inline-flex items-center gap-5 rounded-full border border-border bg-white p-2">
      <button
        aria-label="Giảm số lượng"
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
        className="rounded-full p-2 disabled:opacity-30"
      >
        <Minus size={14} />
      </button>
      <span className="text-base">{value}</span>
      <button
        aria-label="Tăng số lượng"
        onClick={() => onChange(value + 1)}
        className="rounded-full p-2"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
function ProductShowcase() {
  const { enabled, desktop } = useMotionPreferences()
  const [active, setActive] = useState(0)
  const steps = [
    {
      title: "Câu chuyện cùng Riko",
      text: "Một ngôi sao thất lạc, những người bạn mới và một cuộc phiêu lưu đầy lòng tốt. Lật trang để mở trí tưởng tượng.",
      icon: BookOpen,
    },
    {
      title: "Video tương tác",
      text: "Những câu chuyện trên trang giấy tiếp tục trên màn hình. Video ngắn, dễ hiểu và chọn lọc cho các bạn nhỏ.",
      icon: Video,
    },
    {
      title: "Quét QR trong sách",
      text: "Từ trang sách đến video chỉ trong một lần quét. Không cần đăng nhập hay thao tác phức tạp.",
      icon: QrCode,
    },
    {
      title: "Quiz sau mỗi chương",
      text: "Câu hỏi thú vị giúp con ghi nhớ tự nhiên. Mỗi lần thử lại là một cơ hội học thêm điều mới.",
      icon: Gamepad2,
    },
    {
      title: "Nhận phần thưởng",
      text: "Ngôi sao và huy hiệu ghi nhận nỗ lực của con — không có bảng xếp hạng hay áp lực cạnh tranh.",
      icon: Trophy,
    },
  ]
  return (
    <section className="my-16 grid gap-10 rounded-[28px] bg-primary/5 px-6 py-10 lg:grid-cols-[1fr_1.15fr] lg:px-10">
      <div
        className={
          enabled && desktop ? "sticky top-28 self-start" : "self-start"
        }
      >
        <Eyebrow>MỘT CUỐN SÁCH, NHIỀU CÁCH KHÁM PHÁ</Eyebrow>
        <h2 className="mb-7 text-3xl leading-tight">
          Không chỉ là
          <br />
          một cuốn sách.
        </h2>
        <Floating duration={8}>
          <Cover className="mx-auto h-80 w-57 -rotate-5" />
        </Floating>
        <div className="mt-8 flex items-center justify-center gap-2">
          {steps.map((step, index) => (
            <span
              key={step.title}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                index === active ? "w-9 bg-primary" : "w-3 bg-primary/20"
              }`}
            />
          ))}
        </div>
        <p className="mt-3 text-center text-sm font-semibold text-primary">
          {steps[active].title}
        </p>
      </div>
      <div className="space-y-6">
        {steps.map((step, index) => (
          <motion.article
            key={step.title}
            onViewportEnter={() => setActive(index)}
            viewport={{ amount: 0.6 }}
            initial={enabled ? { opacity: 0, x: 20 } : false}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className={`rounded-[24px] border bg-white p-7 lg:min-h-57 ${
              active === index
                ? "border-primary/30 shadow-[0_8px_30px_#374BA009]"
                : "border-primary/10"
            }`}
          >
            <div className="mb-5 flex items-center justify-between">
              <step.icon size={28} className="text-[#1D80C4]" />
              <span className="text-sm font-bold text-primary/35">
                0{index + 1}
              </span>
            </div>
            <h3 className="text-2xl">{step.title}</h3>
            <p className="mt-3 text-base leading-7 text-[#4A5461]">
              {step.text}
            </p>
          </motion.article>
        ))}
      </div>
    </section>
  )
}
function Book() {
  const [amount, setAmount] = useState(1)
  const { quantity, setQuantity, cartProductId, setCartProductId, notify } = useStore()
  const [selectedId, setSelectedId] = useState(cartProductId)
  const selectedProduct = getBookProduct(selectedId)
  const singleBooks = bookProducts.filter((product) => !product.isCombo)
  const selectAndAdd = (checkout: boolean) => {
    const replacing = quantity > 0 && cartProductId !== selectedProduct.id
    setCartProductId(selectedProduct.id)
    setQuantity(checkout || replacing ? amount : quantity + amount)
    if (!checkout) {
      notify(
        replacing
          ? "Đã đổi lựa chọn trong giỏ hàng."
          : "Đã thêm sách vào giỏ hàng.",
      )
    }
  }
  return (
    <div className="mx-auto max-w-[1160px] px-6 py-12">
      <p className="mb-8 text-sm text-[#4A5461]">
        <Link to="/">Trang chủ</Link> / Sách Riko
      </p>
      <Eyebrow>BỘ SÁCH KHÁM PHÁ CÙNG RIKO</Eyebrow>
      <h1 className="max-w-3xl text-4xl leading-tight md:text-5xl">
        Chọn một cuộc phiêu lưu
        <span className="text-[#F15A3E]"> hoặc trọn bộ ba</span>
      </h1>
      <p className="mb-8 mt-4 max-w-2xl text-base leading-7 text-[#4A5461]">
        Ba chủ đề trong PDF bìa: Phương tiện, Động vật và Hiện tượng thiên nhiên.
        Chọn từng quyển giá 299.000đ hoặc lấy combo đủ 3 quyển giá 799.000đ.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {bookProducts.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => {
              setSelectedId(product.id)
              setCartProductId(product.id)
            }}
            aria-pressed={selectedId === product.id}
            className={`rounded-3xl border bg-white p-4 text-left transition hover:-translate-y-1 hover:shadow-lg ${
              selectedId === product.id
                ? "border-primary ring-2 ring-primary/15"
                : "border-border"
            }`}
          >
            {product.isCombo ? (
              <div className="grid aspect-[4/3] grid-cols-3 gap-1 overflow-hidden rounded-2xl bg-[#FFFEF0] p-2">
                {singleBooks.map((book) => (
                  <img
                    key={book.id}
                    src={book.cover}
                    alt={`Bìa ${book.title}`}
                    loading="lazy"
                    className="h-full w-full rounded-lg object-cover"
                  />
                ))}
              </div>
            ) : (
              <img
                src={product.cover}
                alt={`Bìa ${product.title}`}
                loading="lazy"
                className="aspect-[4/3] w-full rounded-2xl object-cover"
              />
            )}
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[#1D80C4]">
              {product.chapter}
            </p>
            <h2 className="mt-1 min-h-14 text-xl font-bold">{product.title}</h2>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-bold text-primary">
                {money(product.price)}
              </span>
              {product.compareAt && (
                <span className="text-sm text-[#4A5461]/60 line-through">
                  {money(product.compareAt)}
                </span>
              )}
            </div>
            {product.isCombo && (
              <p className="mt-2 text-xs font-semibold text-[#28823F]">
                Tiết kiệm 98.000đ so với mua lẻ
              </p>
            )}
            <span className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              {selectedId === product.id ? "Đang chọn" : "Chọn sản phẩm"}
              {selectedId === product.id && <Check size={16} />}
            </span>
          </button>
        ))}
      </div>
      <section className="my-10 grid items-center gap-6 rounded-3xl border border-primary/10 bg-[#FFFEF0] p-5 md:grid-cols-[1fr_1.15fr] md:p-8">
        <div className="grid grid-cols-3 gap-2">
          {(selectedProduct.isCombo ? singleBooks : [selectedProduct]).map(
            (product) => (
              <img
                key={product.id}
                src={product.cover}
                alt={`Bìa ${product.title}`}
                className="w-full rounded-xl shadow-sm"
              />
            ),
          )}
        </div>
        <div>
          <Eyebrow>NHẬN ĐẶT TRƯỚC</Eyebrow>
          <h2 className="text-3xl font-bold">{selectedProduct.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#4A5461]">
            {selectedProduct.isCombo
              ? "Một bộ gồm đủ ba quyển: Phương tiện, Động vật và Hiện tượng thiên nhiên."
              : `Chủ đề ${selectedProduct.title.toLowerCase()} trong bộ sách khám phá cùng Riko.`}
          </p>
          <div className="my-4 flex items-center gap-3">
            <span className="text-3xl font-bold text-primary">
              {money(selectedProduct.price)}
            </span>
            {selectedProduct.compareAt && (
              <span className="text-sm text-[#4A5461]/60 line-through">
                {money(selectedProduct.compareAt)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Qty value={amount} onChange={setAmount} />
            <Button to="/checkout" onClick={() => selectAndAdd(true)}>
              Đặt trước <ArrowRight size={16} />
            </Button>
            <Button secondary onClick={() => selectAndAdd(false)}>
              <ShoppingBag size={16} /> Thêm vào giỏ
            </Button>
          </div>
          <p className="mt-4 text-xs text-[#4A5461]">
            Đây là yêu cầu đặt trước. Rikokid sẽ liên hệ xác nhận đơn và thời
            gian giao hàng.
          </p>
        </div>
      </section>
      <ProductShowcase />
      <div className="py-16">
        <SectionTitle
          label="KHÔNG CHỈ LÀ MỘT CUỐN SÁCH"
          title="Bên trong có cả một thế giới"
        />
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            [
              "Câu chuyện về lòng tốt",
              "Học cách quan tâm, chia sẻ và giúp đỡ những người bạn.",
            ],
            [
              "Khám phá thiên nhiên",
              "Nhận biết cây cối, động vật và bảo vệ môi trường.",
            ],
            [
              "Học cùng trải nghiệm số",
              "Quét QR, xem video và chinh phục quiz sau mỗi chương.",
            ],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-2xl bg-[#FFFEF0] p-6">
              <Sparkles className="mb-4 text-[#FBAF37]" />
              <h3 className="text-xl">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#4A5461]">{desc}</p>
            </div>
          ))}
        </div>
      </div>
      <SectionTitle
        label="SÁCH → QR → VIDEO → QUIZ"
        title="Một lần quét, thêm một điều kỳ diệu"
        subtitle="Chỉ cần quét mã QR bằng điện thoại để mở những video đặc biệt của Riko. Không cần đăng nhập."
      />
      <div className="text-center">
        <Button to="/watch/1">
          Trải nghiệm ngay <Play size={16} />
        </Button>
      </div>
    </div>
  )
}
function Preview() {
  const [page, setPage] = useState(0)
  const { enabled } = useMotionPreferences()
  const [zoom, setZoom] = useState(false)
  const stories = [
    [
      "Cánh cửa kỳ diệu",
      "Một buổi sáng, Riko tìm thấy một con đường nhỏ dẫn vào khu rừng. Những chiếc lá thì thầm: ‘Chào mừng nhà thám hiểm nhỏ!’",
    ],
    [
      "Người bạn mới",
      "Bên dòng suối trong xanh, một chú thỏ đang tìm đường về nhà. Riko mỉm cười: ‘Đừng lo, chúng mình sẽ cùng tìm đường nhé!’",
    ],
    [
      "Ngôi sao thất lạc",
      "Giữa tán lá, một ngôi sao nhỏ đang lấp lánh. Riko biết rằng cuộc phiêu lưu thật sự chỉ vừa bắt đầu...",
    ],
  ]
  return (
    <div
      className={`mx-auto px-6 py-12 ${
        zoom ? "max-w-[1400px]" : "max-w-[1050px]"
      }`}
    >
      <SectionTitle
        label="LẬT TRANG, MỞ TRÍ TƯỞNG TƯỢNG"
        title="Một chút kỳ diệu dành cho bạn"
      />
      <motion.div
        key={page}
        initial={enabled ? { opacity: 0, rotateY: 5, x: 12 } : false}
        animate={{ opacity: 1, rotateY: 0, x: 0 }}
        transition={{ duration: 0.5 }}
        style={{ transformPerspective: 1200 }}
        className="grid overflow-hidden rounded-2xl border border-primary/15 shadow-xl md:grid-cols-2"
      >
        <Scene className="min-h-80 md:min-h-115" variant={page} />
        <div className="flex flex-col justify-center bg-[#FFFEF0] px-8 py-12 md:px-12">
          <span className="text-sm text-[#FBAF37]">CHƯƠNG {page + 1}</span>
          <h2 className="my-6 text-4xl">{stories[page][0]}</h2>
          <p className="text-base leading-9 text-[#4A5461]">
            {stories[page][1]}
          </p>
          <p className="mt-8 text-base italic text-[#FBAF37]">
            “Bạn có nhìn thấy điều đặc biệt trên trang này không?”
          </p>
        </div>
      </motion.div>
      <div className="mt-8 flex items-center justify-center gap-6">
        <button
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
          aria-label="Trang trước"
          className="rounded-full border border-border p-3 disabled:opacity-30"
        >
          <ChevronLeft />
        </button>
        <span className="text-base">
          Trang {page * 2 + 1}–{page * 2 + 2} / 6
        </span>
        <button
          disabled={page === 2}
          onClick={() => setPage(page + 1)}
          aria-label="Trang tiếp theo"
          className="rounded-full border border-border p-3 disabled:opacity-30"
        >
          <ChevronRight />
        </button>
        <button
          onClick={() => setZoom(!zoom)}
          aria-label="Phóng to"
          className="p-3"
        >
          <Maximize size={19} />
        </button>
      </div>
      <div className="mt-8 text-center">
        <Button to="/book">
          Khám phá câu chuyện trọn vẹn <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  )
}
function VideoCard({ video }: { video: VideoItem }) {
  const { enabled } = useMotionPreferences()
  const [hovered, setHovered] = useState(false)
  return (
    <Reveal className="h-full" delay={((Number(video.id) || 0) % 3) * 0.08}>
      <Tilt className="h-full">
        <Link
          to={`/watch/${video.id}`}
          viewTransition={enabled}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          className="group block h-full overflow-hidden rounded-[24px] border border-primary/10 bg-white shadow-[0_5px_20px_#374BA006] transition-shadow duration-400 hover:shadow-md"
        >
          <div
            className="relative overflow-hidden"
            style={{ viewTransitionName: `riko-video-${video.id}` }}
          >
            <div className="transition-transform duration-700 ease-out group-hover:scale-[1.045]">
              {video.thumbnail ? (
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  loading="lazy"
                  decoding="async"
                  className="h-47 w-full object-cover"
                />
              ) : (
                <Scene
                  className="h-47"
                  variant={Number(video.id) || 0}
                  pose={enabled && hovered ? "happy" : undefined}
                />
              )}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-14 items-center justify-center rounded-full border-4 border-white/50 bg-primary text-white shadow-sm transition group-hover:scale-110">
                <Play size={17} fill="currentColor" />
              </span>
            </div>
            <span className="absolute bottom-3 right-3 rounded-md bg-[#374BA0]/80 px-2 py-1 text-xs text-white">
              {video.duration}
            </span>
          </div>
          <div className="p-5">
            <p className="mb-2 text-[9px] font-medium uppercase tracking-widest text-[#4A5461]">
              {displayVideoChapter(video.chapter)}
            </p>
            <h3 className="text-[17px]">{video.title}</h3>
            <p className="mt-3 flex items-center gap-1 text-xs text-[#4A5461]">
              Cùng Riko khám phá <ArrowRight size={12} />
            </p>
          </div>
        </Link>
      </Tilt>
    </Reveal>
  )
}
function Videos() {
  const { videos } = useStore()
  const [filter, setFilter] = useState("Tất cả")
  const filters = [
    "Tất cả",
    "Bìa",
    "Chương 1",
    "Chương 2",
    "Chương 3",
    "Hoạt động",
    "Bonus",
  ]
  return (
    <div className="mx-auto max-w-[1160px] px-6 py-12">
      <SectionTitle
        label="CÂU CHUYỆN SỐNG DẬY"
        title="Video cùng Riko"
        subtitle="Mỗi video là một cánh cửa nhỏ mở ra thế giới thật lớn."
      />
      <div className="mb-8 flex flex-wrap justify-center gap-3">
        {filters.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`rounded-full px-5 py-3 text-sm ${
              filter === t ? "bg-primary text-white" : "bg-[#FFFEF0]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {videos
          .filter(
            (v) =>
              filter === "Tất cả" || videoChapterGroup(v.chapter) === filter,
          )
          .map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
      </div>
      {!videos.some(
        (v) => filter === "Tất cả" || videoChapterGroup(v.chapter) === filter,
      ) && (
        <div className="rounded-3xl bg-[#FFFEF0] p-16 text-center">
          <Mascot pose="thinking" className="mx-auto h-40" />
          <h3 className="text-2xl">Điều kỳ diệu đang được chuẩn bị!</h3>
          <p className="mt-3 text-base">
            Riko sẽ sớm mang đến những video mới.
          </p>
          <Button
            secondary
            className="mt-6"
            onClick={() => setFilter("Tất cả")}
          >
            Khám phá video hiện có <ArrowRight size={16} />
          </Button>
        </div>
      )}
    </div>
  )
}
function Watch() {
  const { videos } = useStore()
  const location = useLocation()
  const videoId = location.pathname.split("/").pop() || ""
  const slot = qrVideoSlots.find((videoSlot) => videoSlot.id === videoId)
  const arAssetId = slot?.arVideoUrl?.split("/").pop()?.replace(/\.webm$/, "")
  const arPreviewUrl = arAssetId
    ? (arVideoPresentations as Record<string, { previewVideoUrl?: string }>)[arAssetId]?.previewVideoUrl
    : undefined
  const localARVideo: VideoItem | null = slot?.arVideoUrl
    ? {
        id: slot.id,
        title: slot.label,
        chapter: slot.group,
        duration: "",
        url: arPreviewUrl || slot.arVideoUrl,
      }
    : null
  const [linkedVideo, setLinkedVideo] = useState<VideoItem | null>(null)
  const [resolving, setResolving] = useState(isAppwriteConfigured)
  const item = localARVideo ||
    videos.find((video) => video.id === videoId) ||
    (slot &&
      videos.find(
        (video) => video.chapter === slot.chapter && Boolean(video.url),
      )) ||
    linkedVideo
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mediaError, setMediaError] = useState(false)
  const [finished, setFinished] = useState(false)
  const { enabled } = useMotionPreferences()
  useEffect(() => {
    const slotVideoReady = Boolean(slot?.arVideoUrl) || (slot
      ? videos.some(
          (video) => video.chapter === slot.chapter && Boolean(video.url),
        )
      : videos.some((video) => video.id === videoId))
    if (slotVideoReady) {
      setResolving(false)
      return
    }
    if (!isAppwriteConfigured) {
      setResolving(false)
      return
    }
    let active = true
    setLinkedVideo(null)
    setResolving(true)
    const lookup = slot
      ? getVideoByChapter(slot.chapter)
      : getVideoById(videoId)
    lookup.then((video) => {
      if (!active) return
      setLinkedVideo(video?.url ? video : null)
      setResolving(false)
    })
    return () => {
      active = false
    }
  }, [videoId, videos, slot])
  useEffect(() => {
    setPlaying(false)
    setLoading(false)
    setMediaError(false)
    setFinished(false)
  }, [location.pathname])
  if (!item && resolving)
    return (
      <div className="mx-auto flex min-h-80 max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
        <RikoLoading label="Riko đang tìm câu chuyện này..." />
      </div>
    )
  if (!item && slot)
    return (
      <div className="mx-auto max-w-xl px-6 py-12 text-center">
        <Mascot pose="thinking" className="mx-auto h-48" />
        <Eyebrow>{slot.label}</Eyebrow>
        <h1 className="my-5 text-3xl">{slot.title}</h1>
        <p className="mb-6 text-base leading-7 text-[#4A5461]">
          Video cho vị trí này đang được chuẩn bị. Mã QR đã sẵn sàng; sau khi
          tải video lên đúng vị trí, quét lại mã này để xem nhé!
        </p>
        <Button to="/">Về trang chủ</Button>
      </div>
    )
  if (!item)
    return (
      <div className="mx-auto max-w-xl px-6 py-12 text-center">
        <Mascot pose="thinking" className="mx-auto h-48" />
        <h1 className="my-5 text-3xl">Câu chuyện đang chờ được mở!</h1>
        <p className="mb-6 text-base text-[#4A5461]">
          Câu chuyện này chưa có sẵn. Hãy quay lại sau nhé!
        </p>
        <Button to="/">Về trang chủ</Button>
      </div>
    )
  const nextVideo = videos.find(
    (video) => video.id !== item.id && Boolean(video.url),
  )
  return (
    <div className="mx-auto max-w-[900px] px-6 py-12">
      <Eyebrow>{displayVideoChapter(item.chapter)}</Eyebrow>
      <motion.div
        initial={enabled ? { opacity: 0, scale: 0.98 } : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        style={{ viewTransitionName: `riko-video-${item.id}` }}
        className="relative overflow-hidden rounded-3xl bg-[#FFFEF0]"
      >
        {item.url ? (
          <>
            <video
              src={item.url}
              controls
              autoPlay={Boolean(slot?.arVideoUrl)}
              muted={Boolean(slot?.arVideoUrl)}
              playsInline
              poster={item.thumbnail}
              onLoadStart={() => setLoading(true)}
              onLoadedData={() => setLoading(false)}
              onPlay={() => setPlaying(true)}
              onEnded={() => setFinished(true)}
              onError={() => {
                setLoading(false)
                setMediaError(true)
              }}
              className="aspect-video w-full"
            />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/95">
                <RikoLoading />
              </div>
            )}
            {mediaError && (
              <p
                role="status"
                className="border-t border-border bg-white p-5 text-sm text-primary"
              >
                Riko chưa mở được video này. Hãy thử video tiếp theo nhé!
              </p>
            )}
          </>
        ) : (
          <>
            <Scene className="aspect-video" />
            {!playing ? (
              <motion.button
                whileHover={enabled ? { scale: 1.07 } : undefined}
                whileTap={enabled ? { scale: 0.96 } : undefined}
                onClick={() => setPlaying(true)}
                aria-label="Phát câu chuyện"
                className="absolute inset-0 m-auto flex size-20 items-center justify-center rounded-full bg-white/90 shadow-lg"
              >
                <Play size={32} fill="currentColor" />
              </motion.button>
            ) : (
              <div className="relative border-t border-primary/10 bg-white p-5">
                <p className="font-display text-lg font-bold">
                  Chào bạn! Cùng mình bước vào khu rừng kỳ diệu nhé.
                </p>
                <p className="mt-2 text-sm leading-6">
                  Hôm nay Riko tìm thấy một ngôi sao nhỏ. Cùng nhau, chúng mình
                  học cách bảo vệ thiên nhiên và giúp đỡ những người bạn mới.
                </p>
                <p className="mt-3 text-xs text-[#4A5461]">
                  Bản xem trước minh họa · Tác giả có thể thêm video trong trang
                  quản trị.
                </p>
                <button
                  onClick={() => setPlaying(false)}
                  className="mt-2 text-sm underline"
                >
                  Xem lại
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
      <div className="mt-8 flex items-center justify-between gap-5">
        <div>
          <h1 className="text-3xl">{item.title}</h1>
          <p className="mt-3 text-base leading-7 text-[#4A5461]">
            Cùng Riko khám phá những điều kỳ diệu và sẵn sàng cho một thử thách
            nhỏ!
          </p>
        </div>
        <Mascot className="hidden h-35 w-35 sm:block" />
      </div>
      <motion.div
        animate={
          enabled && (finished || (playing && !item.url))
            ? { scale: [1, 1.025, 1] }
            : { scale: 1 }
        }
        transition={{ duration: 1 }}
        className="mt-6 flex flex-wrap gap-3"
      >
        <Button to={`/quiz?chapter=${item.chapter.match(/\d/)?.[0] || 1}`}>
          <Gamepad2 size={18} /> Chơi Quiz
        </Button>
        {nextVideo && (
          <Button secondary to={`/watch/${nextVideo.id}`}>
            Video tiếp theo <ArrowRight size={16} />
          </Button>
        )}
      </motion.div>
    </div>
  )
}
function Quizzes() {
  const { score, quizzes, quizUser } = useStore()
  const bestScores = quizUser?.quizProfile.bestScores || guestQuizScores()
  const accountBestPoints = Math.max(
    score,
    Object.values(bestScores).reduce(
      (total, value) => total + Number(value || 0),
      0,
    ),
  )
  const publishedQuizzes = quizzes.filter((quiz) => quiz.published)
  const adventures = publishedQuizzes.length
    ? publishedQuizzes
    : [
        {
          id: "",
          title: "Riko bắt đầu hành trình",
          chapter: "Chương 1",
          questions,
        },
        {
          id: "",
          title: "Những người bạn nhỏ",
          chapter: "Chương 2",
          questions,
        },
        { id: "", title: "Nhà thám hiểm xanh", chapter: "Chương 3", questions },
      ]
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <div className="mb-10 grid items-center gap-6 rounded-[28px] bg-[#3F97D2]/10 px-7 py-8 md:grid-cols-[1.8fr_1fr]">
        <div>
          <Eyebrow>SẴN SÀNG, NHÀ THÁM HIỂM NHỎ?</Eyebrow>
          <h1 className="text-4xl leading-tight md:text-[48px]">
            Thử thách cùng Riko
          </h1>
          <p className="my-4 text-base leading-7 text-[#4A5461]">
            {quizUser?.quizProfile.childNickname
              ? `Chào ${quizUser.quizProfile.childNickname}! ${quizUser.quizProfile.interests.length ? `Riko nhớ bé thích ${quizUser.quizProfile.interests.join(", ")}. ` : ""}Cùng chơi quiz, lưu điểm và sưu tập huy hiệu nhé.`
              : "Cùng chơi, cùng học và thu thập những ngôi sao của riêng bạn. Mỗi thử thách là một cuộc phiêu lưu mới!"}
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="rounded-full bg-white px-4 py-2 text-base font-bold text-primary">
              ★ {accountBestPoints} điểm khám phá
            </span>
            <span className="rounded-full bg-white px-4 py-2 text-base font-bold text-primary">
              🏅 {accountBestPoints > 0 ? 1 : 0} huy hiệu
            </span>
            <Link
              to="/tai-khoan"
              className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white px-4 py-2 text-sm font-bold text-primary hover:bg-primary/5"
            >
              <UserRound size={16} />
              {quizUser ? "Hồ sơ phụ huynh" : "Đăng nhập để lưu tiến độ"}
            </Link>
          </div>
        </div>
        <Mascot pose="encouraging" className="mx-auto h-53" />
      </div>
      <h2 className="mb-6 text-3xl">Chọn cuộc phiêu lưu của bạn</h2>
      <div className="grid gap-6 md:grid-cols-3">
        {adventures.map((quiz, index) => {
          const quizKey = quiz.id || `chapter-${index + 1}`
          const completed = Number(bestScores[quizKey] || 0) > 0
          return (
            <div
              className="relative rounded-[24px] border border-primary/10 bg-white p-6"
              key={quiz.id || quiz.title}
            >
            <p className="mb-5 text-sm font-bold tracking-[.12em] text-[#1D80C4]">
              {quiz.chapter.toUpperCase()}
            </p>
            <div className="mb-5 flex size-16 -rotate-6 items-center justify-center rounded-2xl bg-primary/10">
              {index === 0 ? (
                <BookOpen size={32} className="text-primary" />
              ) : index === 1 ? (
                <Heart size={32} className="text-primary" />
              ) : (
                <Leaf size={32} className="text-primary" />
              )}
            </div>
            <h3 className="min-h-15 text-2xl leading-tight">{quiz.title}</h3>
            <p className="my-4 text-base text-[#4A5461]">
              {quiz.questions.length} câu hỏi · ★★★ có thể nhận
            </p>
            <div className="mb-5 h-1.5 rounded-full bg-primary/10">
              <div
                className={`h-full rounded-full bg-[#59B447] ${
                  completed ? "w-full" : "w-0"
                }`}
              />
            </div>
            <div className="flex items-center justify-between">
              <Button
                to={
                  quiz.id
                    ? `/quiz?quiz=${quiz.id}`
                    : `/quiz?chapter=${index + 1}`
                }
              >
                Bắt đầu <ArrowRight size={16} />
              </Button>
              <span className="text-sm font-semibold text-[#4A5461]">
                {completed ? "✓ Đã hoàn thành" : "Chưa khám phá"}
              </span>
            </div>
            </div>
          )
        })}
      </div>
      <div className="mt-10 rounded-3xl border border-primary/10 p-6">
        <h3 className="mb-5 text-xl">Bộ sưu tập của bạn</h3>
        <div className="flex flex-wrap gap-5">
          {[
            "Nhà thám hiểm",
            "Siêu trí nhớ",
            "Bạn của Riko",
            "Bậc thầy câu đố",
          ].map((badge, index) => (
            <div
              key={badge}
              className={`collectible flex items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 text-base font-bold ${
                accountBestPoints > 0 && index === 0
                  ? "border-[#FBAF37] bg-[#FBAF37]/10 text-primary"
                  : "border-primary/15 text-[#4A5461]/55"
              }`}
            >
              <Trophy
                size={24}
                className={
                  accountBestPoints > 0 && index === 0
                    ? "text-[#FBAF37]"
                    : "text-primary/25"
                }
              />
              {badge}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
function Quiz() {
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [points, setPoints] = useState(0)
  const [retried, setRetried] = useState(false)
  const [retryReady, setRetryReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const { setScore, setLastQuizKey, quizzes } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const { enabled } = useMotionPreferences()
  const requestedQuizId = new URLSearchParams(location.search).get("quiz")
  const activeQuiz =
    quizzes.find((quiz) => quiz.id === requestedQuizId && quiz.published) ||
    quizzes.find((quiz) => quiz.published)
  const activeQuestions = activeQuiz?.questions.length
    ? activeQuiz.questions
    : questions
  const question =
    activeQuestions[Math.min(current, activeQuestions.length - 1)]
  const correct = selected === question.correct
  useEffect(() => {
    setCurrent(0)
    setSelected(null)
    setPoints(0)
    setRetried(false)
  }, [requestedQuizId, activeQuiz?.id])
  useEffect(() => {
    setRetryReady(false)
    if (selected === null || selected === question.correct) return
    const timer = setTimeout(() => setRetryReady(true), 900)
    return () => clearTimeout(timer)
  }, [selected, current, attempt, question.correct])
  function next() {
    if (current === activeQuestions.length - 1) {
      setScore(points)
      const requestedChapter = new URLSearchParams(location.search).get("chapter")
      setLastQuizKey(
        requestedQuizId || `chapter-${requestedChapter || "1"}`,
      )
      navigate("/result", { viewTransition: enabled })
    } else {
      setCurrent(current + 1)
      setSelected(null)
      setRetried(false)
    }
  }
  return (
    <div className="mx-auto max-w-[850px] overflow-x-clip px-6 py-9">
      <div className="mb-5 flex justify-between rounded-2xl border border-primary/10 bg-white/80 p-4 text-base font-semibold backdrop-blur-sm">
        <span>
          {activeQuiz ? `${activeQuiz.title} · ` : ""}Câu {current + 1} /{" "}
          {activeQuestions.length}
        </span>
        <span className="text-primary">
          <Star
            size={17}
            fill="currentColor"
            className="mr-1 inline text-[#FBAF37]"
          />{" "}
          <AnimatedNumber value={points} /> điểm
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Tiến độ bài quiz"
        aria-valuenow={current + 1}
        aria-valuemin={0}
        aria-valuemax={activeQuestions.length}
        className="mb-6 h-3 overflow-hidden rounded-full bg-primary/10"
      >
        <motion.div
          className="h-full origin-left rounded-full bg-[#1D80C4]"
          animate={{ scaleX: (current + 1) / activeQuestions.length }}
          transition={{ duration: enabled ? 0.6 : 0, ease: "easeInOut" }}
        />
      </div>
      <div className="mb-5 flex items-center justify-center gap-4">
        <Mascot
          pose={
            selected === null
              ? "encouraging"
              : correct
                ? "celebrating"
                : "thinking"
          }
          className="h-30 w-24"
        />
        <motion.p
          key={selected === null ? "ready" : correct ? "correct" : "retry"}
          initial={enabled ? { opacity: 0, y: 5 } : false}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[20px_20px_20px_5px] border border-primary/15 bg-white px-5 py-4 text-base font-bold text-primary"
        >
          {selected === null
            ? "Cùng thử câu này nhé!"
            : correct
              ? "Bạn giỏi lắm! ✨"
              : "Mình thử lại nhé!"}
        </motion.p>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current}
          initial={enabled ? { opacity: 0, x: 24 } : false}
          animate={{ opacity: 1, x: 0 }}
          exit={enabled ? { opacity: 0, x: -20 } : undefined}
          transition={{ duration: enabled ? 0.25 : 0 }}
          className="relative rounded-[24px] border border-primary/15 bg-white p-6 shadow-[0_8px_30px_#374BA008] md:p-10"
        >
          <Eyebrow>RIKOKID CHALLENGE</Eyebrow>
          <h1 className="mb-8 font-sans text-2xl leading-snug md:text-3xl">
            {question.text}
          </h1>
          <div className="grid gap-4 sm:grid-cols-2">
            {question.answers.map((answer, index) => (
              <motion.button
                type="button"
                key={answer}
                disabled={selected !== null && (correct || !retryReady)}
                onClick={() => {
                  setSelected(index)
                  setAttempt(attempt + 1)
                  if (index === question.correct)
                    setPoints(points + (retried ? 5 : 10))
                  else setRetried(true)
                }}
                animate={
                  enabled && selected === index && !correct
                    ? { x: [0, -4, 4, -2, 0] }
                    : { x: 0 }
                }
                transition={{ duration: 0.35 }}
                whileHover={enabled ? { y: -2 } : undefined}
                whileTap={enabled ? { scale: 0.985 } : undefined}
                className={`relative flex min-h-19 items-center gap-4 rounded-2xl border-2 p-4 text-left text-base transition-colors ${
                  selected === index
                    ? correct
                      ? "border-[#59B447] bg-[#59B447]/10 text-[#28823F]"
                      : "border-[#F15A3E]/50 bg-[#F15A3E]/5"
                    : "border-primary/15 bg-white/80 hover:border-[#1D80C4]"
                }`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background font-bold">
                  {String.fromCharCode(65 + index)}
                </span>
                {answer}
                {selected === index && correct && (
                  <>
                    <motion.span
                      initial={enabled ? { scale: 0, rotate: -25 } : false}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", duration: 0.4 }}
                    >
                      <Check size={20} />
                    </motion.span>
                    <RewardBurst points={retried ? 5 : 10} />
                  </>
                )}
              </motion.button>
            ))}
          </div>
          <AnimatePresence>
            {selected !== null && (
              <motion.div
                key={correct ? "correct" : "incorrect"}
                role="status"
                initial={enabled ? { opacity: 0, y: 8 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={enabled ? { opacity: 0 } : undefined}
                transition={{ duration: 0.25 }}
                className={`mt-6 flex items-center gap-4 rounded-2xl p-4 ${
                  correct ? "bg-[#59B447]/10" : "bg-[#F15A3E]/5"
                }`}
              >
                <Mascot
                  pose={correct ? "celebrating" : "thinking"}
                  className="h-28 w-25 shrink-0"
                />
                <div>
                  <h3
                    className={`text-xl ${
                      correct ? "text-[#28823F]" : "text-primary"
                    }`}
                  >
                    {correct
                      ? "Chính xác! Tuyệt vời! ✨"
                      : "Chưa đúng rồi! Thử lại nhé!"}
                  </h3>
                  <p className="my-2 text-sm">
                    {correct
                      ? `+${retried ? 5 : 10} điểm · Bạn đang làm rất tốt!`
                      : question.hint}
                  </p>
                  <Button
                    onClick={
                      correct
                        ? next
                        : () => {
                            setSelected(null)
                            setRetried(true)
                          }
                    }
                  >
                    {correct
                      ? current === activeQuestions.length - 1
                        ? "Xem kết quả"
                        : "Câu tiếp theo"
                      : "Thử lại"}
                    <ArrowRight size={15} />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
      <p className="mt-5 text-center text-sm text-[#4A5461]">
        Không cần vội, Riko luôn ở đây để cổ vũ bạn! 🌿
      </p>
    </div>
  )
}
function Result() {
  const { score, lastQuizKey, quizUser, saveQuizProgress } = useStore()
  const { enabled } = useMotionPreferences()
  const stars = score >= 35 ? 3 : score >= 25 ? 2 : score > 0 ? 1 : 0
  const savedRunRef = useRef("")
  const [saveState, setSaveState] = useState("")
  useEffect(() => {
    if (score <= 0) return
    const signature = `${lastQuizKey}:${score}:${quizUser?.$id || "guest"}`
    if (savedRunRef.current === signature) return
    savedRunRef.current = signature
    void saveQuizProgress(lastQuizKey, score)
      .then(() => setSaveState(quizUser ? "Đã lưu tiến độ vào tài khoản." : "Đã lưu trên thiết bị này."))
      .catch(() => setSaveState("Chưa đồng bộ được. Tiến độ vẫn còn trên thiết bị này."))
  }, [lastQuizKey, score, quizUser?.$id, saveQuizProgress])
  const entrance = (delay: number) => ({
    initial: enabled ? { opacity: 0, y: 12, scale: 0.96 } : false as const,
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: enabled ? 0.6 : 0, delay: enabled ? delay : 0 },
  })
  return (
    <div className="relative mx-auto max-w-[800px] overflow-hidden px-6 py-9 text-center">
      {enabled &&
        Array.from({ length: 14 }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="pointer-events-none absolute top-12 text-2xl text-[#FBAF37]"
            style={{
              left: 10 + index * 6 + "%",
              animation: `celebrate ${2 + index / 12}s ease-out ${1.5 + index / 15}s both`,
            }}
          >
            ✦
          </span>
        ))}
      <motion.div {...entrance(0)}>
        <Mascot pose="celebrating" className="mx-auto h-65" />
      </motion.div>
      <motion.h1 {...entrance(0.2)} className="text-4xl sm:text-5xl">
        Bạn làm rất tốt!
      </motion.h1>
      <motion.p {...entrance(0.3)} className="mt-4 text-base text-[#4A5461]">
        Mỗi điều bạn học được là một kho báu mới.
      </motion.p>
      <div
        className="my-7 flex justify-center gap-3"
        aria-label={`${stars} ngôi sao`}
      >
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            initial={enabled ? { opacity: 0, scale: 0.4, rotate: -15 } : false}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{
              type: "spring",
              duration: 0.65,
              bounce: 0.4,
              delay: enabled ? 0.9 + index * 0.18 : 0,
            }}
          >
            <Star
              size={42}
              fill="currentColor"
              className={index < stars ? "text-[#FBAF37]" : "text-primary/15"}
            />
          </motion.span>
        ))}
      </div>
      <motion.div
        {...entrance(0.45)}
        className="mx-auto flex max-w-md justify-center gap-8 rounded-3xl border border-primary/10 bg-[#3F97D2]/10 p-7"
      >
        <div>
          <b className="text-3xl">
            <AnimatedNumber value={score} delay={enabled ? 0.3 : 0} /> / 40
          </b>
          <p className="mt-2 text-sm">Điểm khám phá</p>
        </div>
        <div>
          <b className="text-3xl">{score > 0 ? 4 : 0} / 4</b>
          <p className="mt-2 text-sm">Câu hoàn thành</p>
        </div>
      </motion.div>
      <motion.div {...entrance(1.3)} className="my-8 flex justify-center">
        <Floating duration={7}>
          <div className="collectible flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#FBAF37] bg-[#FBAF37]/10 px-5 py-4">
            <Trophy className="text-[#F5801F]" />
            <span className="text-lg font-bold text-primary">
              Nhà thám hiểm Riko
            </span>
          </div>
        </Floating>
      </motion.div>
      <div className="mx-auto mb-8 max-w-xl rounded-2xl border border-primary/10 bg-white p-5">
        <p className="font-bold text-primary">
          {quizUser
            ? `Tiến độ của ${quizUser.quizProfile.childNickname || "bé"} sẽ được lưu vào hồ sơ phụ huynh.`
            : "Đăng nhập tài khoản phụ huynh để đồng bộ điểm và cá nhân hóa huy hiệu."}
        </p>
        {saveState && <p className="mt-2 text-sm text-[#4A5461]">{saveState}</p>}
        <Link
          to="/tai-khoan"
          className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#1D80C4] underline underline-offset-4"
        >
          <UserRound size={16} />
          {quizUser ? "Xem hồ sơ quiz" : "Đăng nhập hoặc tạo tài khoản"}
        </Link>
      </div>
      <motion.div
        {...entrance(1.5)}
        className="flex flex-wrap justify-center gap-3"
      >
        <Button to="/quiz">Chơi lại</Button>
        <Button secondary to="/quizzes">
          Quiz tiếp theo
        </Button>
        <Button secondary to="/">
          Về trang chủ
        </Button>
      </motion.div>
    </div>
  )
}
function Cart() {
  const { quantity, setQuantity, cartProductId } = useStore()
  const product = getBookProduct(cartProductId)
  return (
    <div className="mx-auto max-w-[1000px] px-6 py-12">
      <h1 className="mb-8 text-4xl">Giỏ hàng của bạn</h1>
      {quantity === 0 ? (
        <div className="rounded-3xl bg-[#FFFEF0] p-12 text-center">
          <Mascot className="mx-auto h-45" />
          <h2 className="mb-6 text-2xl">Cuộc phiêu lưu đang chờ bạn!</h2>
          <Button to="/book">Khám phá sách Riko</Button>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-[1.5fr_1fr]">
          <div className="flex flex-col items-center gap-6 rounded-3xl border border-border bg-white p-6 sm:flex-row">
            {product.isCombo ? (
              <div className="grid w-44 shrink-0 grid-cols-3 gap-1">
                {bookProducts.filter((book) => !book.isCombo).map((book) => (
                  <img
                    key={book.id}
                    src={book.cover}
                    alt={`Bìa ${book.title}`}
                    className="w-full rounded-md"
                  />
                ))}
              </div>
            ) : (
              <img
                src={product.cover}
                alt={`Bìa ${product.title}`}
                className="w-56 shrink-0 rounded-xl"
              />
            )}
            <div>
              <h3 className="mb-2 text-xl">{product.title}</h3>
              <p className="mb-4 text-lg font-bold text-primary">
                {money(product.price)}
                {product.compareAt && (
                  <span className="ml-2 text-sm font-normal text-[#4A5461]/60 line-through">
                    {money(product.compareAt)}
                  </span>
                )}
              </p>
              <Qty value={quantity} onChange={setQuantity} />
              <button
                onClick={() => setQuantity(0)}
                className="ml-3 p-2"
                aria-label="Xóa sách"
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>
          <Summary quantity={quantity} productId={cartProductId} />
        </div>
      )}
    </div>
  )
}
function Summary({
  quantity,
  productId,
  checkout = false,
}: {
  quantity: number
  productId: string
  checkout?: boolean
}) {
  const product = getBookProduct(productId)
  return (
    <div className="rounded-3xl border border-border bg-white p-7">
      <h3 className="mb-6 text-2xl">Đơn hàng của bạn</h3>
      <p className="mb-5 text-sm">
        {product.title} × {quantity}
      </p>
      <div className="mb-3 flex justify-between text-base">
        <span>Tạm tính</span>
        <span>{money(quantity * product.price)}</span>
      </div>
      <div className="mb-5 flex justify-between text-base">
        <span>Phí giao hàng</span>
        <span>{money(25000)}</span>
      </div>
      <div className="flex justify-between border-t border-border pt-5 text-lg font-bold">
        <span>Tổng cộng</span>
        <span>{money(quantity * product.price + 25000)}</span>
      </div>
      {!checkout && (
        <Button to="/checkout" className="mt-7 w-full">
          Tiếp tục đặt trước <ArrowRight size={16} />
        </Button>
      )}
      <p className="mt-5 flex justify-center gap-2 text-sm text-[#4A5461]">
        <ShieldCheck size={15} /> Không cần thanh toán trực tuyến
      </p>
    </div>
  )
}
function Field({
  label,
  name,
  type = "text",
  required = true,
  placeholder = "",
  minLength,
}: {
  label: string
  name?: string
  type?: string
  required?: boolean
  placeholder?: string
  minLength?: number
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        className="mt-2 block w-full rounded-xl border border-primary/15 bg-white px-4 py-3.5 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
      />
    </label>
  )
}
function Checkout() {
  const { quantity, setQuantity, cartProductId, notify } = useStore()
  const navigate = useNavigate()
  const product = getBookProduct(cartProductId)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  return (
    <div className="mx-auto max-w-[1050px] px-6 py-12">
      <p className="mb-5 text-sm text-[#4A5461]">
        Giỏ hàng → <b className="text-primary">Thông tin & thanh toán</b> → Hoàn
        tất
      </p>
      <h1 className="mb-9 text-4xl">Đặt trước sách Riko</h1>
      <div className="grid items-start gap-10 md:grid-cols-[1.5fr_1fr]">
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            setError("")
            setSubmitting(true)
            const data = new FormData(event.currentTarget)
            const orderQuantity = Math.max(1, quantity)
            try {
              const order = await createOrder({
                productId: product.id,
                customerName: String(data.get("customerName") || "").trim(),
                phone: String(data.get("phone") || "").trim(),
                email: String(data.get("email") || "").trim(),
                province: String(data.get("province") || "").trim(),
                address: String(data.get("address") || "").trim(),
                quantity: orderQuantity,
                total: orderQuantity * product.price + 25000,
              })
              localStorage.setItem("rikokid-last-order", order.orderCode)
              setQuantity(0)
              navigate("/order-success", {
                state: { orderCode: order.orderCode, productId: product.id },
              })
            } catch (cause) {
              const message =
                cause instanceof Error ? cause.message : "Vui lòng thử lại."
              setError(message)
              notify("Chưa gửi được đơn hàng. Kiểm tra kết nối Appwrite.")
            } finally {
              setSubmitting(false)
            }
          }}
          className="space-y-6"
        >
          <h3 className="text-xl">Thông tin đặt trước</h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Họ tên" name="customerName" />
            <Field label="Số điện thoại" name="phone" type="tel" />
            <Field label="Email" name="email" type="email" />
            <Field label="Tỉnh / Thành phố" name="province" />
          </div>
          <Field label="Địa chỉ nhận sách" name="address" />
          <h3 className="text-xl">Xác nhận đặt trước</h3>
          <div className="rounded-xl border border-border p-4 text-sm leading-6">
            Rikokid sẽ liên hệ xác nhận đơn và thời gian giao hàng. Phí giao
            hàng dự kiến: 25.000đ.
          </div>
          <label className="flex gap-3 rounded-xl border border-border p-4 text-sm">
            <input type="radio" defaultChecked name="payment" /> Dự kiến thanh
            toán khi nhận sách (COD; Rikokid sẽ xác nhận lại)
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-[#F15A3E]/10 p-4 text-sm text-[#B83E2C]"
            >
              {error}
            </p>
          )}
          <p className="text-sm leading-6 text-[#4A5461]">
            Đây là yêu cầu đặt trước. Đội ngũ Rikokid sẽ liên hệ bạn để xác nhận
            sản phẩm, thời gian giao và hình thức thanh toán trước khi gửi sách.
          </p>
          <button
            disabled={submitting}
            type="submit"
            className="w-full rounded-full bg-primary py-4 text-base font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Đang gửi yêu cầu..." : "Gửi yêu cầu đặt trước"}{" "}
            <span className="ml-2">→</span>
          </button>
        </form>
        <Summary
          quantity={Math.max(1, quantity)}
          productId={cartProductId}
          checkout
        />
      </div>
    </div>
  )
}
function Success() {
  const [track, setTrack] = useState(false)
  const location = useLocation()
  const orderCode =
    (location.state as { orderCode?: string } | null)?.orderCode ||
    localStorage.getItem("rikokid-last-order") ||
    "RIKO"
  return (
    <div className="mx-auto max-w-[700px] px-6 py-12 text-center">
      <Mascot pose="celebrating" className="mx-auto h-60" />
      <h1 className="text-4xl">Đã nhận yêu cầu đặt trước!</h1>
      <p className="mt-5 text-lg">Rikokid sẽ liên hệ để xác nhận đơn hàng.</p>
      <p className="my-5 text-sm text-[#4A5461]">Mã đơn hàng #{orderCode}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => setTrack(!track)}>Theo dõi đơn hàng</Button>
        <Button secondary to="/quizzes">
          Khám phá Quiz
        </Button>
      </div>
      {track && (
        <div className="mt-6 rounded-2xl bg-[#FFFEF0] p-6 text-base">
          ✓ Đã nhận thông tin → Rikokid sẽ liên hệ xác nhận đơn hàng
          <br />
          <span className="mt-2 block text-sm text-[#4A5461]">
            Cần hỗ trợ? Hãy liên hệ đội ngũ Rikokid và cung cấp mã đơn hàng này.
          </span>
        </div>
      )}
    </div>
  )
}
function About({ parents = false }: { parents?: boolean }) {
  if (parents)
    return (
      <div className="mx-auto max-w-[1050px] px-6 py-12">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <Eyebrow>CÙNG CON LỚN LÊN</Eyebrow>
            <h1 className="text-4xl leading-tight md:text-5xl">
              Một cuốn sách,
              <br />
              nhiều cách trưởng thành.
            </h1>
            <p className="my-6 text-base leading-8 text-[#4A5461]">
              Rikokid kết nối sách giấy với nội dung số, giúp con học bằng trí
              tưởng tượng, sự tò mò và những trải nghiệm tích cực. Ba mẹ và thầy
              cô luôn là người bạn đồng hành tuyệt vời nhất.
            </p>
            <Button to="/book">
              Khám phá cuốn sách <ArrowRight size={16} />
            </Button>
          </div>
          <div className="relative flex min-h-85 items-center justify-center rounded-[30px] bg-primary/5">
            <Cover className="h-75 w-53 -rotate-5" />
            <ShieldCheck
              className="absolute bottom-8 right-8 text-primary"
              size={34}
            />
          </div>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            [
              "Đọc cùng con mỗi ngày",
              "Dành 15 phút đọc sách, đặt câu hỏi mở và lắng nghe trí tưởng tượng của con.",
            ],
            [
              "An toàn và cân bằng",
              "Video ngắn, không yêu cầu đăng nhập, không có bảng xếp hạng cạnh tranh.",
            ],
            [
              "Học qua trải nghiệm",
              "Kết hợp kể chuyện, hoạt động ngoài trời và quiz để củng cố kiến thức.",
            ],
          ].map(([title, text], index) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-white p-7"
            >
              <span className="text-xl font-bold text-primary/40">
                0{index + 1}
              </span>
              <h3 className="my-4 text-xl">{title}</h3>
              <p className="text-base leading-7 text-[#4A5461]">{text}</p>
            </div>
          ))}
        </div>
      </div>
    )
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-12">
      <div className="grid items-center gap-8 md:grid-cols-[1.25fr_1fr]">
        <div>
          <Eyebrow>MỘT NGƯỜI BẠN CỦA MỌI CUỘC PHIÊU LƯU</Eyebrow>
          <h1 className="text-4xl leading-tight md:text-[56px]">
            Xin chào,
            <br />
            mình là <span className="text-[#F15A3E]">Riko!</span>
          </h1>
          <p className="my-6 max-w-lg text-base leading-8 text-[#4A5461]">
            Một người bạn robot nhỏ, một trái tim đầy tò mò. Mình yêu những câu
            chuyện, những chuyến đi và cả những câu hỏi “tại sao”. Cùng mình
            khám phá nhé!
          </p>
          <Button to="/preview">
            Cùng Riko khám phá <ArrowRight size={16} />
          </Button>
        </div>
        <div className="relative rounded-[45%] bg-[#3F97D2]/10 p-8">
          <Mascot pose="welcome" className="mx-auto h-85" />
          <span className="absolute right-10 top-10 text-5xl text-[#FBAF37]">
            ✦
          </span>
        </div>
      </div>
      <div className="relative mt-16 space-y-10">
        <div className="absolute bottom-10 left-6 top-8 border-l-2 border-dashed border-[#3F97D2]/30 md:left-1/2" />
        {[
          [
            "Riko là ai?",
            "Mình là người bạn robot nhỏ với đôi mắt luôn háo hức khám phá. Mình sẽ đồng hành, đặt câu hỏi và cổ vũ bạn trên từng trang sách.",
            "encouraging",
          ],
          [
            "Riko đến từ đâu?",
            "Câu chuyện của mình bắt đầu trên những trang sách Rikokid. Khi bạn mở sách, một cánh cửa mới mở ra — vào thiên nhiên, tình bạn và những điều chưa biết.",
            "thinking",
          ],
          [
            "Sứ mệnh của Riko",
            "Gieo hạt tò mò, nuôi dưỡng lòng tốt và giúp mỗi bạn nhỏ tự tin hơn. Mình tin rằng học điều mới cũng có thể là một niềm vui!",
            "activity",
          ],
        ].map(([title, text, pose], index) => (
          <div
            key={title}
            className="relative grid items-center gap-7 rounded-[26px] border border-primary/10 bg-white px-8 py-7 md:grid-cols-2"
          >
            <div className={index % 2 ? "md:order-2" : ""}>
              <span className="text-base font-bold text-[#1D80C4]">
                0{index + 1} · CÂU CHUYỆN CỦA RIKO
              </span>
              <h2 className="my-4 text-3xl">{title}</h2>
              <p className="text-base leading-8 text-[#4A5461]">{text}</p>
            </div>
            <Mascot pose={pose} className="mx-auto h-56" />
          </div>
        ))}
      </div>
      <div className="mt-12 rounded-3xl bg-primary px-6 py-10 text-center">
        <h2 className="mb-6 text-3xl text-white">
          Cùng Riko khám phá thế giới
        </h2>
        <Button to="/quizzes" className="!bg-[#FBAF37] !text-[#363B47]">
          Sẵn sàng cho cuộc phiêu lưu! <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  )
}
function Login() {
  const navigate = useNavigate()
  const { login, authReady } = useStore()
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  return (
    <div className="mx-auto my-12 max-w-md rounded-3xl border border-border bg-[#FFFEF0] p-8">
      <Mascot className="mx-auto h-40" />
      <h1 className="mb-3 text-center text-3xl">Xin chào, tác giả!</h1>
      <p className="mb-7 text-center text-sm text-[#4A5461]">
        Quản lý những cuộc phiêu lưu của Riko.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setError("")
          setSubmitting(true)
          const data = new FormData(event.currentTarget)
          try {
            await login(
              String(data.get("email") || ""),
              String(data.get("password") || ""),
            )
            navigate("/admin")
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "Đăng nhập thất bại.",
            )
          } finally {
            setSubmitting(false)
          }
        }}
        className="space-y-5"
      >
        <Field label="Email" name="email" type="email" />
        <Field label="Mật khẩu" name="password" type="password" />
        <div className="-mt-2 text-right">
          <Link
            to="/recovery"
            className="text-sm font-semibold text-primary hover:underline"
          >
            Quên mật khẩu?
          </Link>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-[#F15A3E]/10 p-4 text-sm text-[#B83E2C]"
          >
            {error}
          </p>
        )}
        {!isAppwriteConfigured && (
          <p
            role="status"
            className="rounded-xl bg-[#FBAF37]/15 p-4 text-sm text-[#6E493E]"
          >
            Chưa kết nối Appwrite. Trang đăng nhập chỉ hoạt động sau khi cấu
            hình môi trường triển khai.
          </p>
        )}
        <button
          disabled={!authReady || submitting}
          className="w-full rounded-full bg-primary py-4 text-base text-white disabled:opacity-60"
        >
          {submitting ? "Đang đăng nhập..." : "Vào không gian tác giả →"}
        </button>
        <p className="text-center text-xs leading-5 text-[#4A5461]">
          Đăng nhập bằng tài khoản Appwrite đã được thêm vào nhóm quản trị
          Rikokid.
        </p>
      </form>
    </div>
  )
}

function QuizAccount() {
  const {
    quizUser,
    quizAuthReady,
    loginQuiz,
    registerQuiz,
    updateQuizAccountProfile,
    logoutQuiz,
  } = useStore()
  const [registerMode, setRegisterMode] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const totalBestPoints = quizUser
    ? Object.values(quizUser.quizProfile.bestScores).reduce(
        (total, value) => total + Number(value || 0),
        0,
      )
    : 0

  if (!quizAuthReady) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center text-primary">
        Đang tải hồ sơ nhà thám hiểm…
      </div>
    )
  }

  if (quizUser) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-3xl border border-primary/10 bg-[#FFFEF0] p-6 md:p-9">
          <Eyebrow>HỒ SƠ NHÀ THÁM HIỂM</Eyebrow>
          <h1 className="text-3xl md:text-4xl">
            Chào {quizUser.quizProfile.childNickname || quizUser.name}!
          </h1>
          <p className="mt-3 text-sm text-[#4A5461]">
            Tài khoản phụ huynh · {quizUser.email}
          </p>
          <div className="my-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white p-5">
              <b className="text-3xl text-primary">{totalBestPoints}</b>
              <p className="mt-1 text-sm text-[#4A5461]">Điểm tốt nhất đã lưu</p>
            </div>
            <div className="rounded-2xl bg-white p-5">
              <b className="text-3xl text-primary">
                {Object.keys(quizUser.quizProfile.bestScores).length}
              </b>
              <p className="mt-1 text-sm text-[#4A5461]">Quiz đã hoàn thành</p>
            </div>
          </div>
          {Object.keys(quizUser.quizProfile.bestScores).length > 0 && (
            <div className="mb-6 rounded-2xl bg-white p-5">
              <h2 className="mb-3 font-bold text-primary">Thành tích gần đây</h2>
              <ul className="space-y-2 text-sm text-[#4A5461]">
                {Object.entries(quizUser.quizProfile.bestScores).map(([key, value]) => (
                  <li key={key} className="flex justify-between gap-4">
                    <span>{key.startsWith("chapter-") ? `Chương ${key.slice(8)}` : key}</span>
                    <b>{value} điểm</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <form
            key={quizUser.$id}
            onSubmit={async (event) => {
              event.preventDefault()
              setError("")
              setMessage("")
              setSubmitting(true)
              const data = new FormData(event.currentTarget)
              try {
                await updateQuizAccountProfile({
                  ...quizUser.quizProfile,
                  childNickname: String(data.get("childNickname") || "").trim(),
                  interests: String(data.get("interests") || "")
                    .split(/[,،]/)
                    .map((interest) => interest.trim())
                    .filter(Boolean)
                    .slice(0, 8),
                })
                setMessage("Đã cập nhật sở thích và biệt danh của bé.")
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Chưa lưu được hồ sơ.")
              } finally {
                setSubmitting(false)
              }
            }}
            className="space-y-4 rounded-2xl bg-white p-5"
          >
            <h2 className="font-bold text-primary">Cá nhân hóa quiz</h2>
            <label className="block text-sm font-medium">
              Biệt danh của bé
              <input
                name="childNickname"
                maxLength={32}
                defaultValue={quizUser.quizProfile.childNickname}
                placeholder="Ví dụ: Mít"
                className="mt-2 block w-full rounded-xl border border-primary/15 px-4 py-3 outline-none focus:border-primary"
              />
            </label>
            <label className="block text-sm font-medium">
              Chủ đề bé yêu thích
              <input
                name="interests"
                defaultValue={quizUser.quizProfile.interests.join(", ")}
                placeholder="Động vật, phương tiện, thiên nhiên"
                className="mt-2 block w-full rounded-xl border border-primary/15 px-4 py-3 outline-none focus:border-primary"
              />
            </label>
            {message && <p role="status" className="text-sm text-[#28823F]">{message}</p>}
            {error && <p role="alert" className="text-sm text-[#B83E2C]">{error}</p>}
            <button
              disabled={submitting}
              className="rounded-full bg-primary px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Đang lưu…" : "Lưu hồ sơ"}
            </button>
          </form>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button to="/quizzes"><Gamepad2 size={16} /> Tiếp tục chơi quiz</Button>
            <Button secondary onClick={() => void logoutQuiz()}>Đăng xuất</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <div className="rounded-3xl border border-primary/10 bg-[#FFFEF0] p-6 md:p-9">
        <Mascot pose="encouraging" className="mx-auto h-36" />
        <Eyebrow>TÀI KHOẢN PHỤ HUYNH</Eyebrow>
        <h1 className="text-3xl md:text-4xl">
          Lưu hành trình của bé
        </h1>
        <p className="my-4 text-sm leading-6 text-[#4A5461]">
          Điểm tốt nhất và huy hiệu quiz được đồng bộ vào hồ sơ. Chỉ cần email
          của phụ huynh; bé có thể dùng biệt danh và chọn chủ đề yêu thích.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            setError("")
            setSubmitting(true)
            const data = new FormData(event.currentTarget)
            const email = String(data.get("email") || "").trim()
            const password = String(data.get("password") || "")
            try {
              if (registerMode) {
                await registerQuiz({
                  guardianName: String(data.get("guardianName") || "").trim(),
                  email,
                  password,
                  childNickname: String(data.get("childNickname") || "").trim(),
                  interests: String(data.get("interests") || "")
                    .split(/[,،]/)
                    .map((interest) => interest.trim())
                    .filter(Boolean)
                    .slice(0, 8),
                })
              } else {
                await loginQuiz(email, password)
              }
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Không đăng nhập được.")
            } finally {
              setSubmitting(false)
            }
          }}
          className="space-y-4"
        >
          {registerMode && <Field label="Tên phụ huynh" name="guardianName" />}
          <Field label="Email phụ huynh" name="email" type="email" />
          <Field label="Mật khẩu" name="password" type="password" minLength={8} />
          {registerMode && (
            <>
              <label className="block text-sm font-medium">
                Biệt danh của bé <span className="font-normal text-[#4A5461]">(không bắt buộc)</span>
                <input
                  name="childNickname"
                  maxLength={32}
                  placeholder="Ví dụ: Mít"
                  className="mt-2 block w-full rounded-xl border border-primary/15 bg-white px-4 py-3.5 outline-none focus:border-primary"
                />
              </label>
              <label className="block text-sm font-medium">
                Chủ đề bé yêu thích <span className="font-normal text-[#4A5461]">(không bắt buộc)</span>
                <input
                  name="interests"
                  placeholder="Động vật, phương tiện, thiên nhiên"
                  className="mt-2 block w-full rounded-xl border border-primary/15 bg-white px-4 py-3.5 outline-none focus:border-primary"
                />
              </label>
            </>
          )}
          {!isAppwriteConfigured && (
            <p role="status" className="rounded-xl bg-[#FBAF37]/15 p-4 text-sm text-[#6E493E]">
              Chưa cấu hình Appwrite cho môi trường này. Điểm quiz vẫn được giữ
              trên thiết bị; đăng nhập đồng bộ cần kết nối Appwrite.
            </p>
          )}
          {error && <p role="alert" className="rounded-xl bg-[#F15A3E]/10 p-4 text-sm text-[#B83E2C]">{error}</p>}
          <button
            disabled={submitting || !isAppwriteConfigured}
            className="w-full rounded-full bg-primary py-4 font-semibold text-white disabled:opacity-60"
          >
            {submitting
              ? "Đang xử lý…"
              : registerMode
                ? "Tạo tài khoản phụ huynh"
                : "Đăng nhập và đồng bộ"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setRegisterMode(!registerMode)
            setError("")
          }}
          className="mt-5 w-full text-sm font-semibold text-primary underline underline-offset-4"
        >
          {registerMode ? "Đã có tài khoản? Đăng nhập" : "Chưa có tài khoản? Tạo hồ sơ mới"}
        </button>
      </div>
    </div>
  )
}

function PasswordRecovery() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const userId = params.get("userId") || ""
  const secret = params.get("secret") || ""
  const isReset = Boolean(userId && secret)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [submitting, setSubmitting] = useState(false)

  return (
    <div className="mx-auto my-12 max-w-md rounded-3xl border border-border bg-[#FFFEF0] p-8">
      <Link
        to="/login"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft size={16} /> Quay lại đăng nhập
      </Link>
      <Mascot className="mx-auto h-36" />
      <h1 className="mb-3 text-center text-3xl">
        {isReset ? "Đặt mật khẩu mới" : "Khôi phục mật khẩu"}
      </h1>
      <p className="mb-7 text-center text-sm text-[#4A5461]">
        {isReset
          ? "Tạo mật khẩu mới để tiếp tục quản lý những cuộc phiêu lưu của Riko."
          : "Nhập email quản trị. Appwrite sẽ gửi liên kết đặt lại mật khẩu."}
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setError("")
          setSuccess("")
          setSubmitting(true)
          const data = new FormData(event.currentTarget)
          try {
            if (isReset) {
              const password = String(data.get("password") || "")
              const confirmPassword = String(data.get("confirmPassword") || "")
              if (password !== confirmPassword) {
                throw new Error("Mật khẩu nhập lại chưa khớp.")
              }
              await completePasswordRecovery(userId, secret, password)
              setSuccess("Mật khẩu đã được cập nhật. Bạn có thể đăng nhập.")
            } else {
              const email = String(data.get("email") || "")
              await requestPasswordRecovery(
                email,
                `${window.location.origin}/recovery`,
              )
              setSuccess(
                "Nếu email thuộc tài khoản quản trị, liên kết đặt lại mật khẩu sẽ được gửi đến hộp thư đó.",
              )
            }
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Không thể khôi phục mật khẩu.",
            )
          } finally {
            setSubmitting(false)
          }
        }}
        className="space-y-5"
      >
        {isReset ? (
          <>
            <Field
              label="Mật khẩu mới"
              name="password"
              type="password"
              minLength={8}
            />
            <Field
              label="Nhập lại mật khẩu mới"
              name="confirmPassword"
              type="password"
              minLength={8}
            />
          </>
        ) : (
          <Field label="Email" name="email" type="email" />
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-[#F15A3E]/10 p-4 text-sm text-[#B83E2C]"
          >
            {error}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="rounded-xl bg-primary/10 p-4 text-sm text-[#315B45]"
          >
            {success}
          </p>
        )}
        <button
          disabled={submitting}
          className="w-full rounded-full bg-primary py-4 text-base text-white disabled:opacity-60"
        >
          {submitting
            ? "Đang xử lý..."
            : isReset
              ? "Cập nhật mật khẩu →"
              : "Gửi liên kết khôi phục →"}
        </button>
        {isReset && success && (
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="w-full rounded-full border border-primary/20 py-3 text-sm font-semibold text-primary"
          >
            Đến trang đăng nhập
          </button>
        )}
      </form>
    </div>
  )
}
const adminLinks = [
  [LayoutDashboard, "Tổng quan", "/admin"],
  [BookOpen, "Sách", "/admin/books"],
  [Video, "Video", "/admin/videos"],
  [QrCode, "Mã QR", "/admin/qr"],
  [Gamepad2, "Quiz", "/admin/quizzes"],
  [Package, "Đơn hàng", "/admin/orders"],
  [Users, "Người dùng", "/admin/users"],
  [Settings, "Cài đặt", "/admin/settings"],
] as const
function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    adminUser,
    authReady,
    logout,
    backendError,
    ensureAdminSession,
    loadVideos,
    loadQuizzes,
  } = useStore()
  useEffect(() => {
    let active = true
    void ensureAdminSession().then((user) => {
      if (!active || !user) return
      void Promise.all([loadVideos(), loadQuizzes(false)])
    })
    return () => {
      active = false
    }
  }, [ensureAdminSession, loadVideos, loadQuizzes])
  useEffect(() => {
    if (authReady && !adminUser) navigate("/login")
  }, [adminUser, authReady, navigate])
  if (!authReady || !adminUser)
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFFEF0] text-primary">
        <RikoLoading label="Đang xác thực không gian quản trị..." />
      </div>
    )
  return (
    <div className="min-h-screen bg-[#FFFEF0]">
      <div className="flex items-center justify-between border-b border-border bg-background px-6 py-5">
        <Logo />
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden sm:block">
            Không gian tác giả · {adminUser.name || adminUser.email}
          </span>
          <MotionToggle />
          <button
            onClick={async () => {
              await logout()
              navigate("/")
            }}
            aria-label="Đăng xuất"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1500px] flex-col md:flex-row">
        <aside className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-background p-4 md:min-h-[90vh] md:w-56 md:flex-col md:border-r md:p-5">
          {adminLinks.map(([Icon, label, to]) => (
            <Link
              to={to}
              key={to}
              className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm ${
                location.pathname === to
                  ? "bg-primary/10 font-bold text-primary"
                  : "text-[#4A5461] hover:bg-primary/5"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </aside>
        <div className="min-w-0 flex-1 p-6 md:p-10">
          {backendError && (
            <p
              role="alert"
              className="mb-6 rounded-xl bg-[#FBAF37]/15 p-4 text-sm text-[#6E493E]"
            >
              Appwrite chưa tải đủ dữ liệu: {backendError}
            </p>
          )}
          <Outlet />
        </div>
      </div>
    </div>
  )
}
function AdminHeading({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <Eyebrow>RIKOKID STUDIO</Eyebrow>
        <h1 className="font-sans text-3xl">{title}</h1>
      </div>
      {children}
    </div>
  )
}
function Dashboard() {
  const { videos, quizzes } = useStore()
  const [orderCount, setOrderCount] = useState(0)
  useEffect(() => {
    listOrders()
      .then((orders) => setOrderCount(orders.length))
      .catch(() => undefined)
  }, [])
  return (
    <>
      <AdminHeading title="Chào buổi sáng, người kể chuyện!" />
      <p className="mb-8 text-base text-[#4A5461]">
        Cùng tạo nên những điều kỳ diệu cho các bạn nhỏ.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Sách", 1, BookOpen],
          ["Video", videos.length, Video],
          ["Mã QR", bookVideoSlots.length, QrCode],
          ["Quiz", quizzes.length, Gamepad2],
          ["Đơn hàng", orderCount, Package],
          [
            "Cơ sở dữ liệu",
            isAppwriteConfigured ? "Appwrite" : "Chưa nối",
            ShoppingBag,
          ],
        ].map(([label, value, Icon]) => {
          const ItemIcon = Icon as typeof BookOpen
          return (
            <div
              key={String(label)}
              className="rounded-2xl border border-border bg-white p-6"
            >
              <ItemIcon size={23} className="mb-5 text-[#4A5461]" />
              <p className="text-sm text-[#4A5461]">{label as string}</p>
              <b className="mt-2 block font-sans text-4xl text-primary">
                {value as string}
              </b>
            </div>
          )
        })}
      </div>
      <div className="mt-8 rounded-2xl border border-border bg-white p-7">
        <h3 className="text-xl">Bắt đầu cuộc phiêu lưu mới</h3>
        <p className="mb-6 mt-2 text-sm text-[#4A5461]">
          Tải video, tạo mã QR và xây dựng bài quiz cho cuốn sách.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button to="/admin/upload">
            <Upload size={16} /> Upload video
          </Button>
          <Button secondary to="/admin/quizzes">
            Tạo Quiz
          </Button>
          <Button secondary to="/admin/qr">
            Tạo mã QR
          </Button>
        </div>
      </div>
      <div className="mt-7 rounded-2xl border border-border bg-white p-7">
        <h3 className="mb-4 text-xl">Hoạt động gần đây</h3>
        {videos.slice(0, 5).map((v) => (
          <p className="border-b border-border py-4 text-sm" key={v.id}>
            <span className="mr-3 text-[#4A5461]">✓</span> Video sẵn sàng:{" "}
            {v.title}
          </p>
        ))}
        {!videos.length && (
          <p className="py-4 text-sm text-[#4A5461]">
            Chưa có video nào được tải lên.
          </p>
        )}
      </div>
    </>
  )
}
function VideoAdmin() {
  const { videos, setVideos, notify } = useStore()
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<VideoItem | null>(null)
  const [deleting, setDeleting] = useState<VideoItem | null>(null)
  return (
    <>
      <AdminHeading title="Quản lý Video">
        <Button to="/admin/upload">
          <Plus size={16} /> Upload Video
        </Button>
      </AdminHeading>
      <SearchField value={search} onChange={setSearch} />
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-primary/5 text-[#4A5461]">
            <tr>
              {[
                "Video",
                "Sách",
                "Chương",
                "Thời lượng",
                "QR Code",
                "Ngày tạo",
                "Trạng thái",
                "Thao tác",
              ].map((title) => (
                <th key={title} className="p-4 text-xs font-bold">
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {videos
              .filter((video) =>
                video.title.toLowerCase().includes(search.toLowerCase()),
              )
              .map((video) => (
                <tr className="border-t border-border" key={video.id}>
                  <td className="p-4">
                    <div className="flex w-60 items-center gap-3">
                      {video.thumbnail ? (
                        <img
                          src={video.thumbnail}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-14 w-20 rounded-lg object-cover"
                        />
                      ) : (
                        <Scene className="h-14 w-20 shrink-0 rounded-lg" />
                      )}
                      <span className="font-semibold text-primary">
                        {video.title}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-xs">Khu rừng kỳ diệu</td>
                  <td className="whitespace-nowrap p-4">
                    {displayVideoChapter(video.chapter)}
                  </td>
                  <td className="p-4">{video.duration}</td>
                  <td className="p-4">
                    <Link
                      to={`/admin/qr?slot=${encodeURIComponent(findQrSlot(video.chapter)?.id || video.id)}`}
                      className="inline-flex items-center gap-1 text-primary"
                    >
                      <QrCode size={15} /> Tạo QR
                    </Link>
                  </td>
                  <td className="whitespace-nowrap p-4 text-xs">
                    {video.createdAt || "06/10/2026"}
                  </td>
                  <td className="p-4">
                    <span className="whitespace-nowrap rounded-full bg-primary/5 px-3 py-1 text-xs text-primary">
                      {video.visibility || "Công khai"}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <Link
                        to={`/watch/${video.id}`}
                        aria-label="Xem video"
                        className="rounded-lg p-2 text-primary hover:bg-primary/5"
                      >
                        <Play size={17} />
                      </Link>
                      <button
                        aria-label="Sửa video"
                        className="rounded-lg p-2 text-primary hover:bg-primary/5"
                        onClick={() => setEditing(video)}
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        aria-label="Xóa video"
                        className="rounded-lg p-2 text-[#F15A3E] hover:bg-[#F15A3E]/5"
                        onClick={() => setDeleting(video)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!videos.filter((video) =>
          video.title.toLowerCase().includes(search.toLowerCase()),
        ).length && (
          <p className="p-12 text-center text-sm text-[#4A5461]">
            Chưa tìm thấy video. Thử tìm kiếm khác hoặc tải một câu chuyện mới.
          </p>
        )}
      </div>
      {editing && (
        <Modal title="Chỉnh sửa Video" onClose={() => setEditing(null)}>
          <form
            className="space-y-5"
            onSubmit={async (event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              const changes = {
                title: String(data.get("title")),
                description: String(data.get("description")),
                chapter: String(data.get("chapter")),
              }
              try {
                await updateVideo(editing.id, changes)
                setVideos(
                  videos.map((video) =>
                    video.id === editing.id ? { ...video, ...changes } : video,
                  ),
                )
                setEditing(null)
                notify("Đã lưu thay đổi video vào Appwrite.")
              } catch (cause) {
                notify(
                  cause instanceof Error
                    ? cause.message
                    : "Không lưu được video.",
                )
              }
            }}
          >
            <label className="block text-sm font-semibold">
              Tên video
              <input
                name="title"
                required
                defaultValue={editing.title}
                className="mt-2 w-full rounded-xl border border-border p-3 text-base"
              />
            </label>
            <label className="block text-sm font-semibold">
              Mô tả
              <textarea
                name="description"
                defaultValue={editing.description}
                rows={3}
                className="mt-2 w-full rounded-xl border border-border p-3 text-base"
              />
            </label>
            <label className="block text-sm font-semibold">
              Chương
              <select
                name="chapter"
                defaultValue={editing.chapter}
                className="mt-2 w-full rounded-xl border border-border p-3"
              >
                {["Chương 1", "Chương 2", "Chương 3", "Hoạt động", "Bonus"].map(
                  (chapter) => (
                    <option key={chapter} value={chapter}>
                      {chapter} · QR chương cũ
                    </option>
                  ),
                )}
                {bookVideoSlotGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.slots.map((slot) => (
                      <option key={slot.id} value={slot.chapter}>
                        {slot.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <button className="w-full rounded-full bg-primary px-6 py-3 text-base font-bold text-white">
              Lưu thay đổi
            </button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Xóa video này?" onClose={() => setDeleting(null)}>
          <p className="mb-6 text-sm leading-7 text-[#4A5461]">
            Video “{deleting.title}” sẽ bị xóa khỏi thư viện Appwrite và mã QR
            liên quan sẽ không còn xuất hiện trong thư viện.
          </p>
          <div className="flex gap-3">
            <Button
              className="!bg-[#F15A3E]"
              onClick={() => {
                void (async () => {
                  try {
                    await deleteVideo(deleting)
                    setVideos(
                      videos.filter((video) => video.id !== deleting.id),
                    )
                    setDeleting(null)
                    notify("Đã xóa video khỏi Appwrite.")
                  } catch (cause) {
                    notify(
                      cause instanceof Error
                        ? cause.message
                        : "Không xóa được video.",
                    )
                  }
                })()
              }}
            >
              Xóa video
            </Button>
            <Button secondary onClick={() => setDeleting(null)}>
              Giữ lại
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
function SearchField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="mb-6 flex max-w-md items-center gap-3 rounded-xl border border-border bg-white px-4">
      <Search size={17} />
      <input
        className="w-full bg-transparent py-3 text-sm outline-none"
        placeholder="Tìm kiếm nội dung..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
function UploadVideo() {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState("")
  const [progress, setProgress] = useState(0)
  const { videos, setVideos, notify } = useStore()
  const navigate = useNavigate()
  function selectFile(file: File | undefined) {
    if (!file) return
    if (!/\.(mp4|mov|webm)$/i.test(file.name)) {
      setError("Chọn video MP4, MOV hoặc WebM nhé.")
      return
    }
    setError("")
    setFile(file)
  }
  return (
    <>
      <AdminHeading title="Thêm một câu chuyện sống động" />
      <form
        className="max-w-3xl space-y-6"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!file) {
            setError("Vui lòng chọn một video.")
            return
          }
          setError("")
          const data = new FormData(event.currentTarget)
          const thumbnail = data.get("thumbnail")
          setProgress(1)
          try {
            const video = await createVideo({
              title: String(data.get("title") || "").trim(),
              description: String(data.get("description") || "").trim(),
              chapter: String(data.get("chapter") || bookVideoSlots[0].chapter),
              visibility: String(data.get("visibility") || "Công khai"),
              file,
              thumbnail:
                thumbnail instanceof File && thumbnail.size
                  ? thumbnail
                  : undefined,
              onProgress: setProgress,
            })
            setVideos([video, ...videos])
            notify("Video và dữ liệu đã được lưu vào Appwrite.")
            navigate(`/admin/qr?slot=${encodeURIComponent(video.chapter)}`)
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Không tải được video lên Appwrite.",
            )
          } finally {
            setProgress(0)
          }
        }}
      >
        <label
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            selectFile(event.dataTransfer.files[0])
          }}
          className="flex min-h-55 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-primary/25 bg-primary/5 p-8 text-center transition hover:bg-primary/10"
        >
          <Upload size={34} className="mb-4 text-[#4A5461]" />
          <b className="font-sans text-xl text-primary">
            {file ? file.name : "Kéo video vào đây hoặc chọn file"}
          </b>
          <span className="mt-3 text-sm text-[#4A5461]">
            MP4 / MOV / WebM · Lưu trong Appwrite Storage
          </span>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="sr-only"
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
        </label>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-[#FFFEF0] p-4 text-sm text-[#F5801F]"
          >
            {error}
          </p>
        )}
        <label className="block text-sm">
          Tên video
          <input
            name="title"
            required
            className="mt-2 block w-full rounded-xl border border-border bg-white p-4"
          />
        </label>
        <label className="block text-sm">
          Mô tả
          <textarea
            name="description"
            className="mt-2 block w-full rounded-xl border border-border bg-white p-4"
            rows={3}
          />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm">
            Sách
            <select className="mt-2 w-full rounded-xl border border-border bg-white p-4">
              <option>{bookTitle}</option>
            </select>
          </label>
          <label className="text-sm">
            Chương
            <select
              name="chapter"
              className="mt-2 w-full rounded-xl border border-border bg-white p-4"
            >
              {bookVideoSlotGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.slots.map((slot) => (
                    <option key={slot.id} value={slot.chapter}>
                      {slot.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="QR chương cũ">
                {["Chương 1", "Chương 2", "Chương 3", "Hoạt động", "Bonus"].map(
                  (chapter) => (
                    <option key={chapter} value={chapter}>
                      {chapter}
                    </option>
                  ),
                )}
              </optgroup>
            </select>
          </label>
        </div>
        {progress > 0 && (
          <label className="block text-sm text-primary">
            Đang thêm video... {progress}%
            <progress
              value={progress}
              max={100}
              className="mt-3 w-full accent-primary"
            />
          </label>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm">
            Ảnh thumbnail
            <input
              name="thumbnail"
              type="file"
              accept="image/*"
              className="mt-2 w-full rounded-xl border border-border bg-white p-3 text-sm"
            />
          </label>
          <label className="text-sm">
            Hiển thị
            <select
              name="visibility"
              className="mt-2 w-full rounded-xl border border-border bg-white p-4"
            >
              <option>Công khai</option>
              <option>Chỉ qua đường dẫn</option>
            </select>
          </label>
        </div>
        <div className="flex gap-3">
          <button
            disabled={progress > 0}
            className="rounded-full bg-primary px-7 py-4 text-base text-white"
          >
            Upload Video
          </button>
          <Button secondary to="/admin/videos">
            Hủy
          </Button>
        </div>
      </form>
    </>
  )
}
function QRAdmin() {
  const { videos, notify } = useStore()
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const queryVideo = videos.find((video) => video.id === query.get("video"))
  const initialSlot =
    query.get("slot") ||
    (queryVideo
      ? findQrSlot(queryVideo.chapter)?.id || bookVideoSlots[0].id
      : bookVideoSlots[0].id)
  const [selected, setSelected] = useState(initialSlot)
  const [png, setPng] = useState("")
  const [svg, setSvg] = useState("")
  const [search, setSearch] = useState("")
  const slot = qrVideoSlots.find((videoSlot) => videoSlot.id === selected)
  const item = slot
    ? videos.find((video) => video.chapter === slot.chapter)
    : videos.find((video) => video.id === selected)
  const url = `${publicSiteOrigin}/watch/${slot?.id || selected}`
  async function generate() {
    const { default: QRCode } = await import("qrcode")
    setPng(
      await QRCode.toDataURL(url, {
        width: 800,
        margin: 2,
        color: { dark: "#374BA0", light: "#FFFEF0" },
      }),
    )
    setSvg(await QRCode.toString(url, { type: "svg", margin: 2 }))
  }
  useEffect(() => {
    generate()
  }, [selected])
  function download(type: string) {
    const link = document.createElement("a")
    link.href =
      type === "png"
        ? png
        : URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
    link.download = `rikokid-${selected}.${type}`
    link.click()
    if (type === "svg") URL.revokeObjectURL(link.href)
  }
  return (
    <>
      <AdminHeading title="Quản lý QR Code" />
      <section className="mb-8 rounded-3xl border border-border bg-white p-6 sm:p-8">
        <h2 className="text-2xl">54 mã QR cố định theo từng trang</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#4A5461]">
          Mỗi mã ứng với đúng một trang trong PDF. Hai trang bìa của mỗi chương
          cũng có mã riêng. Tải video sau và gán đúng vị trí để QR đã in mở được
          video mà không cần in lại.
        </p>
        <SearchField value={search} onChange={setSearch} />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {bookVideoSlots
            .filter((videoSlot) =>
              `${videoSlot.label} ${videoSlot.document} ${videoSlot.id}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((slot) => (
              <article
                key={slot.id}
                className="rounded-2xl border border-primary/10 bg-[#FFFEF0] p-5 text-center"
              >
                <img
                  src={`/qr/riko-${slot.id}.png`}
                  alt={`Mã QR ${slot.label}`}
                  loading="lazy"
                  className="mx-auto mb-4 size-44 rounded-xl bg-white p-2"
                />
                <p className="text-xs font-bold uppercase tracking-wide text-[#1D80C4]">
                  {slot.group}
                </p>
                <h3 className="mt-2 min-h-12 text-base">{slot.label}</h3>
                <p className="mt-2 break-all text-xs text-[#4A5461]">
                  {publicSiteOrigin}/watch/{slot.id}
                </p>
                <Button
                  secondary
                  className="mt-4"
                  onClick={() => {
                    const link = document.createElement("a")
                    link.href = `/qr/riko-${slot.id}.png`
                    link.download = `rikokid-${slot.id}.png`
                    link.click()
                  }}
                >
                  <Download size={14} /> Tải mã QR
                </Button>
              </article>
            ))}
        </div>
      </section>
      <div className="grid gap-7 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-white p-7">
          <h3 className="mb-6 text-xl">Vị trí trong sách</h3>
          {item &&
            (item.thumbnail ? (
              <img
                src={item.thumbnail}
                alt={item.title}
                className="mb-5 h-40 w-full rounded-xl object-cover"
              />
            ) : (
              <Scene className="mb-5 h-40 rounded-xl" />
            ))}
          <label className="text-sm">
            Chọn trang sách / mã QR
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="my-3 w-full rounded-xl border border-border p-4"
            >
              {bookVideoSlotGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.slots.map((videoSlot) => (
                    <option key={videoSlot.id} value={videoSlot.id}>
                      {videoSlot.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="QR chương cũ">
                {legacyQrVideoSlots.map((videoSlot) => (
                  <option key={videoSlot.id} value={videoSlot.id}>
                    {videoSlot.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <p className="my-4 text-base">
            {bookTitle} · {slot?.label}
          </p>
          <p className="mb-4 text-sm text-[#4A5461]">
            {item?.url
              ? `Video đã gán: ${item.title}`
              : "Chưa có video ở vị trí này. QR vẫn mở được trang chờ video."}
          </p>
          <label className="text-sm">
            Đường dẫn video
            <input
              readOnly
              value={url}
              className="my-3 w-full rounded-xl border border-border bg-[#FFFEF0] p-4 text-sm"
            />
          </label>
          <p className="mb-6 text-sm leading-7 text-[#4A5461]">
            Mã QR này có thể được chèn vào sách in. Khi người đọc quét mã, video
            tương ứng sẽ được mở mà không cần đăng nhập. Video và ảnh bìa được
            lưu trữ trong Appwrite Storage.
          </p>
          <Button
            onClick={() => {
              generate()
              notify("Mã QR đã sẵn sàng!")
            }}
          >
            <QrCode size={16} /> Tạo lại QR Code
          </Button>
        </div>
        <div className="rounded-3xl border border-border bg-white p-7 text-center">
          <h3 className="mb-4 text-xl">Mã QR của cuộc phiêu lưu</h3>
          <p className="mb-3 text-xs text-[#4A5461]">
            Ngày tạo: {new Date().toLocaleDateString("vi-VN")}
          </p>
          {png ? (
            <QRScanner className="mx-auto mb-5 size-55">
              <img
                src={png}
                className="size-55 rounded-xl"
                alt="Mã QR dẫn tới video Riko"
              />
            </QRScanner>
          ) : (
            <RikoLoading label="Riko đang chuẩn bị mã QR..." />
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Button disabled={!png} secondary onClick={() => download("png")}>
              <Download size={14} /> PNG
            </Button>
            <Button disabled={!png} secondary onClick={() => download("svg")}>
              <Download size={14} /> SVG
            </Button>
            <Button
              disabled={!selected}
              secondary
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url)
                  notify("Đã sao chép đường dẫn!")
                } catch {
                  notify(
                    "Không thể sao chép. Hãy chọn đường dẫn và sao chép thủ công.",
                  )
                }
              }}
            >
              <Copy size={14} /> Sao chép
            </Button>
          </div>
        </div>
      </div>
      <h3 className="mb-5 mt-9 text-2xl">Thư viện mã QR</h3>
      <SearchField value={search} onChange={setSearch} />
      <div className="space-y-3">
        {videos
          .filter((v) => v.title.toLowerCase().includes(search.toLowerCase()))
          .map((v) => (
            <button
              key={v.id}
              onClick={() => setSelected(findQrSlot(v.chapter)?.id || v.id)}
              className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left text-sm ${
                selected === (findQrSlot(v.chapter)?.id || v.id)
                  ? "border-primary bg-primary/5"
                  : "border-border bg-white"
              }`}
            >
              <QrCode size={22} />
              <span className="flex-1">{v.title}</span>
              <span>{displayVideoChapter(v.chapter)}</span>
              <span className="hidden text-[#4A5461] sm:block">
                Sẵn sàng · 0 lượt quét
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
      </div>
    </>
  )
}
function QuizAdmin() {
  const { notify, videos, quizzes, setQuizzes } = useStore()
  const [builder, setBuilder] = useState(false)
  const [count, setCount] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  return (
    <>
      <AdminHeading title="Xưởng sáng tạo Quiz">
        <Button onClick={() => setBuilder(true)}>
          <Plus size={16} /> Tạo Quiz
        </Button>
      </AdminHeading>
      {!builder ? (
        <div className="space-y-4">
          {quizzes.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-white p-6"
            >
              <div>
                <h3 className="text-xl">{item.title}</h3>
                <p className="mt-2 text-sm text-[#4A5461]">
                  {item.questions.length} câu hỏi ·{" "}
                  {item.published ? "Đã xuất bản" : "Bản nháp"}
                </p>
              </div>
              <Button
                secondary
                onClick={() => {
                  void (async () => {
                    try {
                      await deleteQuiz(item.id)
                      setQuizzes(quizzes.filter((quiz) => quiz.id !== item.id))
                      notify("Đã xóa quiz khỏi Appwrite.")
                    } catch (cause) {
                      notify(
                        cause instanceof Error
                          ? cause.message
                          : "Không xóa được quiz.",
                      )
                    }
                  })()
                }}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <form
          className="max-w-3xl space-y-6 rounded-3xl border border-border bg-white p-7"
          onSubmit={async (event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            setSaving(true)
            setError("")
            const questions: QuizQuestion[] = Array.from(
              { length: count },
              (_, index) => ({
                text: String(data.get(`question-${index}`) || "").trim(),
                answers: Array.from({ length: 4 }, (_, answer) =>
                  String(data.get(`answer-${index}-${answer}`) || "").trim(),
                ),
                correct: Number(data.get(`correct-${index}`) || 0),
                hint: String(data.get(`hint-${index}`) || "").trim(),
              }),
            )
            try {
              const quiz = await createQuiz({
                title: String(data.get("quizTitle") || "").trim(),
                chapter: String(data.get("chapter") || "Chương 1"),
                videoId: String(data.get("videoId") || ""),
                published: data.get("published") === "on",
                questions,
              })
              setQuizzes([quiz, ...quizzes])
              setBuilder(false)
              setCount(1)
              notify(
                quiz.published
                  ? "Quiz đã được xuất bản."
                  : "Đã lưu bản nháp quiz.",
              )
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Không lưu được quiz.",
              )
            } finally {
              setSaving(false)
            }
          }}
        >
          <label className="block text-sm">
            Tên quiz
            <input
              required
              name="quizTitle"
              className="mt-2 w-full rounded-xl border border-border p-4"
              placeholder="Tên cuộc phiêu lưu..."
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Sách
              <select
                name="chapter"
                className="mt-2 w-full rounded-xl border border-border p-4"
              >
                <option>{bookTitle}</option>
              </select>
            </label>
            <label className="text-sm">
              Chương
              <select className="mt-2 w-full rounded-xl border border-border p-4">
                {[1, 2, 3].map((n) => (
                  <option key={n}>Chương {n}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            Video liên quan
            <select
              name="videoId"
              className="mt-2 w-full rounded-xl border border-border p-4"
            >
              <option value="">Không liên kết video</option>
              {videos.map((video) => (
                <option key={video.id} value={video.id}>
                  {video.title}
                </option>
              ))}
            </select>
          </label>
          {Array.from({ length: count }, (_, index) => (
            <fieldset
              key={index}
              className="space-y-4 rounded-2xl bg-primary/5 p-5"
            >
              <legend className="font-sans text-lg font-bold text-primary">
                Câu hỏi {index + 1}
              </legend>
              <input
                required
                name={`question-${index}`}
                placeholder="Nội dung câu hỏi"
                className="w-full rounded-xl border border-border bg-white p-4 text-base"
              />
              <p className="text-sm text-[#4A5461]">Chọn một đáp án đúng:</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }, (_, answer) => (
                  <label
                    key={answer}
                    className="flex items-center gap-3 rounded-xl bg-white p-3"
                  >
                    <input
                      required
                      type="radio"
                      name={`correct-${index}`}
                      value={answer}
                      defaultChecked={answer === 0}
                    />
                    <input
                      required
                      name={`answer-${index}-${answer}`}
                      placeholder={`Đáp án ${String.fromCharCode(65 + answer)}`}
                      className="w-full text-sm outline-none"
                    />
                  </label>
                ))}
              </div>
              <input
                name={`hint-${index}`}
                placeholder="Giải thích sau khi trả lời"
                className="w-full rounded-xl border border-border p-3 text-sm"
              />
            </fieldset>
          ))}
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="published" defaultChecked />
            Xuất bản để các bạn nhỏ có thể chơi ngay
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-[#F15A3E]/10 p-4 text-sm text-[#B83E2C]"
            >
              {error}
            </p>
          )}
          <p className="text-xs text-[#4A5461]">
            Chọn nút tròn cạnh đáp án đúng. Quiz được lưu trong Appwrite và có
            thể xuất bản cho trang chơi công khai.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button secondary onClick={() => setCount(count + 1)}>
              <Plus size={16} /> Thêm câu hỏi
            </Button>
            <button
              disabled={saving}
              className="rounded-full bg-primary px-6 py-4 text-base text-white disabled:opacity-60"
            >
              {saving ? "Đang lưu..." : "Lưu Quiz"}
            </button>
            <Button secondary onClick={() => setBuilder(false)}>
              Hủy
            </Button>
          </div>
        </form>
      )}
    </>
  )
}
function OrdersAdmin() {
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const { notify } = useStore()
  useEffect(() => {
    listOrders()
      .then(setOrders)
      .catch((cause) =>
        notify(
          cause instanceof Error ? cause.message : "Không tải được đơn hàng.",
        ),
      )
      .finally(() => setLoading(false))
  }, [notify])
  const statuses = [
    "Đặt trước",
    "Mới nhận",
    "Đang chuẩn bị",
    "Đang giao",
    "Hoàn tất",
    "Đã hủy",
  ]
  return (
    <>
      <AdminHeading title="Đơn hàng" />
      {loading ? (
        <RikoLoading label="Đang tải đơn hàng..." />
      ) : orders.length === 0 ? (
        <div className="rounded-3xl border border-border bg-white p-10 text-center text-sm text-[#4A5461]">
          Chưa có đơn hàng nào.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-primary/5 text-[#4A5461]">
              <tr>
                {[
                  "Mã đơn",
                  "Khách hàng",
                  "Liên hệ",
                  "Địa chỉ",
                  "Số lượng",
                  "Tổng tiền",
                  "Ngày đặt",
                  "Trạng thái",
                ].map((title) => (
                  <th key={title} className="p-4 text-xs font-bold">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap p-4 font-bold text-primary">
                    {order.orderCode}
                    <span className="mt-1 block whitespace-normal text-xs font-medium text-[#4A5461]">
                      {order.productId
                        ? getBookProduct(order.productId).title
                        : "Đơn sách cũ"}
                    </span>
                  </td>
                  <td className="p-4">{order.customerName}</td>
                  <td className="p-4 text-xs leading-6">
                    {order.phone}
                    <br />
                    {order.email}
                  </td>
                  <td className="max-w-64 p-4 text-xs leading-6">
                    {order.address}
                    <br />
                    {order.province}
                  </td>
                  <td className="p-4">{order.quantity}</td>
                  <td className="whitespace-nowrap p-4">
                    {money(order.total)}
                  </td>
                  <td className="whitespace-nowrap p-4 text-xs">
                    {new Date(order.createdAt).toLocaleString("vi-VN")}
                  </td>
                  <td className="p-4">
                    <select
                      aria-label={`Trạng thái đơn ${order.orderCode}`}
                      value={order.status}
                      onChange={(event) => {
                        const status = event.target.value
                        void updateOrderStatus(order.id, status)
                          .then(() => {
                            setOrders(
                              orders.map((item) =>
                                item.id === order.id
                                  ? { ...item, status }
                                  : item,
                              ),
                            )
                            notify("Đã cập nhật trạng thái đơn hàng.")
                          })
                          .catch((cause) =>
                            notify(
                              cause instanceof Error
                                ? cause.message
                                : "Không cập nhật được đơn hàng.",
                            ),
                          )
                      }}
                      className="rounded-xl border border-border bg-white p-2 text-xs"
                    >
                      {statuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
function AdminOther() {
  const location = useLocation()
  const kind = location.pathname.split("/").pop()
  if (kind === "orders") return <OrdersAdmin />
  if (kind === "books")
    return (
      <>
        <AdminHeading title="Thư viện sách" />
        <div className="flex flex-wrap items-center gap-8 rounded-3xl border border-border bg-white p-8">
          <Cover className="h-64 w-45" />
          <div>
            <h3 className="text-3xl">{bookTitle}</h3>
            <p className="my-4 text-sm leading-6">
              3 chủ đề · 299.000đ/quyển (giá cũ 350.000đ) · Combo 799.000đ
            </p>
            <Button to="/book">Xem sách</Button>
          </div>
        </div>
      </>
    )
  return (
    <>
      <AdminHeading
        title={
          kind === "orders"
            ? "Đơn hàng"
            : kind === "users"
              ? "Người dùng"
              : "Cài đặt thương hiệu"
        }
      />
      <div className="rounded-3xl border border-border bg-white p-10 text-center">
        <Mascot className="mx-auto h-45" />
        <h3 className="mb-4 text-2xl">
          {kind === "settings"
            ? "RIKOKID · Không gian demo"
            : "Chưa có dữ liệu thực tế"}
        </h3>
        <p className="mx-auto max-w-md text-sm leading-7 text-[#4A5461]">
          Các công cụ hiện là bản mẫu tương tác. Kết nối dịch vụ lưu trữ, xác
          thực và thanh toán để quản lý dữ liệu thực tế.
        </p>
        <Button secondary to="/admin" className="mt-6">
          Về tổng quan
        </Button>
      </div>
    </>
  )
}
function Provider({ children }: { children: ReactNode }) {
  const [quantity, setQuantity] = useState(
    () => Number(localStorage.getItem("rikokid-cart")) || 0,
  )
  const [cartProductId, setCartProductId] = useState(
    () => localStorage.getItem("rikokid-cart-product") || "vehicles",
  )
  const [videos, setVideos] = useState<VideoItem[]>(
    isAppwriteConfigured ? [] : initialVideos,
  )
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([])
  const [score, setScore] = useState(
    () => Number(localStorage.getItem("rikokid-quiz-score")) || 0,
  )
  const [lastQuizKey, setLastQuizKey] = useState(
    () => localStorage.getItem("rikokid-last-quiz") || "general",
  )
  const [quizUser, setQuizUser] = useState<QuizUser | null>(null)
  const [quizAuthReady, setQuizAuthReady] = useState(!isAppwriteConfigured)
  const [toast, setToast] = useState("")
  const [adminUser, setAdminUser] = useState<{
    $id: string
    name: string
    email: string
  } | null>(null)
  const [authReady, setAuthReady] = useState(!isAppwriteConfigured)
  const [backendError, setBackendError] = useState("")
  const adminUserRef = useRef(adminUser)
  const adminCheckRef = useRef<Promise<{
    $id: string
    name: string
    email: string
  } | null> | null>(null)
  const videoRequestRef = useRef<Promise<void> | null>(null)
  const quizRequestsRef = useRef(new Map<boolean, Promise<void>>())
  useEffect(() => {
    localStorage.setItem("rikokid-cart", String(quantity))
  }, [quantity])
  useEffect(() => {
    localStorage.setItem("rikokid-cart-product", cartProductId)
  }, [cartProductId])
  useEffect(() => {
    localStorage.setItem("rikokid-quiz-score", String(score))
  }, [score])
  useEffect(() => {
    localStorage.setItem("rikokid-last-quiz", lastQuizKey)
  }, [lastQuizKey])
  useEffect(() => {
    if (!isAppwriteConfigured) {
      setQuizAuthReady(true)
      return
    }
    let active = true
    getQuizUser()
      .then(async (user) => (user ? mergeGuestQuizScores(user) : null))
      .then((user) => {
        if (active) setQuizUser(user)
      })
      .catch(() => {
        if (active) setQuizUser(null)
      })
      .finally(() => {
        if (active) setQuizAuthReady(true)
      })
    return () => {
      active = false
    }
  }, [])
  const saveQuizProgress = useCallback(
    async (key: string, resultScore: number) => {
      const scores = guestQuizScores()
      scores[key] = Math.max(scores[key] || 0, Math.max(0, resultScore))
      localStorage.setItem("rikokid-quiz-scores", JSON.stringify(scores))
      if (quizUser) {
        const user = await saveQuizResultToAccount(key, resultScore)
        setQuizUser(user)
      }
    },
    [quizUser],
  )
  const ensureAdminSession = useCallback(() => {
    if (!isAppwriteConfigured) {
      setAuthReady(true)
      return Promise.resolve(null)
    }
    if (adminUserRef.current) return Promise.resolve(adminUserRef.current)
    if (adminCheckRef.current) return adminCheckRef.current
    setAuthReady(false)
    const request = getAdminUser()
      .then((user) => {
        adminUserRef.current = user
        setAdminUser(user)
        return user
      })
      .catch((cause) => {
        setBackendError(
          cause instanceof Error ? cause.message : "Không xác thực được Appwrite.",
        )
        return null
      })
      .finally(() => {
        setAuthReady(true)
        adminCheckRef.current = null
      })
    adminCheckRef.current = request
    return request
  }, [])
  const loadVideos = useCallback(() => {
    if (!isAppwriteConfigured) return Promise.resolve()
    if (videoRequestRef.current) return videoRequestRef.current
    const request = listVideos()
      .then(setVideos)
      .catch((cause) => {
        setBackendError(
          (previous) =>
            previous ||
            (cause instanceof Error ? cause.message : "Không tải được video."),
        )
      })
      .finally(() => {
        videoRequestRef.current = null
      })
    videoRequestRef.current = request
    return request
  }, [])
  const loadQuizzes = useCallback((publishedOnly = true) => {
    if (!isAppwriteConfigured) return Promise.resolve()
    const existingRequest = quizRequestsRef.current.get(publishedOnly)
    if (existingRequest) return existingRequest
    const request = listQuizzes(publishedOnly)
      .then(setQuizzes)
      .catch((cause) => {
        setBackendError(
          (previous) =>
            previous ||
            (cause instanceof Error ? cause.message : "Không tải được quiz."),
        )
      })
      .finally(() => {
        quizRequestsRef.current.delete(publishedOnly)
      })
    quizRequestsRef.current.set(publishedOnly, request)
    return request
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(""), 4000)
    return () => clearTimeout(timer)
  }, [toast])
  return (
    <Store.Provider
      value={{
        quantity,
        setQuantity,
        cartProductId,
        setCartProductId,
        videos,
        setVideos,
        quizzes,
        setQuizzes,
        score,
        setScore,
        lastQuizKey,
        setLastQuizKey,
        quizUser,
        quizAuthReady,
        loginQuiz: async (email, password) => {
          const user = await loginQuizUser(email, password)
          setQuizUser(await mergeGuestQuizScores(user))
          adminUserRef.current = null
          setAdminUser(null)
          setAuthReady(true)
        },
        registerQuiz: async (input) => {
          const user = await registerQuizUser(input)
          setQuizUser(await mergeGuestQuizScores(user))
          adminUserRef.current = null
          setAdminUser(null)
          setAuthReady(true)
        },
        updateQuizAccountProfile: async (profile) => {
          setQuizUser(await updateQuizProfile(profile))
        },
        logoutQuiz: async () => {
          await logoutQuizUser()
          setQuizUser(null)
          adminUserRef.current = null
          setAdminUser(null)
          setAuthReady(true)
        },
        saveQuizProgress,
        adminUser,
        authReady,
        ensureAdminSession,
        loadVideos,
        loadQuizzes,
        login: async (email, password) => {
          const user = await loginAdmin(email, password)
          adminUserRef.current = user
          setAdminUser(user)
          setAuthReady(true)
        },
        logout: async () => {
          await logoutAdmin()
          adminUserRef.current = null
          setAdminUser(null)
          setAuthReady(true)
        },
        backendError,
        notify: setToast,
      }}
    >
      {children}
      {toast && (
        <div
          role="status"
          className="page-in fixed bottom-6 left-1/2 z-50 flex w-[90%] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-primary/15 bg-white p-4 text-sm shadow-xl"
        >
          <Check className="shrink-0 text-[#4A5461]" size={19} />
          {toast}
          <button
            className="ml-auto"
            onClick={() => setToast("")}
            aria-label="Đóng"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </Store.Provider>
  )
}
const router = createBrowserRouter([
  {
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: "book", Component: Book },
      { path: "scan", Component: ARScanRoute },
      { path: "preview", Component: Preview },
      { path: "videos", Component: Videos },
      { path: "watch/:id", Component: Watch },
      { path: "quizzes", Component: Quizzes },
      { path: "quiz", Component: Quiz },
      { path: "result", Component: Result },
      { path: "cart", Component: Cart },
      { path: "checkout", Component: Checkout },
      { path: "order-success", Component: Success },
      { path: "about", Component: About },
      { path: "parents", element: <About parents /> },
      { path: "tai-khoan", Component: QuizAccount },
      { path: "login", Component: Login },
      { path: "recovery", Component: PasswordRecovery },
      {
        path: "*",
        element: (
          <div className="p-20 text-center">
            <h1 className="mb-6 text-3xl">
              Cuộc phiêu lưu này chưa được khám phá.
            </h1>
            <Button to="/">Về trang chủ</Button>
          </div>
        ),
      },
    ],
  },
  {
    path: "admin",
    Component: AdminLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "videos", Component: VideoAdmin },
      { path: "upload", Component: UploadVideo },
      { path: "qr", Component: QRAdmin },
      { path: "quizzes", Component: QuizAdmin },
      ...["books", "orders", "users", "settings"].map((path) => ({
        path,
        Component: AdminOther,
      })),
    ],
  },
])
export default function App() {
  return (
    <MotionProvider>
      <Provider>
        <RouterProvider router={router} />
      </Provider>
    </MotionProvider>
  )
}
