// Run: node tests/transpile.js && node --test tests/
// Pure date logic. No Experience Builder runtime needed.
const test = require('node:test')
const assert = require('node:assert/strict')
const tm = require('./build/runtime/lib/timeMath.js')

const D = (s) => Date.UTC(...s.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x)))

test('date field detection covers SDK, REST and EB type names', () => {
  assert.equal(tm.isDateField({ name: 'a', type: 'date' }), true)
  assert.equal(tm.isDateField({ name: 'a', type: 'esriFieldTypeDate' }), true)
  assert.equal(tm.isDateField({ name: 'a', type: 'date-only' }), true)
  assert.equal(tm.isDateField({ name: 'a', type: 'string' }), false)
  assert.equal(tm.isDateField(null), false)
})

test('pickDateField: preferred exact, then contains, then span, then first', () => {
  const pref = ['issue_date', 'created']
  assert.deepEqual(tm.pickDateField([{ name: 'CREATED_DATE', type: 'date' }, { name: 'ISSUE_DATE', type: 'date' }], pref), { start: 'ISSUE_DATE' })
  assert.deepEqual(tm.pickDateField([{ name: 'DateCreatedUtc', type: 'date' }, { name: 'OTHER', type: 'date' }], pref), { start: 'DateCreatedUtc' })
  assert.deepEqual(tm.pickDateField([{ name: 'START_DATE', type: 'date' }, { name: 'END_DATE', type: 'date' }], []), { start: 'START_DATE', end: 'END_DATE' })
  assert.deepEqual(tm.pickDateField([{ name: 'Permit_Start', type: 'date' }, { name: 'Permit_End', type: 'date' }], []), { start: 'Permit_Start', end: 'Permit_End' })
  assert.deepEqual(tm.pickDateField([{ name: 'ZZ', type: 'date' }, { name: 'AA', type: 'date' }], []), { start: 'ZZ' })
  assert.equal(tm.pickDateField([{ name: 'NAME', type: 'string' }], pref), null)
})

test('resolveFieldPick honors rules', () => {
  const fields = [{ name: 'A', type: 'date' }, { name: 'B', type: 'date' }]
  assert.equal(tm.resolveFieldPick(fields, [], { layerId: 'x', mode: 'off' }), null)
  assert.deepEqual(tm.resolveFieldPick(fields, [], { layerId: 'x', mode: 'field', startField: 'B' }), { start: 'B' })
  assert.deepEqual(tm.resolveFieldPick(fields, [], { layerId: 'x', mode: 'span', startField: 'A', endField: 'B' }), { start: 'A', end: 'B' })
  assert.deepEqual(tm.resolveFieldPick(fields, [], { layerId: 'x', mode: 'auto' }), { start: 'A' })
})

test('findRule matches by id first, then by title without case', () => {
  const rules = [{ layerId: '', title: 'Permits', mode: 'off' }, { layerId: 'l1', mode: 'field', startField: 'D' }]
  assert.equal(tm.findRule(rules, 'l1', 'Permits').mode, 'field')
  assert.equal(tm.findRule(rules, 'l9', 'PERMITS ').mode, 'off')
  assert.equal(tm.findRule(rules, 'l9', 'Other'), null)
  assert.equal(tm.findRule([], 'l1', 'x'), null)
})

test('unit rounding and stepping in UTC', () => {
  const ms = D('2024-03-14') + 5 * 3600000
  assert.equal(tm.startOfUnit(ms, 'day'), D('2024-03-14'))
  assert.equal(tm.startOfUnit(ms, 'month'), D('2024-03-01'))
  assert.equal(tm.startOfUnit(ms, 'year'), D('2024-01-01'))
  assert.equal(tm.endOfUnit(ms, 'day'), D('2024-03-15') - 1)
  assert.equal(tm.endOfUnit(ms, 'month'), D('2024-04-01') - 1)
  assert.equal(tm.addUnits(D('2024-01-31'), 1, 'month'), D('2024-03-02')) // JS Date overflow, consistent both ways
  assert.equal(tm.unitsBetween(D('2020-01-01'), D('2024-01-01'), 'year'), 4)
  assert.equal(tm.unitsBetween(D('2020-01-01'), D('2020-04-15'), 'month'), 3)
  assert.equal(tm.unitsBetween(D('2020-01-01'), D('2020-01-31'), 'day'), 30)
  assert.equal(tm.indexToDate(D('2020-01-01'), 10, 'day'), D('2020-01-11'))
  assert.equal(tm.dateToIndex(D('2020-01-01'), D('2020-01-11'), 'day'), 10)
  assert.equal(tm.dateToIndex(D('2020-01-01'), D('2019-01-01'), 'day'), 0)
})

