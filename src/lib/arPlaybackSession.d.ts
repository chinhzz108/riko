export type ARPlaybackSnapshot = {
  phase: string
  slotId: string | null
  dismissedId: string | null
  generation: number
}
export function createARPlaybackSession(): {
  snapshot(): ARPlaybackSnapshot
  canScan(): boolean
  start(): void
  open(id: string): number | null
  isCurrent(id: string, ticket: number): boolean
  close(): boolean
  lost(id: string): void
  stop(): void
}
export function getLockedVideoLayout(width: number, height: number, aspect: number, scale: number, offset: { x: number; y: number }): { width: number; height: number; x: number; y: number }
