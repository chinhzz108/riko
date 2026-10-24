// LiteRT's official loader calls importScripts; keep a classic WorkerGlobalScope.
let detectorHandler
self.Module = {
  locateFile: (file) =>
    new URL(`../litert/wasm/${file}`, self.location.href).href,
}
const dispatch = async (event) => {
  try {
    if (!detectorHandler) {
      await import(event.data.entry)
      detectorHandler = self.onmessage
      self.onmessage = dispatch
      if (detectorHandler === dispatch)
        throw new Error("Detector entry did not initialize.")
    }
    await detectorHandler({ data: event.data.request })
  } catch (error) {
    event.data.request.image?.close()
    self.postMessage({ id: event.data.request.id, error: String(error) })
  }
}
self.onmessage = dispatch
