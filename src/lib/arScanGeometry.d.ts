import type { ARDetection } from "./arDetector"

export function getCoverRect(
  box: ARDetection["box"],
  videoWidth: number,
  videoHeight: number,
  frameWidth: number,
  frameHeight: number,
): { left: number; top: number; width: number; height: number } | null
