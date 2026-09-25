// Run: node tests/transpile.js && node --test tests/
// The map side, driven with plain objects shaped like Maps SDK layers.
const test = require('node:test')
const assert = require('node:assert/strict')
const eng = require('./build/runtime/lib/layerEngine.js')

const coll = (items) => ({ items, toArray: () => items.slice(), indexOf: (x) => items.indexOf(x) })
const feat = (id, title, fields, extra = {}) => ({ id, title, type: 'feature', fields, definitionExpression: null, ...extra })
const D = (s) => Date.UTC(...s.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x)))

function sampleMap () {
  const permits = feat('permits', 'Permits', [{ name: 'OBJECTID', type: 'oid' }, { name: 'ISSUE_DATE', type: 'date' }, { name: 'EXPIRE_DATE', type: 'date' }])
  const concerns = feat('rac', 'Report a Concern', [{ name: 'created_date', type: 'date' }, { name: 'closed', type: 'date' }], { definitionExpression: 'STATUS = 1' })
  const parcels = feat('parcels', 'Parcels', [{ name: 'PARCEL', type: 'string' }])
  const hidden = feat('hid', 'Hidden helper', [{ name: 'd', type: 'date' }], { listMode: 'hide' })
  const sub1 = { id: 3, title: 'Water Mains', fields: [{ name: 'INSTALL_DATE', type: 'esriFieldTypeDate' }] }
  const sub0 = { id: 0, title: 'Group', sublayers: [sub1] }
  const utils = { id: 'utilsvc', title: 'Utilities', type: 'map-image', allSublayers: coll([sub0, sub1]) }
  const a19 = { id: 'a19', title: 'Aerials 2019', type: 'tile', visible: true }
  const a21 = { id: 'a21', title: 'Aerials 2021', type: 'tile', visible: true }
  const a23 = { id: 'a23', title: 'Aerials 2023', type: 'tile', visible: false }
  const aer = { id: 'aer', title: 'Aerials', type: 'group', layers: coll([a19, a21, a23]) }
  const grp = { id: 'g', title: 'Planning', type: 'group', layers: coll([permits, concerns]) }
  const map = { layers: coll([aer, utils, parcels, grp]) }
  return { map, permits, concerns, parcels, sub1, a19, a21, a23, aer }
}

test('walkLayers visits top of list first and descends into groups', () => {
  const { map } = sampleMap()
  const seen = []
  eng.walkLayers(map, (l) => seen.push(l.id))
  assert.deepEqual(seen, ['g', 'rac', 'permits', 'parcels', 'utilsvc', 'aer', 'a23', 'a21', 'a19'])
})

test('discoverTargets: auto mode finds feature layers, sublayers, spans; skips hidden and no-date', async () => {
  const { map } = sampleMap()
  const out = await eng.discoverTargets(map, { config: { autoDiscover: true, preferredFields: ['issue_date', 'created'] }, widgetId: 'w1' })
  const byKey = Object.fromEntries(out.map(t => [t.key, t]))
  assert.deepEqual(Object.keys(byKey).sort(), ['permits', 'rac', 'utilsvc::3'])
  assert.deepEqual(byKey.permits.pick, { start: 'ISSUE_DATE' })
  assert.deepEqual(byKey.rac.pick, { start: 'created_date', end: 'closed' })
  assert.equal(byKey['utilsvc::3'].kind, 'sublayer')
  assert.equal(byKey['utilsvc::3'].title, 'Utilities: Water Mains')
  assert.deepEqual(byKey['utilsvc::3'].pick, { start: 'INSTALL_DATE' })
})

test('discoverTargets: rules override and autoDiscover off keeps only ruled layers', async () => {
  const { map } = sampleMap()
  const rules = [
    { layerId: 'permits', mode: 'span', startField: 'ISSUE_DATE', endField: 'EXPIRE_DATE' },
    { layerId: '', title: 'report a concern', mode: 'off' },
    { layerId: 'utilsvc::3', mode: 'field', startField: 'INSTALL_DATE' }
  ]
  const out = await eng.discoverTargets(map, { config: { autoDiscover: false, rules, preferredFields: [] }, widgetId: 'w1' })
  assert.deepEqual(out.map(t => t.key).sort(), ['permits', 'utilsvc::3'])
  assert.deepEqual(out.find(t => t.key === 'permits').pick, { start: 'ISSUE_DATE', end: 'EXPIRE_DATE' })
})

