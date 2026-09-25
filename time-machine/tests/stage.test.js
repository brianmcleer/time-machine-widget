// Run: node tests/transpile.js && node --test tests/
// Stage tools, the pure parts: pace, dwell, drift, narration text.
const test = require('node:test')
const assert = require('node:assert/strict')
const st = require('./build/runtime/lib/stage.js')

test('pace: ahead, behind, on, and nothing without a target', () => {
  assert.deepEqual(st.pace(0, 0, 10, 0), { deltaSec: null, plannedSec: null, remainingSec: null, label: null })
  const on = st.pace(5 * 60000, 5, 10, 10) // half way at half time
  assert.equal(on.label, 'on'); assert.equal(on.deltaSec, 0); assert.equal(on.remainingSec, 300)
  assert.equal(st.pace(8 * 60000, 5, 10, 10).label, 'behind')
  assert.equal(st.pace(2 * 60000, 5, 10, 10).label, 'ahead')
  assert.equal(st.pace(12 * 60000, 9, 10, 10).remainingSec, 0)
})

test('dwell adds per chapter and ignores junk', () => {
  let d = {}
  d = st.addDwell(d, 0, 1500); d = st.addDwell(d, 0, 500); d = st.addDwell(d, 2, 100); d = st.addDwell(d, -1, 100); d = st.addDwell(d, 1, NaN)
  assert.deepEqual(d, { 0: 2000, 2: 100 })
})

test('drift target and narration text', () => {
  assert.deepEqual(st.driftTarget(10000, 'zoomIn'), { scale: 8000 })
  assert.deepEqual(st.driftTarget(10000, 'zoomOut'), { scale: 12500 })
  assert.equal(st.driftTarget(10000, 'none'), null); assert.equal(st.driftTarget(undefined, 'zoomIn'), null)
  assert.equal(st.narrationText(' The flood ', 'The river rose.'), 'The flood. The river rose.')
  assert.equal(st.narrationText('', ''), '')
})
