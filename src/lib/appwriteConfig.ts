const env = import.meta.env

export const appwriteConfig = {
  endpoint: env.VITE_APPWRITE_ENDPOINT?.trim() || "",
  projectId: env.VITE_APPWRITE_PROJECT_ID?.trim() || "",
  databaseId: env.VITE_APPWRITE_DATABASE_ID?.trim() || "6acfa9960034613b2b16",
  ordersTableId: env.VITE_APPWRITE_ORDERS_TABLE_ID?.trim() || "6acfa9ab00235695e522",
  videosTableId: env.VITE_APPWRITE_VIDEOS_TABLE_ID?.trim() || "6acfa9b9001328339d1b",
  quizzesTableId: env.VITE_APPWRITE_QUIZZES_TABLE_ID?.trim() || "6acfa9bf00239602e8ff",
  mediaBucketId: env.VITE_APPWRITE_MEDIA_BUCKET_ID?.trim() || "6acfaa0500376f5fea5c",
  adminTeamId: env.VITE_APPWRITE_ADMIN_TEAM_ID?.trim() || "6acfa9e9001c51f872c3",
}

export const isAppwriteConfigured =
  Boolean(appwriteConfig.endpoint) && Boolean(appwriteConfig.projectId)
