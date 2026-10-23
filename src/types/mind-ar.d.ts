declare module "mind-ar/dist/mindar-image-three.prod.js" {
  import type { Camera, Group, Scene, WebGLRenderer } from "three"

  export class MindARThree {
    constructor(options: Record<string, unknown>)
    video: HTMLVideoElement
    renderer: WebGLRenderer
    scene: Scene
    camera: Camera
    cssRenderer: { domElement: HTMLElement }
    addAnchor(targetIndex: number): {
      group: Group
      onTargetFound: (() => void) | null
      onTargetLost: (() => void) | null
    }
    start(): Promise<void>
    stop(): void
  }
}
