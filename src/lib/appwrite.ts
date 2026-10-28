import {
  Account,
  Client,
  ID,
  Permission,
  Query,
  Role,
  Storage,
  TablesDB,
  Teams,
} from "appwrite"
import { appwriteConfig, isAppwriteConfigured } from "./appwriteConfig"
import { orderCodeProductId } from "../data/bookProducts"
export { appwriteConfig, isAppwriteConfigured } from "./appwriteConfig"

export type VideoRecord = {
  id: string
  title: string
  chapter: string
  duration: string
  url?: string
  description?: string
  thumbnail?: string
  visibility?: string
  createdAt?: string
  videoFileId?: string
  thumbnailFileId?: string
}

export type QuizQuestion = {
  text: string
  answers: string[]
  correct: number
  hint: string
}

export type QuizRecord = {
  id: string
  title: string
  chapter: string
  videoId: string
  published: boolean
  questions: QuizQuestion[]
}

export type OrderRecord = {
  id: string
  orderCode: string
  productId: string | null
  customerName: string
  phone: string
  email: string
  province: string
  address: string
  quantity: number
  total: number
  status: string
  createdAt: string
}

export type QuizProfile = {
  childNickname: string
  interests: string[]
  bestScores: Record<string, number>
}

export type QuizUser = {
  $id: string
  name: string
  email: string
  quizProfile: QuizProfile
}

function normalizeQuizProfile(value: unknown): QuizProfile {
  const profile = value && typeof value === "object"
    ? (value as Partial<QuizProfile>)
    : {}
  const scores = profile.bestScores && typeof profile.bestScores === "object"
    ? Object.fromEntries(
        Object.entries(profile.bestScores).map(([key, score]) => [
          key,
          Math.max(0, Number(score) || 0),
        ]),
      )
    : {}
  return {
    childNickname: String(profile.childNickname || ""),
    interests: Array.isArray(profile.interests)
      ? profile.interests.map(String).filter(Boolean).slice(0, 8)
      : [],
    bestScores: scores,
  }
}

const client = new Client()
if (isAppwriteConfigured) {
  client.setEndpoint(appwriteConfig.endpoint).setProject(appwriteConfig.projectId)
}

export const account = new Account(client)
export const tables = new TablesDB(client)
export const storage = new Storage(client)
const teams = new Teams(client)

function requireAppwrite() {
  if (!isAppwriteConfigured) {
    throw new Error(
      "Chưa cấu hình Appwrite. Hãy thêm các biến VITE_APPWRITE_* vào môi trường triển khai.",
    )
  }
}

const adminRole = () => Role.team(appwriteConfig.adminTeamId)
const adminRowPermissions = (publicRead = false) => [
  ...(publicRead ? [Permission.read(Role.any())] : []),
  Permission.read(adminRole()),
  Permission.update(adminRole()),
  Permission.delete(adminRole()),
]

function fileViewUrl(fileId: string) {
  return `${appwriteConfig.endpoint}/storage/buckets/${appwriteConfig.mediaBucketId}/files/${fileId}/view?project=${appwriteConfig.projectId}`
}

export async function listVideos(): Promise<VideoRecord[]> {
  requireAppwrite()
  const isAdmin = await getAdminUser()
  const queries = [Query.orderDesc("$createdAt"), Query.limit(100)]
  if (!isAdmin) queries.unshift(Query.equal("visibility", "Công khai"))
  const result = await tables.listRows({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.videosTableId,
    queries,
  })
  return result.rows.map((row) => ({
    id: row.$id,
    title: String(row.title || ""),
    chapter: String(row.chapter || ""),
    duration: String(row.duration || "Video mới"),
    description: String(row.description || ""),
    visibility: String(row.visibility || "Công khai"),
    createdAt: new Date(row.$createdAt).toLocaleDateString("vi-VN"),
    videoFileId: String(row.videoFileId || ""),
    thumbnailFileId: String(row.thumbnailFileId || ""),
    url: row.videoFileId ? fileViewUrl(String(row.videoFileId)) : undefined,
    thumbnail: row.thumbnailFileId
      ? fileViewUrl(String(row.thumbnailFileId))
      : undefined,
  }))
}

