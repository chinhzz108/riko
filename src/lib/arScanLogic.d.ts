export type ScanSlot = {
  id: string
  group?: string
}

export type ScanTarget = {
  popupLabel: string
  pages: string[]
}

export const QR_FALLBACK_DELAY_MS: 800

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
