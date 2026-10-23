/**
 * Maps a detector box in intrinsic video coordinates onto an object-cover
 * camera frame, clipping away the portions hidden by the cover crop.
 */
export function getCoverRect(box, videoWidth, videoHeight, frameWidth, frameHeight) {
  if (videoWidth <= 0 || videoHeight <= 0 || frameWidth <= 0 || frameHeight <= 0) return null

  const scale = Math.max(frameWidth / videoWidth, frameHeight / videoHeight)
  const renderedWidth = videoWidth * scale
  const renderedHeight = videoHeight * scale
  const offsetX = (frameWidth - renderedWidth) / 2
  const offsetY = (frameHeight - renderedHeight) / 2
  const rawLeft = offsetX + box.x * scale
  const rawTop = offsetY + box.y * scale
  const left = Math.max(0, rawLeft)
  const top = Math.max(0, rawTop)
  const right = Math.min(frameWidth, offsetX + (box.x + box.width) * scale)
  const bottom = Math.min(frameHeight, offsetY + (box.y + box.height) * scale)

  if (right <= left || bottom <= top) return null
  return { left, top, width: right - left, height: bottom - top }
}