export async function getVideoById(id: string): Promise<VideoRecord | null> {
  requireAppwrite()
  try {
    const row = await tables.getRow({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.videosTableId,
      rowId: id,
    })
    return {
      id: row.$id,
      title: String(row.title || ""),
      chapter: String(row.chapter || ""),
      duration: String(row.duration || "Video mới"),
      description: String(row.description || ""),
      visibility: String(row.visibility || "Công khai"),
      createdAt: new Date(row.$createdAt).toLocaleDateString("vi-VN"),
      videoFileId: String(row.videoFileId || ""),
      thumbnailFileId: String(row.thumbnailFileId || ""),
      url: row.videoFileId ? fileViewUrl(String(row.videoFileId)) : undefined,
      thumbnail: row.thumbnailFileId
        ? fileViewUrl(String(row.thumbnailFileId))
        : undefined,
    }
  } catch {
    return null
  }
}

export async function getVideoByChapter(
  chapter: string,
): Promise<VideoRecord | null> {
  requireAppwrite()
  try {
    const result = await tables.listRows({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.videosTableId,
      queries: [
        Query.equal("chapter", chapter),
        Query.orderDesc("$createdAt"),
        Query.limit(20),
      ],
    })
    const row = result.rows.find((candidate) => Boolean(candidate.videoFileId))
    if (!row) return null
    const videoFileId = String(row.videoFileId)
    const thumbnailFileId = String(row.thumbnailFileId || "")
    return {
      id: row.$id,
      title: String(row.title || ""),
      chapter: String(row.chapter || chapter),
      duration: String(row.duration || "Video mới"),
      description: String(row.description || ""),
      visibility: String(row.visibility || "Chỉ qua đường dẫn"),
      createdAt: new Date(row.$createdAt).toLocaleDateString("vi-VN"),
      videoFileId,
      thumbnailFileId,
      url: fileViewUrl(videoFileId),
      thumbnail: thumbnailFileId ? fileViewUrl(thumbnailFileId) : undefined,
    }
  } catch {
    return null
  }
}

export async function createVideo(input: {
  title: string
  description: string
  chapter: string
  visibility: string
  file: File
  thumbnail?: File
  onProgress?: (progress: number) => void
}): Promise<VideoRecord> {
  requireAppwrite()
  // Both visible videos and unlisted QR videos need public read permission. The
  // unlisted rows are omitted from catalogue queries; their unguessable row IDs
  // are shared only by direct link/QR.
  const publicRead = true
  const filePermissions = adminRowPermissions(publicRead)
  let videoFileId = ""
  let thumbnailFileId = ""
  try {
    const videoFile = await storage.createFile({
      bucketId: appwriteConfig.mediaBucketId,
      fileId: ID.unique(),
      file: input.file,
      permissions: filePermissions,
      onProgress: (progress) => input.onProgress?.(Math.round(progress.progress)),
    })
    videoFileId = videoFile.$id
    if (input.thumbnail) {
      const thumbnailFile = await storage.createFile({
        bucketId: appwriteConfig.mediaBucketId,
        fileId: ID.unique(),
        file: input.thumbnail,
        permissions: filePermissions,
      })
      thumbnailFileId = thumbnailFile.$id
    }
    const row = await tables.createRow({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.videosTableId,
      rowId: ID.unique(),
      data: {
        title: input.title,
        description: input.description,
        chapter: input.chapter,
        duration: "Video mới",
        visibility: input.visibility,
        videoFileId,
        thumbnailFileId,
      },
      permissions: adminRowPermissions(publicRead),
    })
    return {
      id: row.$id,
      title: input.title,
      description: input.description,
      chapter: input.chapter,
      duration: "Video mới",
      visibility: input.visibility,
      createdAt: new Date(row.$createdAt).toLocaleDateString("vi-VN"),
      videoFileId,
      thumbnailFileId,
      url: fileViewUrl(videoFileId),
      thumbnail: thumbnailFileId ? fileViewUrl(thumbnailFileId) : undefined,
    }
  } catch (error) {
    await Promise.allSettled(
      [videoFileId, thumbnailFileId]
        .filter(Boolean)
        .map((fileId) =>
          storage.deleteFile({
            bucketId: appwriteConfig.mediaBucketId,
            fileId,
          }),
        ),
    )
    throw error
  }
}

