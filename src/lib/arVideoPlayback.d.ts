import type { VideoPresentation } from "./arPresentation.js"
export type ARVideoAsset = {
  id: string
  url: string
  alpha?: boolean
  alphaVideoUrl?: string
  alphaColorUrl?: string
  alphaMaskUrl?: string
  packedVideoUrl?: string
  compatiblePackedVideoUrl?: string
  previewVideoUrl?: string
  presentationMode?: string
}
export function resolveARVideoAsset(slot: { id: string; arTargetId?: string | null; arVideoUrl?: string | null }, profile: VideoPresentation | undefined, cachedAssets: ARVideoAsset[]): ARVideoAsset
export function nativeARSource(asset: ARVideoAsset, profile: VideoPresentation): string
export function waitForDecodedVideoFrame(video: HTMLVideoElement, timeoutMs?: number): Promise<void>
export function playARVideo(video: HTMLVideoElement, timeoutMs?: number): Promise<void>
export function setARVideoSource(video: HTMLVideoElement, url: string, origin: string): void
export function preferredARSource(asset: ARVideoAsset, profile: VideoPresentation): { kind: "scene" | "packed" | "native"; url: string }
export function getARPixelRatio(width: number, height: number, devicePixelRatio: number): number
