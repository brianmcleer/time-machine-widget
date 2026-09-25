// Run: node tests/transpile.js && node --test tests/
// Compare mode against a stub view, document and <arcgis-swipe>.
const test = require('node:test')
const assert = require('node:assert/strict')

class Swipe { constructor () { this.style = {}; this.listeners = {}; this.startLayers = null; this.endLayers = null } addEventListener (n, f) { this.listeners[n] = f } removeEventListener () {} remove () { this.removed = true } }
globalThis.document = { createElement: (tag) => { assert.equal(tag, 'arcgis-swipe'); return new Swipe() } }
globalThis.customElements = { whenDefined: async () => {} }
globalThis.CSSStyleSheet = undefined

const cmp = require('./build/runtime/lib/compare.js')
const eng = require('./build/runtime/lib/layerEngine.js')
class Collection { constructor (items) { this.items = items || [] } toArray () { return this.items.slice() } }
const coll = (items) => ({ items, toArray: () => items.slice(), indexOf: (x) => items.indexOf(x) })
const D = (s) => Date.UTC(...s.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x)))

function build () {
  const mk = (id) => { const l = { id, title: id, type: 'feature', definitionExpression: 'ACTIVE = 1', fields: [{ name: 'D', type: 'date' }] }; l.clone = () => ({ ...l, clone: l.clone, destroyed: false, destroy () { this.destroyed = true } }); return l }
  const permits = mk('permits'); const parcels = { id: 'parcels', title: 'Parcels', type: 'feature', fields: [] }
  const a19 = { id: 'a19', title: 'Aerials 2019', type: 'tile', visible: true }, a23 = { id: 'a23', title: 'Aerials 2023', type: 'tile', visible: false }
  const aer = { id: 'aer', title: 'Aerials', type: 'group', layers: coll([a19, a23]) }
  const layers = [aer, parcels, permits]
  const map = { layers: coll(layers), allLayers: coll(layers), add: (l, i) => { layers.splice(i == null ? layers.length : i, 0, l) }, remove: (l) => { const i = layers.indexOf(l); if (i >= 0) layers.splice(i, 1) } }
  const ui = { added: [], add (el) { this.added.push(el) }, remove (el) { this.added = this.added.filter(x => x !== el) } }
  return { view: { map, ui }, map, permits, a19, a23, aer, layers }
}

test('startCompare clones feature layers for date B, splits year sets, and stops cleanly', async () => {
  const { view, map, permits, a19, a23, layers } = build()
  const targets = await eng.discoverTargets(map, { config: { autoDiscover: true, preferredFields: [] }, widgetId: 'w' })
  const sets = eng.discoverYearSets(map, [{ groupLayerId: 'aer' }])
  eng.applyTime({ targets, widgetId: 'w', g: 'day', from: D('2020-01-01'), to: D('2020-01-01'), semantic: 'asof' })
  const pos = []
  const s = await cmp.startCompare({ view, Collection, widgetId: 'w', g: 'day', targets, yearSets: sets, dateA: D('2020-01-01'), dateB: D('2024-06-01'), position: 40, onPosition: (p) => pos.push(p) })
  assert.equal(s.clones.length, 1)
  assert.equal(s.clones[0].id, 'time-machine-w-cmp-permits')
  assert.equal(s.clones[0].definitionExpression, "(ACTIVE = 1) AND (D <= TIMESTAMP '2024-06-01 23:59:59')")
  assert.equal(layers.indexOf(s.clones[0]), layers.indexOf(permits) + 1, 'clone sits right above its original')
  assert.deepEqual(s.swipe.startLayers.toArray().map(l => l.id), ['permits', 'a19'])
  assert.deepEqual(s.swipe.endLayers.toArray().map(l => l.id), ['time-machine-w-cmp-permits', 'a23'])
  assert.equal(a19.visible, true); assert.equal(a23.visible, true)
  assert.equal(s.swipe.position, 40)
  assert.equal(s.swipe.style.pointerEvents, 'none')
  s.swipe.position = 61; s.swipe.listeners.arcgisSwipeInput()
  assert.deepEqual(pos, [61])
  // both dates move: clone filter and year sides follow
  cmp.updateCompareDates(s, { widgetId: 'w', g: 'day', targets, dateA: D('2024-01-01'), dateB: D('2024-12-31') })
  assert.equal(s.clones[0].definitionExpression, "(ACTIVE = 1) AND (D <= TIMESTAMP '2024-12-31 23:59:59')")
  assert.deepEqual(s.swipe.startLayers.toArray().map(l => l.id), ['permits', 'a23'])
  assert.deepEqual(s.swipe.endLayers.toArray().map(l => l.id), ['time-machine-w-cmp-permits'])
  assert.equal(a19.visible, false)
  cmp.stopCompare(view, s)
  assert.equal(layers.some(l => String(l.id).startsWith('time-machine-')), false)
  assert.equal(s.clones[0].destroyed, true)
  assert.equal(view.ui.added.length, 0)
  assert.deepEqual([a19.visible, a23.visible], [true, false], 'year set visibility restored')
  assert.equal(permits.definitionExpression, "(ACTIVE = 1) AND (D <= TIMESTAMP '2020-01-01 00:00:00')".replace('00:00:00', '23:59:59'), 'original untouched by compare')
})