export async function updateVideo(
  id: string,
  values: Pick<VideoRecord, "title" | "description" | "chapter">,
) {
  requireAppwrite()
  await tables.updateRow({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.videosTableId,
    rowId: id,
    data: values,
  })
}

export async function deleteVideo(video: VideoRecord) {
  requireAppwrite()
  await tables.deleteRow({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.videosTableId,
    rowId: video.id,
  })
  await Promise.allSettled(
    [video.videoFileId, video.thumbnailFileId]
      .filter((fileId): fileId is string => Boolean(fileId))
      .map((fileId) =>
        storage.deleteFile({
          bucketId: appwriteConfig.mediaBucketId,
          fileId,
        }),
      ),
  )
}

export async function createOrder(input: {
  productId: string
  customerName: string
  phone: string
  email: string
  province: string
  address: string
  quantity: number
  total: number
}) {
  requireAppwrite()
  const { productId, ...orderData } = input
  const orderCode = `RIKO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${ID.unique().slice(0, 6).toUpperCase()}-${productId.toUpperCase()}`
  const row = await tables.createRow({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.ordersTableId,
    rowId: ID.unique(),
    data: {
      ...orderData,
      orderCode,
      status: "Đặt trước",
    },
    permissions: adminRowPermissions(),
  })
  return { id: row.$id, orderCode }
}

