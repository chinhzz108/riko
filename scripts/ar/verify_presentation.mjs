import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import { getBillboardBasis, getPresentationLayout } from "../../src/lib/arPresentation.js"

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"))
const profiles = await readJson("src/data/arVideoPresentation.json")
const { targets } = await readJson("src/data/arPageTargets.json")
const { slots } = await readJson("src/data/bookVideoSlots.json")
const videos = await readJson("public/videos/ar/manifest.json")

for (const video of videos.filter((item) => item.alpha)) {
  const profile = profiles[video.id]
  assert.ok(profile, `${video.id} needs a measured foreground profile`)
  assert.ok(profile.measuredFrames > 0, `${video.id} must cover its animation, not one still`)
  const { left, top, right, bottom } = profile.bounds
  assert.ok(left >= 0 && right <= 1 && left < right)
  assert.ok(top >= 0 && bottom <= 1 && top < bottom)
  assert.ok(profile.packedVideoUrl?.startsWith("/videos/ar/packed/"))
  await access(`public${profile.packedVideoUrl}`)
}

for (const target of targets) {
  const slot = slots.find((item) => item.id === target.slotId)
  const video = videos.find((item) => item.url === slot.arVideoUrl)
  const profile = profiles[video.id]
  for (const aspect of [9 / 16, 1, 16 / 9]) {
    const layout = getPresentationLayout(target, profile, aspect)
    assert.ok(layout.width > 0 && layout.height > 0)
    const expectedAspect = aspect * (profile.bounds.right - profile.bounds.left) / (profile.bounds.bottom - profile.bounds.top)
    assert.ok(Math.abs(layout.width / layout.height - expectedAspect) < 1e-8, "crop keeps the subject's proportions")
    const bigger = getPresentationLayout(target, profile, aspect, 1.5)
    assert.ok(Math.abs(bigger.width / layout.width - 1.5) < 1e-8)
    assert.equal(bigger.baseX, layout.baseX, "zoom never moves the planted foot")
    assert.equal(bigger.baseY, layout.baseY)
  }
}

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0)
let poses = 0
for (let rotation = 0; rotation < 360; rotation += 5) {
  for (const elevation of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95, 1]) {
    const azimuth = rotation * Math.PI / 180
    const r = Math.sqrt(1 - elevation * elevation)
    const view = [Math.sin(azimuth) * r, -Math.cos(azimuth) * r, elevation]
    const basis = getBillboardBasis(...view)
    for (const axis of [basis.right, basis.up, basis.normal]) {
      assert.ok(axis.every(Number.isFinite), "no invalid transform at steep or rolled views")
      assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-8)
    }
    assert.ok(Math.abs(dot(basis.up, basis.normal)) < 1e-8)
    assert.ok(dot(basis.normal, view) > 0.999999, "video faces the viewer instead of turning edge-on")
    assert.ok(dot(basis.up, [0, 1, 0]) >= -1e-8, "book rotation cannot invert the video")
    poses += 1
  }
}
console.log(`AR presentation passed: ${Object.keys(profiles).length} full-animation crops/packed clips, ${targets.length} page layouts, ${poses} viewing poses.`)