test('readFields loads a layer, then falls back to REST json', async () => {
  let loaded = false
  const lazy = { fields: [], load: async () => { loaded = true; lazy.fields = [{ name: 'X', type: 'date' }] } }
  assert.deepEqual((await eng.readFields(lazy)).map(f => f.name), ['X'])
  assert.equal(loaded, true)
  const rest = { url: 'https://x/FeatureServer/0' }
  const fields = await eng.readFields(rest, async (u) => { assert.equal(u, 'https://x/FeatureServer/0?f=json'); return { fields: [{ name: 'Y', type: 'esriFieldTypeDate' }] } })
  assert.deepEqual(fields.map(f => f.name), ['Y'])
  assert.deepEqual(await eng.readFields({ load: async () => { throw new Error('boom') } }), [])
})

test('applyTime sets, combines with the original filter, and restoreAll puts it back', async () => {
  const { map, permits, concerns } = sampleMap()
  const targets = await eng.discoverTargets(map, { config: { autoDiscover: true, preferredFields: ['issue_date', 'created'] }, widgetId: 'w1' })
  const n = eng.applyTime({ targets, widgetId: 'w1', g: 'day', from: D('2024-03-14'), to: D('2024-03-14'), semantic: 'asof' })
  assert.equal(n, 3)
  assert.equal(permits.definitionExpression, "ISSUE_DATE <= TIMESTAMP '2024-03-14 23:59:59'")
  assert.equal(concerns.definitionExpression, "(STATUS = 1) AND (created_date <= TIMESTAMP '2024-03-14 23:59:59' AND (closed IS NULL OR closed >= TIMESTAMP '2024-03-14 00:00:00'))")
  // same date again: nothing changes
  assert.equal(eng.applyTime({ targets, widgetId: 'w1', g: 'day', from: D('2024-03-14'), to: D('2024-03-14'), semantic: 'asof' }), 0)
  // a disabled target goes back to its own filter while the others keep ours
  targets.find(t => t.key === 'rac').enabled = false
  eng.applyTime({ targets, widgetId: 'w1', g: 'day', from: D('2024-03-15'), to: D('2024-03-15'), semantic: 'asof' })
  assert.equal(concerns.definitionExpression, 'STATUS = 1')
  assert.equal(permits.definitionExpression, "ISSUE_DATE <= TIMESTAMP '2024-03-15 23:59:59'")
  eng.restoreAll(targets, 'w1')
  assert.equal(permits.definitionExpression, null)
  assert.equal(concerns.definitionExpression, 'STATUS = 1')
  // the original is remembered once, even if applied many times, and per widget id
  eng.applyTime({ targets, widgetId: 'w2', g: 'day', from: D('2024-01-01'), to: D('2024-01-01'), semantic: 'asof' })
  assert.equal(eng.originalWhere(concerns, 'w2'), 'STATUS = 1')
})

test('year sets show the right child and restore visibility', () => {
  const { map, a19, a21, a23 } = sampleMap()
  const sets = eng.discoverYearSets(map, [{ groupLayerId: '', title: 'aerials' }])
  assert.equal(sets.length, 1)
  assert.deepEqual(sets[0].children.map(c => c.year), [2019, 2021, 2023])
  eng.applyYearSets(sets, D('2022-05-01'))
  assert.deepEqual([a19.visible, a21.visible, a23.visible], [false, true, false])
  eng.applyYearSets(sets, D('2010-05-01'))
  assert.deepEqual([a19.visible, a21.visible, a23.visible], [true, false, false])
  eng.restoreYearSets(sets)
  assert.deepEqual([a19.visible, a21.visible, a23.visible], [true, true, false])
  assert.equal(eng.discoverYearSets(map, []).length, 0)
  assert.equal(eng.discoverYearSets(map, [{ groupLayerId: 'nope' }]).length, 0)
})

