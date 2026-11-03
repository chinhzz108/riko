export type ScanSlot = {
  id: string
  group?: string
}

export type ScanTarget = {
  popupLabel: string
  pages: string[]
}

export const QR_FALLBACK_DELAY_MS: 800
export const VISUAL_SCAN_INTERVAL_MS: 250
export const PAGE_CONFIRMATION_WINDOW_MS: 550
export const INDEPENDENT_POPUP_CONFIDENCE: 0.5

export function shouldWaitForPopupDetection(options: {
  now: number
  foundAt: number
  lastSampleAt: number
  unavailable: boolean
}): boolean

export function createVisualConsensus(requiredFrames?: number): {
  observe<T extends { slot: ScanSlot & { arVideoUrl?: string | null }; detection: { classId: number; score: number; box?: { x: number; y: number; width: number; height: number } } }>(candidate: T | null | undefined, now: number): T | null
  reset(): void
}

export function videoCandidates<T extends ScanSlot & { arVideoUrl?: string | null }, D extends { classId: number; score: number }>(
  detections: D[],
  classNames: string[],
  targets: ScanTarget[],
  slots: T[],
  trustedSlot?: T | null,
  options?: { allowIndependentPopup?: boolean },
): Array<{ detection: D; slot: T }>

export function routeSlotFromQR<T extends ScanSlot>(
  rawValue: string,
  slots: T[],
  publicOrigin: string,
): T | null

export function resolveSlotFromLabel<T extends ScanSlot>(
  label: string | undefined,
  pageContextId: string | undefined,
  targets: ScanTarget[],
  slots: T[],
): T | null

export function shouldCommitQrFallback(options: {
  pendingQr: unknown
  qrFoundAt: number
  now: number
  qrFallbackCommitted: boolean
  stableCount: number
  stableFramesRequired: number
}): boolean
