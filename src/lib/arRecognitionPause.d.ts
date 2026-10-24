export type RecognitionController = {
  processingVideo: boolean
  onUpdate?: ((event: { type: string; [key: string]: unknown }) => void) | null
  processVideo(input: HTMLVideoElement): void
  stopProcessVideo(): void
}
export function createRecognitionPause(controller: RecognitionController, nextFrame: () => Promise<void>): {
  pause(): void
  resume(input: HTMLVideoElement, stillScanning: () => boolean): Promise<void>
  dispose(): void
}