test('dataRange collects min and max across targets and skips failures', async () => {
  const targets = [
    { key: 'a', pick: { start: 'D' }, target: {} },
    { key: 'b', pick: { start: 'S', end: 'E' }, target: {} },
    { key: 'c', pick: { start: 'X' }, target: {} }
  ]
  const stats = { 'a:D': { min: 100, max: 500 }, 'b:S': { min: 50, max: 200 }, 'b:E': { min: 60, max: 900 } }
  const r = await eng.dataRange(targets, async (t, f) => { if (t.key === 'c') throw new Error('no stats'); return stats[t.key + ':' + f] })
  assert.deepEqual(r, { start: 50, end: 900 })
})

test('sdkStats builds a statistics query on the original filter', async () => {
  let got = null
  const obj = {
    definitionExpression: "OWN <= TIMESTAMP '2020-01-01 00:00:00'",
    createQuery: () => ({}),
    queryFeatures: async (q) => { got = q; return { features: [{ attributes: { tm_min: 1000, tm_max: '2024-01-01T00:00:00Z' } }] } }
  }
  eng.rememberOriginal(obj, 'w')
  obj.definitionExpression = 'changed'
  const s = await eng.sdkStats({ target: obj, pick: { start: 'D' } }, 'D', 'w')
  assert.equal(got.where, "OWN <= TIMESTAMP '2020-01-01 00:00:00'")
  assert.equal(got.outStatistics.length, 2)
  assert.deepEqual(s, { min: 1000, max: Date.parse('2024-01-01T00:00:00Z') })
  assert.deepEqual(await eng.sdkStats({ target: {}, pick: { start: 'D' } }, 'D', 'w'), { min: null, max: null })
})

test('exposedFields keeps only fields the popup shows, and falls back when none is a date', () => {
  const all = [{ name: 'A_DATE', type: 'date' }, { name: 'B_DATE', type: 'date' }, { name: 'NAME', type: 'string' }]
  const layer = { popupTemplate: { fieldInfos: [{ fieldName: 'a_date', visible: true }, { fieldName: 'B_DATE', visible: false }, { fieldName: 'NAME' }] } }
  assert.deepEqual(eng.exposedFields(layer, all).map(f => f.name), ['A_DATE', 'NAME'])
  assert.deepEqual(eng.exposedFields({ popupTemplate: { fieldInfos: [{ fieldName: 'NAME' }] } }, all), all)
  assert.deepEqual(eng.exposedFields({}, all), all)
})

test('on flag follows the layer and its parents; the signature changes with visibility', async () => {
  const { map, permits, sub1 } = sampleMap()
  const grp = map.layers.items[3]
  permits.parent = grp; grp.parent = { type: 'map' }
  const out = await eng.discoverTargets(map, { config: { autoDiscover: true }, widgetId: 'w1' })
  const byKey = Object.fromEntries(out.map(t => [t.key, t]))
  assert.equal(byKey.permits.on, true)
  assert.deepEqual(byKey.permits.dateFields.map(f => f.name), ['ISSUE_DATE', 'EXPIRE_DATE'])
  assert.equal(byKey.permits.fixed, false)
  grp.visible = false
  assert.equal(eng.isTargetOn(byKey.permits), false)
  grp.visible = true; permits.visible = false
  assert.equal(eng.isTargetOn(byKey.permits), false)
  permits.visible = true
  assert.equal(eng.isTargetOn(byKey.permits), true)
  sub1.visible = false
  assert.equal(eng.isTargetOn(byKey['utilsvc::3']), false)
  const m2 = { allLayers: coll([permits, { visible: true }]) }
  const s1 = eng.visibilitySignature(m2); permits.visible = false
  assert.notEqual(eng.visibilitySignature(m2), s1)
})

test('a builder rule fixes the field and the panel offers no choice', async () => {
  const { map } = sampleMap()
  const out = await eng.discoverTargets(map, { config: { autoDiscover: true, rules: [{ layerId: 'permits', mode: 'field', startField: 'EXPIRE_DATE' }] }, widgetId: 'w1' })
  const p = out.find(t => t.key === 'permits')
  assert.deepEqual(p.pick, { start: 'EXPIRE_DATE' })
  assert.equal(p.fixed, true)
})

