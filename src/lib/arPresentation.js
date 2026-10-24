const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const DEFAULT_VIDEO_PRESENTATION = {
  bounds: { left: 0, top: 0, right: 1, bottom: 1 },
  grounded: false,
  mode: "cutout",
}

/** Size the visible subject against the page width, independently of a tiny popup box. */
export function getPresentationLayout(target, profile, sourceAspect, userScale = 1) {
  const crop = profile.bounds
  const aspect = sourceAspect * (crop.right - crop.left) / (crop.bottom - crop.top)
  const pageHeight = target.targetSize.height / target.targetSize.width
  const box = target.overlayBox
  let width = clamp((box.right - box.left) * 1.9, 0.9, 1.12)
  let height = width / aspect
  const heightLimit = pageHeight * 0.96
  if (height > heightLimit) {
    height = heightLimit
    width = height * aspect
  }
  width *= userScale
  height *= userScale
  return {
    width,
    height,
    baseX: clamp((box.left + box.right) / 2 - 0.5, -0.22, 0.22),
    baseY: (0.5 - Math.min(box.bottom, 0.78)) * pageHeight,
    lift: profile.grounded ? 0.008 : 0.045,
    shadowWidth: width * 0.76,
    shadowDepth: width * 0.2,
    crop,
  }
}

/** Face the viewer while keeping the bottom edge planted on the tracked page.
 * Near an overhead view, use screen-up so the cutout never turns edge-on.
 */
export function getBillboardBasis(x, y, z, screenUp = [0, 1, 0]) {
  const length = Math.hypot(x, y, z) || 1
  const normal = [x / length, y / length, z / length]
  const elevation = clamp((normal[2] - 0.42) / 0.5, 0, 1)
  const blend = elevation * elevation * (3 - 2 * elevation)
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0)
  const normalize = (v) => {
    const length = Math.hypot(...v) || 1
    return v.map((value) => value / length)
  }
  const screen = normalize(screenUp.map((value, index) => value - normal[index] * dot(screenUp, normal)))
  let ground = [0, 0, 1].map((value, index) => value - normal[index] * normal[2])
  if (Math.hypot(...ground) < 0.001) ground = screen
  ground = normalize(ground)
  // Keep a rolled/rotated book from turning the video upside down.
  if (dot(ground, screen) < 0) ground = ground.map((value) => -value)
  const desiredUp = normalize(ground.map((value, index) => value * (1 - blend) + screen[index] * blend))
  const right = normalize([
    desiredUp[1] * normal[2] - desiredUp[2] * normal[1],
    desiredUp[2] * normal[0] - desiredUp[0] * normal[2],
    desiredUp[0] * normal[1] - desiredUp[1] * normal[0],
  ])
  const up = [
    normal[1] * right[2] - normal[2] * right[1],
    normal[2] * right[0] - normal[0] * right[2],
    normal[0] * right[1] - normal[1] * right[0],
  ]
  return { right, up, normal }
}
