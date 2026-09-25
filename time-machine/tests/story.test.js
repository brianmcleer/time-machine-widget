// Run: node tests/transpile.js && node --test tests/
// Story chapters: capture from the map, apply and restore map state, the draft, the presenter model.
const test = require('node:test')
const assert = require('node:assert/strict')
const st = require('./build/runtime/lib/story.js')

const coll = (items) => ({ items, toArray: () => items.slice() })

test('captureView reads the viewpoint, layer visibility and basemap; skips helpers and hidden entries', () => {
  const layers = [
    { id: 'permits', visible: true }, { id: 'rac', visible: false }, { id: 'time-machine-w1-cmp-x', visible: true }, { id: 'helper', visible: true, listMode: 'hide' }
  ]
  const map = { allLayers: coll(layers), basemap: { id: 'satellite' } }
  const view = { center: { longitude: -108.5501234567, latitude: 39.0712345678 }, scale: 24000.4, rotation: 12.34 }
  const c = st.captureView(view, map, Date.UTC(2020, 5, 1), 'Chapter 1')
  assert.equal(c.date, '2020-06-01'); assert.equal(c.title, 'Chapter 1')
  assert.equal(c.lon, -108.550123); assert.equal(c.lat, 39.071235); assert.equal(c.scale, 24000); assert.equal(c.rotation, 12.3)
  assert.deepEqual(c.layersOn, ['permits']); assert.deepEqual(c.layersOff, ['rac']); assert.equal(c.basemap, 'satellite')
  const c2 = st.captureView({ center: null, rotation: 0 }, { allLayers: coll([]), basemap: { id: 'basemap-3' } }, Date.UTC(2020, 0, 1), '')
  assert.equal(c2.lon, undefined); assert.equal(c2.rotation, undefined); assert.equal(c2.basemap, undefined); assert.equal(c2.layersOn, undefined)
  const c3 = st.captureView({}, { allLayers: coll([]), basemap: { portalItem: { id: 'abcdef0123456789abcdef0123456789' }, id: 'basemap-1' } }, 0, '')
  assert.equal(c3.basemap, 'abcdef0123456789abcdef0123456789')
})

test('applyChapterLayers changes only what differs and restoreLayers puts it back in order', () => {
  const a = { id: 'a', visible: true }; const b = { id: 'b', visible: false }; const c = { id: 'c', visible: true }
  const map = { allLayers: coll([a, b, c]) }
  const undo1 = st.applyChapterLayers(map, { date: 'x', layersOn: ['b'], layersOff: ['a'] })
  assert.equal(a.visible, false); assert.equal(b.visible, true); assert.equal(c.visible, true)
  assert.deepEqual(undo1.map(u => [u.layer.id, u.visible]), [['a', true], ['b', false]])
  const undo2 = st.applyChapterLayers(map, { date: 'y', layersOff: ['a', 'c'] })
  assert.deepEqual(undo2.map(u => [u.layer.id, u.visible]), [['c', true]])
  const merged = st.mergeUndo(undo1, undo2)
  assert.equal(merged.length, 3)
  st.restoreLayers(merged)
  assert.equal(a.visible, true); assert.equal(b.visible, false); assert.equal(c.visible, true)
  assert.deepEqual(st.applyChapterLayers(map, null), [])
  assert.deepEqual(st.applyChapterLayers(map, { date: 'z' }), [])
})

test('applyChapterBasemap: well known id straight on the map, portal item through the class', () => {
  const map = { basemap: 'streets' }
  assert.equal(st.applyChapterBasemap(map, 'satellite', null), 'streets'); assert.equal(map.basemap, 'satellite')
  assert.equal(st.applyChapterBasemap(map, 'abcdef0123456789abcdef0123456789', null), null); assert.equal(map.basemap, 'satellite')
  class Basemap { constructor (o) { this.portalItem = o.portalItem } }
  assert.equal(st.applyChapterBasemap(map, 'abcdef0123456789abcdef0123456789', Basemap), 'satellite')
  assert.equal(map.basemap.portalItem.id, 'abcdef0123456789abcdef0123456789')
  assert.equal(st.applyChapterBasemap(map, '', Basemap), null)
})

test('showChapterFeature queries one feature and opens the popup', async () => {
  let opened = null; let where = null
  const layer = { id: 'permits', createQuery: () => ({}), queryFeatures: async (q) => { where = q.where; return { features: [{ attributes: { id: 1 }, geometry: { type: 'point' } }] } } }
  const view = { openPopup: async (o) => { opened = o } }
  const map = { allLayers: coll([layer]) }
  assert.equal(await st.showChapterFeature(view, map, { date: 'x', featureLayerId: 'permits', featureWhere: 'PERMIT = 7' }), true)
  assert.equal(where, 'PERMIT = 7'); assert.equal(opened.features.length, 1)
  assert.equal(await st.showChapterFeature(view, map, { date: 'x', featureLayerId: 'nope' }), false)
  assert.equal(await st.showChapterFeature(view, map, { date: 'x' }), false)
})

test('draft round trip, merge, move, XML', () => {
  const store = new Map()
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, v) }, removeItem: (k) => { store.delete(k) } }
  assert.deepEqual(st.readDraft('w1', storage), [])
  const list = [{ date: '2020-01-01', title: 'A' }, { date: '2021-01-01', title: 'B' }]
  assert.equal(st.writeDraft('w1', list, storage), true)
  assert.deepEqual(st.readDraft('w1', storage), list)
  store.set('timeMachine.story.w1', '{bad')
  assert.deepEqual(st.readDraft('w1', storage), [])
  st.writeDraft('w1', [], storage); assert.equal(store.has('timeMachine.story.w1'), false)
  assert.deepEqual(st.mergeChapters([{ date: '2019' }], list).map(c => c.date), ['2019', '2020-01-01', '2021-01-01'])
  assert.deepEqual(st.moveChapter(list, 0, 1).map(c => c.title), ['B', 'A'])
  assert.deepEqual(st.moveChapter(list, 0, -1).map(c => c.title), ['A', 'B'])
  const xml = st.storyXml({ granularity: 'year', chapters: [{ date: '2019', title: 'Built in' }] }, st.mergeChapters([{ date: '2019', title: 'Built in' }], list))
  assert.ok(xml.includes('Built in') && xml.includes('<title t="s">B</title>'))
})

test('presenter helpers: elapsed clock and command parsing', () => {
  assert.equal(st.formatElapsed(0), '0:00'); assert.equal(st.formatElapsed(65000), '1:05'); assert.equal(st.formatElapsed(3600000 + 61000), '1:01:01')
  assert.equal(st.parseCommand('next'), 'next'); assert.deepEqual(st.parseCommand('goto:3'), { goto: 3 })
  assert.equal(st.parseCommand('hello'), null); assert.equal(st.parseCommand(5), null)
})
