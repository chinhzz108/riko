export const MIN_AR_SCALE = 0.5
export const MAX_AR_SCALE = 2.5

export const clampARScale = (value) =>
  Math.min(MAX_AR_SCALE, Math.max(MIN_AR_SCALE, value))

/** A time-based filter: suppress camera noise, respond faster to deliberate movement. */
export function poseSmoothingAlpha(
  deltaSeconds,
  translationInPages,
  rotationRadians,
) {
  const movement = Math.min(
    1,
    Math.max(translationInPages / 0.16, rotationRadians / 0.45),
  )
  const timeConstant = 0.095 - movement * 0.065
  return 1 - Math.exp(-Math.min(0.1, Math.max(0, deltaSeconds)) / timeConstant)
}

export function gestureFrame(points) {
  if (!points.length) return null
  if (points.length === 1)
    return { x: points[0].x, y: points[0].y, distance: 0 }
  return {
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2,
    distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
  }
}
