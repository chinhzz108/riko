export const MIN_AR_SCALE: number
export const MAX_AR_SCALE: number
export function clampARScale(value: number): number
export function poseSmoothingAlpha(deltaSeconds: number, translationInPages: number, rotationRadians: number): number
export function gestureFrame(points: { x: number; y: number }[]): { x: number; y: number; distance: number } | null