test('activityCounts: grouped statistics when the service can, bucket counts when it cannot', async () => {
  const bars = [{ key: '2019', from: 0, to: 12, n: 0 }, { key: '2020', from: 12, to: 24, n: 0 }]
  const grouped = feat('g', 'G', [{ name: 'D', type: 'date' }], {
    createQuery: () => ({}),
    queryFeatures: async (q) => {
      assert.deepEqual(q.groupByFieldsForStatistics, ['EXTRACT(YEAR FROM D)', 'EXTRACT(MONTH FROM D)'])
      return { features: [{ attributes: { 'EXTRACT(YEAR FROM D)': 2019, 'EXTRACT(MONTH FROM D)': 3, tm_n: 7 } }, { attributes: { 'EXTRACT(YEAR FROM D)': 2019, 'EXTRACT(MONTH FROM D)': 3, tm_n: 1 } }] }
    }
  })
  const t1 = { key: 'g', title: 'G', kind: 'layer', target: grouped, owner: grouped, pick: { start: 'D' }, enabled: true, on: true, fixed: false, dateFields: [] }
  const m1 = await eng.activityCounts(t1, 'month', 'w', bars, 0, 'month')
  assert.deepEqual([...m1.entries()], [['2019-03', 8]])
  const wheres = []
  const plain = feat('p', 'P', [{ name: 'D', type: 'date' }], {
    createQuery: () => ({}),
    queryFeatures: async () => { throw new Error('no expressions') },
    queryFeatureCount: async (q) => { wheres.push(q.where); return wheres.length }
  })
  const t2 = { ...t1, target: plain, owner: plain }
  const m2 = await eng.activityCounts(t2, 'year', 'w', bars, Date.UTC(2019, 0, 1), 'month')
  assert.deepEqual([...m2.entries()].sort(), [['2019', 1], ['2020', 2]])
  assert.ok(wheres[0].includes("D >= TIMESTAMP '2019-01-01 00:00:00'") && wheres[0].includes("D < TIMESTAMP '2020-01-01 00:00:00'"))
  const none = await eng.activityCounts({ ...t1, target: {}, owner: {} }, 'year', 'w', bars, 0, 'month')
  assert.equal(none.size, 0)
})

test('sdkStats: uppercase statistic names are read; without statistics the two edge records are used', async () => {
  const up = feat('u', 'U', [{ name: 'D', type: 'date' }], { createQuery: () => ({}), queryFeatures: async () => ({ features: [{ attributes: { TM_MIN: 1000, TM_MAX: 5000 } }] }) })
  const t1 = { key: 'u', title: 'U', kind: 'layer', target: up, owner: up, pick: { start: 'D' }, enabled: true, on: true, fixed: false, dateFields: [] }
  assert.deepEqual(await eng.sdkStats(t1, 'D', 'w'), { min: 1000, max: 5000 })
  const seen = []
  const plain = feat('p', 'P', [{ name: 'D', type: 'date' }], {
    createQuery: () => ({}),
    queryFeatures: async (q) => {
      if (q.outStatistics) throw new Error('no statistics')
      seen.push(q.orderByFields[0])
      return { features: [{ attributes: { d: q.orderByFields[0].endsWith('DESC') ? 9000 : 2000 } }] }
    }
  })
  const t2 = { ...t1, target: plain, owner: plain }
  assert.deepEqual(await eng.sdkStats(t2, 'D', 'w'), { min: 2000, max: 9000 })
  assert.deepEqual(seen.sort(), ['D ASC', 'D DESC'])
})

test('discoverTargets reports why a layer is left out and prefers story dates over tracking dates', async () => {
  const { map } = sampleMap()
  const hub = feat('hub', 'Development Hub', [{ name: 'created_date', type: 'date' }, { name: 'ANNEX_DATE', type: 'date' }], { editFieldsInfo: { creationDateField: 'created_date' } })
  map.layers.items.push(hub)
  const skipped = []
  const out = await eng.discoverTargets(map, { config: { autoDiscover: true, preferredFields: ['date'] }, widgetId: 'w1', onSkip: (title, key, reason) => skipped.push([key, reason]) })
  const h = out.find(t => t.key === 'hub')
  assert.deepEqual(h.pick, { start: 'ANNEX_DATE' })
  assert.deepEqual(h.dateFields.map(f => f.name), ['ANNEX_DATE', 'created_date'])
  assert.ok(skipped.some(s => s[0] === 'parcels' && s[1] === 'no-date-field'))
  const skipped2 = []
  await eng.discoverTargets(map, { config: { autoDiscover: false, rules: [{ layerId: 'hub', mode: 'off' }] }, widgetId: 'w1', onSkip: (t, k, r) => skipped2.push([k, r]) })
  assert.ok(skipped2.some(s => s[0] === 'hub' && s[1] === 'rule-off'))
  assert.ok(skipped2.some(s => s[0] === 'permits' && s[1] === 'not-in-rules'))
})

