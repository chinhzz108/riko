import assert from "node:assert/strict"
import { createARPlaybackSession, getLockedVideoLayout } from "../../src/lib/arPlaybackSession.js"
import { createRecognitionPause } from "../../src/lib/arRecognitionPause.js"

const gate=createARPlaybackSession()
assert.equal(gate.open("a"),null)
gate.start()
const first=gate.open("a")
assert.ok(first)
for(let i=0;i<1000;i++) {
  assert.equal(gate.open(i%2?"a":"b"),null,"no repeated recognition or page switching while playing")
  gate.lost("a")
  assert.equal(gate.isCurrent("a",first),true,"losing the book never closes playback")
}
assert.equal(gate.close(),true)
assert.equal(gate.canScan(),true,"X automatically resumes scanning")
assert.equal(gate.isCurrent("a",first),false,"late video promises are stale after X")
assert.equal(gate.close(),false,"double close cannot create another scan loop")
assert.equal(gate.open("a"),null,"same visible page cannot reopen immediately")
assert.ok(gate.open("b"),"another page can open immediately")
gate.close();gate.lost("b")
assert.ok(gate.open("b"),"a dismissed page can return after leaving the camera")
gate.stop();assert.equal(gate.canScan(),false)

let count=0
for(const [w,h]of[[390,844],[844,390],[1280,720]])for(const aspect of[9/16,1,16/9])for(const scale of[.5,1,2.5]) {
  const fixed=getLockedVideoLayout(w,h,aspect,scale,{x:0,y:0})
  assert.ok(fixed.width>0&&fixed.height>0)
  assert.ok(Math.abs(fixed.width/fixed.height-aspect)<1e-9)
  // Neither a camera matrix nor target jitter can feed into screen placement.
  for(let shake=0;shake<100;shake++)assert.deepEqual(getLockedVideoLayout(w,h,aspect,scale,{x:0,y:0}),fixed)
  const moved=getLockedVideoLayout(w,h,aspect,scale,{x:.1,y:-.1})
  assert.ok(Math.abs(moved.x-fixed.x-w*.1)<1e-8)
  assert.ok(Math.abs(moved.y-fixed.y+h*.1)<1e-8)
  count++
}

for(let cycle=0;cycle<50;cycle++) {
  let tracking=true,starts=0,stops=0,updates=0,frames=0,allowed=true
  const controller={get processingVideo(){return tracking},
    onUpdate:()=>updates++,stopProcessVideo(){tracking=false;stops++},
    processVideo(){assert.equal(tracking,false);tracking=true;starts++}}
  const pause=createRecognitionPause(controller,async()=>{frames++})
  pause.pause();pause.pause()
  controller.onUpdate({type:"updateMatrix"})
  assert.equal(updates,0,"draining target events cannot move a locked video")
  const resumed=pause.resume({},()=>allowed)
  const duplicate=pause.resume({},()=>allowed)
  assert.equal(starts,0)
  controller.onUpdate({type:"processDone"})
  await Promise.all([resumed,duplicate])
  assert.equal(stops,1);assert.equal(starts,1);assert.equal(frames,2)
  pause.pause()
  const stale=pause.resume({},()=>allowed)
  allowed=false;controller.onUpdate({type:"processDone"})
  await stale
  assert.equal(starts,1,"stale close/unmount cannot revive recognition")
  pause.dispose()
}
console.log(`AR playback session passed: 1,000 lost/repeated events, ${count} stable screen layouts, 50 pause/drain/resume races.`)
