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
        "texture2D( map, vMapUv )",
        "texture2D( map, rikoPackedAlpha > 0.5 ? clamp(vMapUv, vec2(0.0005), vec2(0.4995, 0.9995)) : vMapUv )",
      ).replace(
        "diffuseColor *= sampledDiffuseColor;",
        `if (rikoPackedAlpha > 0.5) {
          vec2 matteUv = clamp(vMapUv + vec2(0.5, 0.0), vec2(0.5005, 0.0005), vec2(0.9995, 0.9995));
          sampledDiffuseColor.a *= texture2D(map, matteUv).g;
        }
        diffuseColor *= sampledDiffuseColor;`,
      ),
    )
  }
  material.customProgramCacheKey = () => "riko-packed-alpha-single-texture-v2"
  return enabled
}
