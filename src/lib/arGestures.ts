import { clampARScale, gestureFrame } from "./arMotion.js"

type Transform = { x: number; y: number; scale: number }
type Options = {
  canStart: () => boolean
  project: (x: number, y: number) => { x: number; y: number } | null
  getTransform: () => Transform
  setTransform: (value: Transform) => void
  commit: () => void
}

/** Keep pointer work outside React; the existing render loop presents each change. */
export function installARGestures(element: HTMLElement, options: Options) {
  const pointers = new Map<number, { x: number; y: number }>()
  let previous = gestureFrame([])
  const rebase = () => {
    previous = gestureFrame([...pointers.values()])
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !options.canStart()) return
    if (
      (event.target as Element).closest(
        "button, a, input, select, video[controls], [data-ar-controls]",
      )
    )
      return
    if (pointers.size >= 2) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    element.setPointerCapture(event.pointerId)
    element.dataset.arDragging = "true"
    rebase()
    event.preventDefault()
  }
  const move = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const current = gestureFrame([...pointers.values()])
    if (current && previous && options.canStart()) {
      const before = options.project(previous.x, previous.y)
      const after = options.project(current.x, current.y)
      const transform = options.getTransform()
      const ratio =
        previous.distance > 8 && current.distance > 8
          ? current.distance / previous.distance
          : 1
      options.setTransform({
        x: transform.x + (before && after ? after.x - before.x : 0),
        y: transform.y + (before && after ? after.y - before.y : 0),
        scale: clampARScale(transform.scale * ratio),
      })
    }
    previous = current
    event.preventDefault()
  }
  const up = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return
    if (element.hasPointerCapture(event.pointerId))
      element.releasePointerCapture(event.pointerId)
    rebase()
    if (!pointers.size) {
      delete element.dataset.arDragging
      options.commit()
    }
  }
  element.addEventListener("pointerdown", down)
  element.addEventListener("pointermove", move)
  element.addEventListener("pointerup", up)
  element.addEventListener("pointercancel", up)
  element.addEventListener("lostpointercapture", up)
  return () => {
    for (const id of pointers.keys()) {
      if (element.hasPointerCapture(id)) element.releasePointerCapture(id)
    }
    pointers.clear()
    delete element.dataset.arDragging
    element.removeEventListener("pointerdown", down)
    element.removeEventListener("pointermove", move)
    element.removeEventListener("pointerup", up)
    element.removeEventListener("pointercancel", up)
    element.removeEventListener("lostpointercapture", up)
  }
}
