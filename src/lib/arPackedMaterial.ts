import type { MeshBasicMaterial } from "three"

/** Read the color and its matte from one video texture / one GPU upload. */
export function configurePackedAlpha(
  material: MeshBasicMaterial,
  mapFragment: string,
) {
  const enabled = { value: 0 }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rikoPackedAlpha = enabled
    shader.fragmentShader =
      "uniform float rikoPackedAlpha;\n" + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      mapFragment.replace(
        "diffuseColor *= sampledDiffuseColor;",
        `if (rikoPackedAlpha > 0.5) {
          sampledDiffuseColor.a *= texture2D(map, vMapUv + vec2(0.5, 0.0)).g;
        }
        diffuseColor *= sampledDiffuseColor;`,
      ),
    )
  }
  material.customProgramCacheKey = () => "riko-packed-alpha-single-texture-v1"
  return enabled
}
