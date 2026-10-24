import jsQR from "jsqr"

self.onmessage = (
  event: MessageEvent<{ pixels: ArrayBuffer; width: number; height: number }>,
) => {
  const { pixels, width, height } = event.data
  try {
    const result = jsQR(new Uint8ClampedArray(pixels), width, height, {
      inversionAttempts: "attemptBoth",
    })
    self.postMessage({
      data: result?.data || null,
      located: Boolean(result?.location),
    })
  } catch {
    self.postMessage({ data: null, located: false })
  }
}