export async function listOrders(): Promise<OrderRecord[]> {
  requireAppwrite()
  const result = await tables.listRows({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.ordersTableId,
    queries: [Query.orderDesc("$createdAt"), Query.limit(100)],
  })
  return result.rows.map((row) => ({
    id: row.$id,
    orderCode: String(row.orderCode || row.$id),
    productId: orderCodeProductId(String(row.orderCode || "")),
    customerName: String(row.customerName || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    province: String(row.province || ""),
    address: String(row.address || ""),
    quantity: Number(row.quantity || 1),
    total: Number(row.total || 0),
    status: String(row.status || "Mới nhận"),
    createdAt: row.$createdAt,
  }))
}

export async function updateOrderStatus(id: string, status: string) {
  requireAppwrite()
  await tables.updateRow({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.ordersTableId,
    rowId: id,
    data: { status },
  })
}

function parseQuestions(value: unknown): QuizQuestion[] {
  if (Array.isArray(value)) return value as QuizQuestion[]
  try {
    const parsed = JSON.parse(String(value || "[]"))
    return Array.isArray(parsed) ? (parsed as QuizQuestion[]) : []
  } catch {
    return []
  }
}

export async function listQuizzes(publishedOnly = false): Promise<QuizRecord[]> {
  requireAppwrite()
  const queries = [Query.orderDesc("$createdAt"), Query.limit(100)]
  if (publishedOnly) queries.unshift(Query.equal("published", true))
  const result = await tables.listRows({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.quizzesTableId,
    queries,
  })
  return result.rows.map((row) => ({
    id: row.$id,
    title: String(row.title || ""),
    chapter: String(row.chapter || "Chương 1"),
    videoId: String(row.videoId || ""),
    published: Boolean(row.published),
    questions: parseQuestions(row.questions),
  }))
}

export async function createQuiz(quiz: Omit<QuizRecord, "id">) {
  requireAppwrite()
  const row = await tables.createRow({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.quizzesTableId,
    rowId: ID.unique(),
    data: {
      title: quiz.title,
      chapter: quiz.chapter,
      videoId: quiz.videoId,
      published: quiz.published,
      questions: JSON.stringify(quiz.questions),
    },
    permissions: adminRowPermissions(quiz.published),
  })
  return { ...quiz, id: row.$id }
}

export async function deleteQuiz(id: string) {
  requireAppwrite()
  await tables.deleteRow({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.quizzesTableId,
    rowId: id,
  })
}

async function isAdminMember(userId: string) {
  const result = await teams.listMemberships({
    teamId: appwriteConfig.adminTeamId,
    queries: [Query.equal("userId", userId)],
  })
  return result.memberships.some((membership) => membership.confirm && membership.joined)
}

export async function getAdminUser() {
  if (!isAppwriteConfigured) return null
  try {
    const user = await account.get()
    if (!(await isAdminMember(user.$id))) return null
    return { $id: user.$id, name: user.name, email: user.email }
  } catch {
    return null
  }
}

export async function loginAdmin(email: string, password: string) {
  requireAppwrite()
  await account.createEmailPasswordSession({ email, password })
  try {
    const user = await account.get()
    if (!(await isAdminMember(user.$id))) {
      await account.deleteSession({ sessionId: "current" })
      throw new Error("Tài khoản chưa được thêm vào nhóm quản trị Rikokid.")
    }
    return { $id: user.$id, name: user.name, email: user.email }
  } catch (error) {
    if (error instanceof Error && error.message.includes("nhóm quản trị")) throw error
    await account.deleteSession({ sessionId: "current" }).catch(() => undefined)
    throw error
  }
}

export async function requestPasswordRecovery(email: string, url: string) {
  requireAppwrite()
  await account.createRecovery({ email, url })
}

export async function completePasswordRecovery(
  userId: string,
  secret: string,
  password: string,
) {
  requireAppwrite()
  await account.updateRecovery({ userId, secret, password })
}

export async function logoutAdmin() {
  if (!isAppwriteConfigured) return
  await account.deleteSession({ sessionId: "current" }).catch(() => undefined)
}

export async function getQuizUser(): Promise<QuizUser | null> {
  if (!isAppwriteConfigured) return null
  try {
    const user = await account.get()
    const prefs = await account.getPrefs<Record<string, unknown>>()
    return {
      $id: user.$id,
      name: user.name,
      email: user.email,
      quizProfile: normalizeQuizProfile(prefs.quizProfile),
    }
  } catch {
    return null
  }
}

export async function registerQuizUser(input: {
  guardianName: string
  email: string
  password: string
  childNickname: string
  interests: string[]
}): Promise<QuizUser> {
  requireAppwrite()
  await account.create({
    userId: ID.unique(),
    email: input.email.trim(),
    password: input.password,
    name: input.guardianName.trim(),
  })
  await account.createEmailPasswordSession({
    email: input.email.trim(),
    password: input.password,
  })
  const prefs = await account.getPrefs<Record<string, unknown>>()
  await account.updatePrefs({
    prefs: {
      ...prefs,
      quizProfile: normalizeQuizProfile({
        childNickname: input.childNickname,
        interests: input.interests,
        bestScores: {},
      }),
    },
  })
  const user = await getQuizUser()
  if (!user) throw new Error("Đã tạo tài khoản nhưng chưa tải được hồ sơ quiz.")
  return user
}

export async function loginQuizUser(email: string, password: string) {
  requireAppwrite()
  await account.createEmailPasswordSession({ email: email.trim(), password })
  const user = await getQuizUser()
  if (!user) throw new Error("Không tải được hồ sơ quiz sau khi đăng nhập.")
  return user
}

export async function updateQuizProfile(profile: QuizProfile) {
  requireAppwrite()
  const prefs = await account.getPrefs<Record<string, unknown>>()
  await account.updatePrefs({
    prefs: { ...prefs, quizProfile: normalizeQuizProfile(profile) },
  })
  const user = await getQuizUser()
  if (!user) throw new Error("Không tải được hồ sơ quiz đã cập nhật.")
  return user
}

export async function saveQuizResult(quizKey: string, score: number) {
  requireAppwrite()
  const prefs = await account.getPrefs<Record<string, unknown>>()
  const profile = normalizeQuizProfile(prefs.quizProfile)
  profile.bestScores[quizKey] = Math.max(
    profile.bestScores[quizKey] || 0,
    Math.max(0, Math.floor(score)),
  )
  await account.updatePrefs({ prefs: { ...prefs, quizProfile: profile } })
  const user = await getQuizUser()
  if (!user) throw new Error("Không tải được tiến độ quiz đã lưu.")
  return user
}

export async function logoutQuizUser() {
  if (!isAppwriteConfigured) return
  await account.deleteSession({ sessionId: "current" }).catch(() => undefined)
}