test('ISO parsing accepts yyyy, yyyy-mm, yyyy-mm-dd and rejects the rest', () => {
  assert.equal(tm.parseIsoDate('2019'), D('2019-01-01'))
  assert.equal(tm.parseIsoDate('2019-06'), D('2019-06-01'))
  assert.equal(tm.parseIsoDate(' 2019-06-09 '), D('2019-06-09'))
  assert.ok(Number.isNaN(tm.parseIsoDate('2019-02-30')))
  assert.ok(Number.isNaN(tm.parseIsoDate('June 2019')))
  assert.ok(Number.isNaN(tm.parseIsoDate('')))
  assert.equal(tm.toIsoDate(D('2019-06-09')), '2019-06-09')
})

test('formatDate follows granularity', () => {
  const ms = D('2024-03-04')
  assert.equal(tm.formatDate(ms, 'day'), '4 Mar 2024')
  assert.equal(tm.formatDate(ms, 'month'), 'Mar 2024')
  assert.equal(tm.formatDate(ms, 'year'), '2024')
  assert.equal(tm.formatDate(NaN, 'day'), '')
})

test('buildWhere: single date, range, span, and unsafe names', () => {
  const g = 'day'; const d = D('2024-03-14')
  assert.equal(tm.buildWhere({ pick: { start: 'CREATED' }, g, from: d, to: d, semantic: 'asof' }), "CREATED <= TIMESTAMP '2024-03-14 23:59:59'")
  assert.equal(tm.buildWhere({ pick: { start: 'CREATED' }, g, from: D('2024-03-01'), to: d, semantic: 'between' }), "CREATED >= TIMESTAMP '2024-03-01 00:00:00' AND CREATED <= TIMESTAMP '2024-03-14 23:59:59'")
  assert.equal(tm.buildWhere({ pick: { start: 'S', end: 'E' }, g, from: d, to: d, semantic: 'asof' }), "S <= TIMESTAMP '2024-03-14 23:59:59' AND (E IS NULL OR E >= TIMESTAMP '2024-03-14 00:00:00')")
  assert.equal(tm.buildWhere({ pick: { start: 'S', end: 'E' }, g: 'month', from: D('2024-01-05'), to: D('2024-03-14'), semantic: 'between' }), "S <= TIMESTAMP '2024-03-31 23:59:59' AND (E IS NULL OR E >= TIMESTAMP '2024-01-01 00:00:00')")
  assert.equal(tm.buildWhere({ pick: { start: 'BAD NAME; DROP' }, g, from: d, to: d, semantic: 'asof' }), null)
  assert.equal(tm.buildWhere({ pick: { start: 'OK', end: "x' OR 1=1" }, g, from: d, to: d, semantic: 'asof' }), null)
  assert.equal(tm.safeField('schema.field_1'), 'schema.field_1')
})

test('combineWhere keeps the layer filter and ANDs ours', () => {
  assert.equal(tm.combineWhere('', 'A'), 'A')
  assert.equal(tm.combineWhere('1=1', 'A'), 'A')
  assert.equal(tm.combineWhere('STATUS = 1', 'A'), '(STATUS = 1) AND (A)')
  assert.equal(tm.combineWhere('STATUS = 1', null), 'STATUS = 1')
  assert.equal(tm.combineWhere(null, null), null)
})

test('year sets: year from title and child pick', () => {
  assert.equal(tm.yearFromTitle('Aerials 2019'), 2019)
  assert.equal(tm.yearFromTitle('2021 Imagery (spring)'), 2021)
  assert.equal(tm.yearFromTitle('Parcels_1998'), 1998)
  assert.equal(tm.yearFromTitle('Sewer 12345'), null)
  assert.equal(tm.yearFromTitle('Aerials'), null)
  const kids = [{ key: 'a', year: 2015 }, { key: 'b', year: 2019 }, { key: 'c', year: 2023 }]
  assert.equal(tm.pickYearChild(kids, D('2020-06-01')), 'b')
  assert.equal(tm.pickYearChild(kids, D('2023-01-01')), 'c')
  assert.equal(tm.pickYearChild(kids, D('2001-01-01')), 'a')
  assert.equal(tm.pickYearChild([], D('2001-01-01')), null)
})

test('fitRange grows to the data and ignores junk', () => {
  assert.deepEqual(tm.fitRange(NaN, NaN, [5, null, 2, undefined, NaN, 9]), { start: 2, end: 9 })
  assert.deepEqual(tm.fitRange(3, 4, [1, 10]), { start: 1, end: 10 })
  assert.deepEqual(tm.fitRange(3, 4, []), { start: 3, end: 4 })
})

