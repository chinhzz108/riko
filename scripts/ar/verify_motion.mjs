import assert from "node:assert/strict"
import { Quaternion, Vector3 } from "three"
import {
  clampARScale,
  gestureFrame,
  poseSmoothingAlpha,
} from "../../src/lib/arMotion.js"

assert.equal(clampARScale(0), 0.5)
assert.equal(clampARScale(3), 2.5)
assert.equal(clampARScale(1.4), 1.4)
assert.equal(gestureFrame([]), null)
assert.deepEqual(
  gestureFrame([
    { x: 0, y: 40 },
    { x: 100, y: 40 },
  ]),
  { x: 50, y: 40, distance: 100 },
)

function filter(fps, target, seconds) {
  let value = 0
  for (let frame = 0; frame < fps * seconds; frame++)
    value += (target - value) * poseSmoothingAlpha(1 / fps, 0, 0)
  return value
}
assert.ok(Math.abs(filter(30, 1, 0.5) - filter(60, 1, 0.5)) < 1e-10)
assert.ok(filter(60, 1, 0.5) > 0.99, "no permanent tracking lag")
assert.ok(
  poseSmoothingAlpha(1 / 60, 0.2, 0) > poseSmoothingAlpha(1 / 60, 0.001, 0),
  "intentional movement responds faster",
)
assert.equal(poseSmoothingAlpha(0, 1, 1), 0)

const axis = new Vector3(0, 0, 1)
const nearPi = new Quaternion().setFromAxisAngle(axis, Math.PI - 0.01)
const acrossPi = new Quaternion().setFromAxisAngle(axis, -Math.PI + 0.01)
const filtered = nearPi
  .clone()
  .slerp(acrossPi, poseSmoothingAlpha(1 / 60, 0, nearPi.angleTo(acrossPi)))
assert.ok(
  nearPi.angleTo(filtered) < 0.02,
  "rotation crosses 180 degrees without a full spin",
)
assert.ok(
  Math.abs(filtered.length() - 1) < 1e-10,
  "no matrix shear while smoothing",
)
console.log(
  "AR motion passed: scale limits, pinch center, time-based smoothing, motion response and quaternion wraparound.",
)
