// Run: node tests/transpile.js && node --test tests/
// The client side date cache: loading with pages, range, counts, activity, ids.
const test = require('node:test')
const assert = require('node:assert/strict')
const dc = require('./build/runtime/lib/dateCache.js')

const D = (s) => Date.UTC(...s.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x)))
const rows = [[1, '1882-04-01', null], [2, '1950-06-15', '1960-01-01'], [3, '2020-01-10', null], [4, null, null], [5, '2024-03-14', '2024-03-20']]
const layer = (pageLimit) => ({
  type: 'feature', objectIdField: 'OID', definitionExpression: 'STATUS = 1',
  createQuery: () => ({}),
  queryFeatures: async (q) => {
    assert.equal(q.where, 'STATUS = 1'); assert.equal(q.returnGeometry, false)
    const slice = rows.slice(q.start, q.start + Math.min(q.num, pageLimit))
    return { features: slice.map(r => ({ attributes: { OID: r[0], S: r[1] ? D(r[1]) : null, E: r[2] ? D(r[2]) : null } })), exceededTransferLimit: q.start + slice.length < rows.length }
  }
})

test('loads every page, keeps NaN for missing dates, respects the cap', async () => {
  const t = { key: 'k', title: 'K', kind: 'layer', target: layer(2), owner: null, pick: { start: 'S', end: 'E' }, enabled: true, on: true, fixed: false, dateFields: [] }
  const c = await dc.loadDateCache(t, { widgetId: 'w', max: 100 })
  assert.equal(c.total, 5); assert.deepEqual(c.ids, [1, 2, 3, 4, 5]); assert.ok(Number.isNaN(c.starts[3])); assert.equal(c.ends.length, 5)
  assert.equal(await dc.loadDateCache(t, { widgetId: 'w', max: 3 }), null)
  assert.equal(await dc.loadDateCache({ ...t, kind: 'sublayer' }, { widgetId: 'w', max: 100 }), null)
})

test('range, counts, activity and ids match the where clause rules', async () => {
  const t = { key: 'k', title: 'K', kind: 'layer', target: layer(10), owner: null, pick: { start: 'S', end: 'E' }, enabled: true, on: true, fixed: false, dateFields: [] }
  const c = await dc.loadDateCache(t, { widgetId: 'w', max: 100 })
  const r = dc.cacheRange(c)
  assert.equal(new Date(r.start).getUTCFullYear(), 1882); assert.equal(new Date(r.end).getUTCFullYear(), 2024)
  // as of 1955: 1882 (open ended) and 1950..1960 span
  assert.equal(dc.cacheCount(c, 'year', D('1955-01-01'), D('1955-01-01'), 'asof'), 2)
  assert.equal(dc.cacheCount(c, 'day', D('2024-03-14'), D('2024-03-14'), 'asof'), 3)
  assert.equal(dc.cacheCount(c, 'day', D('2024-03-21'), D('2024-03-21'), 'asof'), 2)
  const single = { ...c, ends: null }
  assert.equal(dc.cacheCount(single, 'year', D('2020-01-01'), D('2024-12-31'), 'between'), 2)
  assert.deepEqual([...dc.cacheActivity(c, 'year').entries()], [['1882', 1], ['1950', 1], ['2020', 1], ['2024', 1]])
  assert.deepEqual(dc.cacheIdsBetween(c, D('2000-01-01'), D('2024-12-31')), [3, 5])
  assert.deepEqual(dc.cacheIdsBetween(c, D('1800-01-01'), D('2030-01-01'), 2), [])
})

test('audit: placeholder dates never set the edge; a service that ignores the offset is refused', async () => {
  const c = { ids: [1, 2, 3], starts: [D('1990-01-01'), D('2010-01-01'), D('9999-12-31')], ends: [D('2999-01-01'), NaN, NaN], complete: true, total: 3 }
  const r = dc.cacheRange(c)
  assert.equal(new Date(r.start).getUTCFullYear(), 1990); assert.equal(new Date(r.end).getUTCFullYear(), 2010)
  const stuck = { type: 'feature', objectIdField: 'OID', createQuery: () => ({}), queryFeatures: async () => ({ features: [{ attributes: { OID: 1, S: D('2020-01-01') } }], exceededTransferLimit: true }) }
  const t = { key: 'k', title: 'K', kind: 'layer', target: stuck, owner: null, pick: { start: 'S' }, enabled: true, on: true, fixed: false, dateFields: [] }
  assert.equal(await dc.loadDateCache(t, { widgetId: 'w', max: 100000 }), null)
  const noPage = { ...stuck, capabilities: { query: { supportsPagination: false } } }
  assert.equal(await dc.loadDateCache({ ...t, target: noPage }, { widgetId: 'w', max: 100000 }), null)
})