test('tick indexes keep ends and stay unique', () => {
  assert.deepEqual(tm.tickIndexes(3, 5), [0, 1, 2, 3])
  const t = tm.tickIndexes(1000, 5)
  assert.equal(t[0], 0); assert.equal(t[t.length - 1], 1000); assert.equal(new Set(t).size, t.length)
  assert.deepEqual(tm.tickIndexes(0, 5), [0])
})

test('placeholder dates (2999, 9999, 1899) never stretch the range; the builder can widen the years', () => {
  const y = (n) => Date.UTC(n, 5, 1)
  assert.equal(tm.isRealisticDate(y(2999)), false)
  assert.equal(tm.isRealisticDate(y(9999)), false)
  assert.equal(tm.isRealisticDate(y(1899)), true)
  assert.equal(tm.isRealisticDate(y(1799)), false)
  assert.equal(tm.isRealisticDate(y(2020)), true)
  assert.equal(tm.isRealisticDate(y(new Date().getUTCFullYear() + 2)), false)
  assert.deepEqual(tm.fitRange(NaN, NaN, [y(2005), y(2999), y(2018)]), { start: y(2005), end: y(2018) })
  assert.deepEqual(tm.fitRange(NaN, NaN, [y(2005), y(2999), y(2018)], { maxYear: 3000 }), { start: y(2005), end: y(2999) })
  assert.deepEqual(tm.fitRange(NaN, NaN, [y(1650), y(2018)], { minYear: 1600 }), { start: y(1650), end: y(2018) })
  assert.deepEqual(tm.yearWindow(undefined, Date.UTC(2026, 8, 24)), { min: 1800, max: 2027 })
  assert.deepEqual(tm.yearWindow({ minYear: 2030, maxYear: 2000 }), { min: 2000, max: 2030 })
})

test('activity: unit choice, bars on the index axis, next/previous jumps, busiest, CSV', () => {
  const D = (s) => Date.UTC(...s.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x)))
  assert.equal(tm.activityUnit(D('2010-01-01'), D('2020-01-01'), 'day'), 'year')
  assert.equal(tm.activityUnit(D('2020-01-01'), D('2021-06-01'), 'day'), 'month')
  assert.equal(tm.activityUnit(D('2020-01-01'), D('2021-06-01'), 'year'), 'year')
  const per = [new Map([['2019', 3], ['2021', 5]]), new Map([['2019', 1]])]
  const bars = tm.activityBars(D('2019-01-01'), D('2021-12-31'), 'month', 'year', per)
  assert.deepEqual(bars.map(b => [b.key, b.from, b.to, b.n]), [['2019', 0, 12, 4], ['2020', 12, 24, 0], ['2021', 24, 35, 5]])
  assert.equal(tm.nextActive(bars, 0, 1), 24)
  assert.equal(tm.nextActive(bars, 24, 1), null)
  assert.equal(tm.nextActive(bars, 30, -1), 24)
  assert.equal(tm.nextActive(bars, 24, -1), 0)
  assert.equal(tm.nextActive(bars, 0, -1), null)
  assert.equal(tm.busiestBar(bars).key, '2021')
  assert.equal(tm.busiestBar([]), null)
})

test('editor tracking dates are used only when nothing else is dated', () => {
  const fields = tm.markTracking([{ name: 'OBJECTID', type: 'oid' }, { name: 'created_date', type: 'date' }, { name: 'ANNEX_DATE', type: 'date' }, { name: 'LastEdit', type: 'date' }], { creationDateField: 'created_date', editDateField: 'LastEdit' })
  assert.deepEqual(fields.filter(f => f.tracking).map(f => f.name), ['created_date', 'LastEdit'])
  assert.deepEqual(tm.pickDateField(fields, ['date']), { start: 'ANNEX_DATE' })
  assert.deepEqual(tm.pickDateField(fields, ['annex_date']), { start: 'ANNEX_DATE' })
  assert.deepEqual(tm.orderDateFields(fields).map(f => f.name), ['ANNEX_DATE', 'created_date', 'LastEdit'])
  const only = tm.markTracking([{ name: 'created_date', type: 'date' }], null)
  assert.equal(only[0].tracking, true)
  assert.deepEqual(tm.pickDateField(only, ['date']), { start: 'created_date' })
  assert.equal(tm.isTrackingName('last_edited_date'), true); assert.equal(tm.isTrackingName('ISSUE_DATE'), false)
})
