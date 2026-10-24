export type VideoPresentation = {
  bounds: { left: number; top: number; right: number; bottom: number }
  grounded: boolean
  mode: string
  packedVideoUrl?: string
  previewVideoUrl?: string
}

export type PresentationLayout = {
  width: number
  height: number
  baseX: number
  baseY: number
  lift: number
  shadowWidth: number
  shadowDepth: number
  crop: VideoPresentation["bounds"]
}

export const DEFAULT_VIDEO_PRESENTATION: VideoPresentation
export function getPresentationLayout(
  target: {
    targetSize: { width: number; height: number }
    overlayBox: { left: number; top: number; right: number; bottom: number }
  },
  profile: VideoPresentation,
  sourceAspect: number,
  userScale?: number,
): PresentationLayout
export function getBillboardBasis(x: number, y: number, z: number, screenUp?: number[]): {
  right: number[]
  up: number[]
  normal: number[]
}