test('sdkStats keeps dates before 1970 (negative epoch ms)', async () => {
  const old = feat('o', 'Annexations', [{ name: 'ANNEX_DATE', type: 'date' }], { createQuery: () => ({}), queryFeatures: async () => ({ features: [{ attributes: { tm_min: Date.UTC(1882, 6, 4), tm_max: Date.UTC(2026, 8, 1) } }] }) })
  const t1 = { key: 'o', title: 'Annexations', kind: 'layer', target: old, owner: old, pick: { start: 'ANNEX_DATE' }, enabled: true, on: true, fixed: false, dateFields: [] }
  const s = await eng.sdkStats(t1, 'ANNEX_DATE', 'w')
  assert.equal(new Date(s.min).getUTCFullYear(), 1882); assert.equal(new Date(s.max).getUTCFullYear(), 2026)
  const r = await eng.dataRange([t1], () => eng.sdkStats(t1, 'ANNEX_DATE', 'w'))
  assert.equal(new Date(r.start).getUTCFullYear(), 1882)
})

test('newSince asks for the ids dated after the previous position, on top of the layer filter', async () => {
  let where = null
  const lyr = feat('n', 'New', [{ name: 'D', type: 'date' }], { definitionExpression: 'STATUS = 1', createQuery: () => ({}), queryObjectIds: async (q) => { where = q.where; return [1, 2, 3] } })
  const t1 = { key: 'n', title: 'New', kind: 'layer', target: lyr, owner: lyr, pick: { start: 'D' }, enabled: true, on: true, fixed: false, dateFields: [] }
  const ids = await eng.newSince(t1, 'w', Date.UTC(2020, 0, 1), Date.UTC(2020, 0, 2), 'day')
  assert.deepEqual(ids, [1, 2, 3])
  assert.ok(where.startsWith('(STATUS = 1) AND'), where)
  assert.ok(where.includes("D >= TIMESTAMP '2020-01-02 00:00:00'") && where.includes("D <= TIMESTAMP '2020-01-02 23:59:59'"), where)
  const big = { ...t1, target: { ...lyr, queryObjectIds: async () => Array.from({ length: 3000 }, (_x, i) => i) } }
  assert.deepEqual(await eng.newSince(big, 'w', 0, 86400000, 'day'), [])
  assert.deepEqual(await eng.newSince({ ...t1, kind: 'sublayer' }, 'w', 0, 86400000, 'day'), [])
})

test('applyTime filters on the layer view when one is given and leaves definitionExpression alone; restoreAll clears both', () => {
  const lyr = feat('v', 'Viewed', [{ name: 'D', type: 'date' }], { definitionExpression: 'STATUS = 1' })
  const lv = { filter: null }
  const t1 = { key: 'v', title: 'Viewed', kind: 'layer', target: lyr, owner: lyr, pick: { start: 'D' }, enabled: true, on: true, fixed: false, dateFields: [] }
  const wheres = {}
  const n = eng.applyTime({ targets: [t1], widgetId: 'w', g: 'day', from: D('2024-03-14'), to: D('2024-03-14'), semantic: 'asof', layerViews: new Map([['v', lv]]), onWhere: (k, w) => { wheres[k] = w } })
  assert.equal(n, 1)
  assert.equal(lyr.definitionExpression, 'STATUS = 1')
  assert.equal(lv.filter.where, "D <= TIMESTAMP '2024-03-14 23:59:59'")
  assert.equal(wheres.v, "(STATUS = 1) AND (D <= TIMESTAMP '2024-03-14 23:59:59')")
  // same date again: nothing changes
  assert.equal(eng.applyTime({ targets: [t1], widgetId: 'w', g: 'day', from: D('2024-03-14'), to: D('2024-03-14'), semantic: 'asof', layerViews: new Map([['v', lv]]) }), 0)
  // the view arrives after a server side filter was set: the layer goes back to its own filter
  const lyr2 = feat('s', 'Server first', [{ name: 'D', type: 'date' }], { definitionExpression: null })
  const t2 = { ...t1, key: 's', target: lyr2, owner: lyr2 }
  eng.applyTime({ targets: [t2], widgetId: 'w', g: 'day', from: D('2024-03-14'), to: D('2024-03-14'), semantic: 'asof' })
  assert.ok(lyr2.definitionExpression.includes('TIMESTAMP'))
  const lv2 = { filter: null }
  eng.applyTime({ targets: [t2], widgetId: 'w', g: 'day', from: D('2024-03-14'), to: D('2024-03-14'), semantic: 'asof', layerViews: new Map([['s', lv2]]) })
  assert.equal(lyr2.definitionExpression, null); assert.ok(lv2.filter.where.includes('TIMESTAMP'))
  eng.restoreAll([t1, t2], 'w', new Map([['v', lv], ['s', lv2]]))
  assert.equal(lv.filter, null); assert.equal(lv2.filter, null); assert.equal(lyr.definitionExpression, 'STATUS = 1')
})

