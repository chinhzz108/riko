/** MindAR 1.2.5 emits processDone before yielding to tf.nextFrame.
 * Drain that frame before restarting so close/reopen cannot spawn two loops.
 * Unlike MindARThree.stop(), this never stops the user's camera stream.
 */
export function createRecognitionPause(controller, nextFrame) {
  const original = controller.onUpdate
  let paused = false, disposed = false, drain = Promise.resolve(), finishDrain = null, resuming = null
  controller.onUpdate = event => {
    if (!paused && !disposed) original?.(event)
    if (event.type === "processDone" && paused && finishDrain) {
      controller.stopProcessVideo()
      const finish = finishDrain
      finishDrain = null
      finish()
    }
  }
  return {
    pause() {
      if (paused || disposed) return
      paused = true
      drain = controller.processingVideo
        ? new Promise(resolve => { finishDrain = resolve })
        : Promise.resolve()
    },
    resume(input, stillScanning) {
      if (disposed || !paused) return Promise.resolve()
      if (resuming) return resuming
      resuming = (async () => {
        await drain
        // The old loop observes false at its first yield. Restart after the
        // next yield, rather than reviving its shared processing flag.
        await nextFrame(); await nextFrame()
        if (disposed || !stillScanning()) return
        paused = false
        controller.processVideo(input)
      })().finally(() => { resuming = null })
      return resuming
    },
    dispose() {
      disposed = true; controller.stopProcessVideo()
      finishDrain?.(); finishDrain = null
      controller.onUpdate = original
    },
  }
}
