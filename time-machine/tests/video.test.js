// Run: node tests/transpile.js && node --test tests/
// Video export, the pure parts.
const test = require('node:test')
const assert = require('node:assert/strict')
const v = require('./build/runtime/lib/video.js')

test('frames per step spreads the length over the steps within bounds', () => {
  assert.equal(v.framesPerStep(300, 30, 10), 1)
  assert.equal(v.framesPerStep(30, 30, 10), 10)
  assert.equal(v.framesPerStep(5, 60, 10), 12)
  assert.equal(v.framesPerStep(0, 30, 10), 1)
})

test('caption layout scales with the frame', () => {
  const l = v.captionLayout(1280, 800)
  assert.equal(l.stripH, 96); assert.ok(l.dateSize > l.titleSize); assert.equal(l.pad, 26)
})

test('no MediaRecorder here: not supported, no recorder', () => {
  global.window = {}
  global.document = { createElement: () => ({}) }
  assert.equal(v.videoSupported(), false)
  assert.equal(v.pickMime(), '')
  assert.equal(v.createRecorder(100, 100, 10, { background: '#fff', text: '#000', muted: '#666', accent: '#28f', credit: '' }), null)
  delete global.window; delete global.document
})