test('audit: a filter set by another widget becomes the layer own filter; a dead view is bypassed', () => {
  const lyr = feat('o', 'Other', [{ name: 'D', type: 'date' }], { definitionExpression: null })
  const t1 = { key: 'o', title: 'Other', kind: 'layer', target: lyr, owner: lyr, pick: { start: 'D' }, enabled: true, on: true, fixed: false, dateFields: [] }
  eng.applyTime({ targets: [t1], widgetId: 'w', g: 'day', from: D('2024-03-14'), to: D('2024-03-14'), semantic: 'asof' })
  assert.ok(lyr.definitionExpression.startsWith('D <='))
  lyr.definitionExpression = "STATUS = 'Open'" // another widget
  eng.applyTime({ targets: [t1], widgetId: 'w', g: 'day', from: D('2024-03-15'), to: D('2024-03-15'), semantic: 'asof' })
  assert.equal(lyr.definitionExpression, "(STATUS = 'Open') AND (D <= TIMESTAMP '2024-03-15 23:59:59')")
  const dead = { filter: null, destroyed: true, layer: lyr }
  eng.applyTime({ targets: [t1], widgetId: 'w', g: 'day', from: D('2024-03-16'), to: D('2024-03-16'), semantic: 'asof', layerViews: new Map([['o', dead]]) })
  assert.equal(dead.filter, null); assert.ok(lyr.definitionExpression.includes('2024-03-16'))
  eng.restoreAll([t1], 'w'); assert.equal(lyr.definitionExpression, "STATUS = 'Open'")
})

test('a map service is refreshed once per apply when a sublayer filter changes, and on restore', () => {
  let refreshed = 0
  const owner = { id: 'svc', type: 'map-image', refresh: () => { refreshed++ } }
  const sub = (id) => ({ id, title: String(id), definitionExpression: null, fields: [{ name: 'D', type: 'date' }] })
  const s1 = sub(1); const s2 = sub(2)
  const mk = (s) => ({ key: `svc::${s.id}`, title: `svc: ${s.id}`, kind: 'sublayer', target: s, owner, pick: { start: 'D', end: null }, enabled: true, dateFields: [{ name: 'D', type: 'date' }], on: true, fixed: false })
  const targets = [mk(s1), mk(s2)]
  eng.applyTime({ targets, widgetId: 'w1', g: 'day', from: D('2024-03-14'), to: D('2024-03-14'), semantic: 'asof' })
  assert.equal(refreshed, 1)
  eng.applyTime({ targets, widgetId: 'w1', g: 'day', from: D('2024-03-14'), to: D('2024-03-14'), semantic: 'asof' })
  assert.equal(refreshed, 1, 'no change, no refresh')
  eng.applyTime({ targets, widgetId: 'w1', g: 'day', from: D('2024-03-15'), to: D('2024-03-15'), semantic: 'asof' })
  assert.equal(refreshed, 2)
  eng.restoreAll(targets, 'w1')
  assert.equal(refreshed, 3)
  assert.equal(s1.definitionExpression, null)
})