test('map service sublayers get one clone per service with date B on the dated sublayers', async () => {
  const sub3 = { id: 3, title: 'Mains', fields: [{ name: 'INSTALL_DATE', type: 'date' }], visible: true, definitionExpression: null }
  const sub4 = { id: 4, title: 'Valves', fields: [], visible: true, definitionExpression: 'X = 1' }
  const sub9 = { id: 9, title: 'Hidden', fields: [], visible: false }
  const svc = { id: 'utils', title: 'Utilities', type: 'map-image', url: 'https://x/MapServer', opacity: 0.8, allSublayers: coll([sub3, sub4, sub9]) }
  const layers = [svc]
  const map = { layers: coll(layers), allLayers: coll(layers), add: (l, i) => { layers.splice(i == null ? layers.length : i, 0, l) }, remove: (l) => { const i = layers.indexOf(l); if (i >= 0) layers.splice(i, 1) } }
  const ui = { added: [], add (el) { this.added.push(el) }, remove (el) { this.added = this.added.filter(x => x !== el) } }
  class MapImageLayer { constructor (p) { Object.assign(this, p); this.allSublayers = { find: (f) => this.sublayers.find(f) } } destroy () { this.destroyed = true } }
  const targets = await eng.discoverTargets(map, { config: { autoDiscover: true, preferredFields: [] }, widgetId: 'w' })
  assert.deepEqual(targets.map(t => t.key), ['utils::3'])
  const s = await cmp.startCompare({ view: { map, ui }, Collection, MapImageLayer, widgetId: 'w', g: 'year', targets, yearSets: [], dateA: D('2010-01-01'), dateB: D('2020-01-01'), position: 50, onPosition () {} })
  assert.equal(s.clones.length, 1)
  const c = s.clones[0]
  assert.equal(c.url, 'https://x/MapServer'); assert.equal(c.opacity, 0.8); assert.equal(c.listMode, 'hide')
  assert.deepEqual(c.sublayers.map(x => x.id), [3, 4])
  assert.equal(c.sublayers[0].definitionExpression, "INSTALL_DATE <= TIMESTAMP '2020-12-31 23:59:59'")
  assert.equal(c.sublayers[1].definitionExpression, 'X = 1')
  assert.deepEqual(s.swipe.startLayers.toArray(), [svc]); assert.deepEqual(s.swipe.endLayers.toArray(), [c])
  cmp.updateCompareDates(s, { widgetId: 'w', g: 'year', targets, dateA: D('2010-01-01'), dateB: D('2022-01-01') })
  assert.equal(c.sublayers[0].definitionExpression, "INSTALL_DATE <= TIMESTAMP '2022-12-31 23:59:59'")
  cmp.stopCompare({ map, ui }, s)
  assert.equal(c.destroyed, true); assert.deepEqual(layers, [svc])
})

test('sweepClones removes leftovers from an earlier session of the same widget only', () => {
  const { map, layers } = build()
  layers.push({ id: 'time-machine-w-cmp-old', destroy () {} }, { id: 'time-machine-other-cmp-x' })
  cmp.sweepClones(map, 'w')
  assert.deepEqual(layers.map(l => l.id).filter(id => String(id).startsWith('time-machine')), ['time-machine-other-cmp-x'])
})

test('stopCompare tolerates a missing session and view', () => {
  cmp.stopCompare(null, null)
  cmp.stopCompare(undefined, { swipe: new Swipe(), clones: [], touched: [], yearSets: [], Collection, onInput () {} })
})
