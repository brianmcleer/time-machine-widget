// Run: node tests/transpile.js && node --test tests/
const test = require('node:test')
const assert = require('node:assert/strict')
const pr = require('./build/runtime/lib/presentation.js')
const tm = require('./build/runtime/lib/timeMath.js')
const D = (s) => Date.UTC(...s.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x)))

const chapters = [
  { date: '2020-06', title: 'Flood', text: 'The river rose.', lon: -108.55, lat: 39.07, scale: 24000 },
  { date: 'bad', title: 'ignored' },
  { date: '2015-01-01', title: 'Start' },
  { date: '2023-03-14', title: 'Bridge opens', lon: 200 }
]

test('sortedChapters drops bad dates and numbers the rest in order', () => {
  const s = pr.sortedChapters(chapters)
  assert.deepEqual(s.map(c => [c.index, c.chapter.title]), [[0, 'Start'], [1, 'Flood'], [2, 'Bridge opens']])
  assert.deepEqual(pr.sortedChapters(null), [])
})

test('chapter lookups: starting at, in effect, next, prev, loop', () => {
  const s = pr.sortedChapters(chapters)
  assert.equal(pr.chapterStartingAt(s, D('2020-06-01') + 3600000, 'day').chapter.title, 'Flood')
  assert.equal(pr.chapterStartingAt(s, D('2020-06-02'), 'day'), null)
  assert.equal(pr.chapterStartingAt(s, D('2020-06-20'), 'month').chapter.title, 'Flood')
  assert.equal(pr.chapterInEffect(s, D('2021-01-01'), 'day').chapter.title, 'Flood')
  assert.equal(pr.chapterInEffect(s, D('2010-01-01'), 'day'), null)
  assert.equal(pr.nextChapter(s, D('2020-06-01'), 'day', false).chapter.title, 'Bridge opens')
  assert.equal(pr.nextChapter(s, D('2024-01-01'), 'day', false), null)
  assert.equal(pr.nextChapter(s, D('2024-01-01'), 'day', true).chapter.title, 'Start')
  assert.equal(pr.prevChapter(s, D('2020-06-01'), 'day').chapter.title, 'Start')
  assert.equal(pr.prevChapter(s, D('2015-01-01'), 'day'), null)
})

test('banner model and progress', () => {
  const s = pr.sortedChapters(chapters)
  const m = pr.bannerModel({ chapters: s, start: D('2015-01-01'), end: D('2025-01-01'), ms: D('2020-06-15'), g: 'day', chapterLabel: (i, n) => `Chapter ${i} of ${n}` })
  assert.equal(m.date, '15 Jun 2020'); assert.equal(m.title, 'Flood'); assert.equal(m.text, 'The river rose.'); assert.equal(m.chapterLabel, 'Chapter 2 of 3')
  assert.ok(m.progress > 0.5 && m.progress < 0.6); assert.equal(m.marks.length, 3); assert.equal(m.marks[0], 0)
  assert.equal(pr.progress(10, 10, 10), 0); assert.equal(pr.progress(0, 10, 15), 1)
})

test('chapterTarget validates the place', () => {
  assert.deepEqual(pr.chapterTarget(chapters[0]), { center: [-108.55, 39.07], scale: 24000, rotation: undefined })
  assert.equal(pr.chapterTarget(chapters[3]), null)
  assert.equal(pr.chapterTarget({ date: 'x' }), null)
  assert.deepEqual(pr.chapterTarget({ date: 'x', lon: 1, lat: 2, scale: -5, rotation: 90 }), { center: [1, 2], scale: undefined, rotation: 90 })
})

test('keyboard map', () => {
  assert.equal(pr.presentKey(' ', false), 'toggle'); assert.equal(pr.presentKey('ArrowRight', false), 'step'); assert.equal(pr.presentKey('ArrowRight', true), 'next')
  assert.equal(pr.presentKey('Escape', false), 'exit'); assert.equal(pr.presentKey('f', false), 'fullscreen'); assert.equal(pr.presentKey('x', false), null)
  assert.equal(pr.presentKey('g', false), 'grid'); assert.equal(pr.presentKey('L', false), 'spotlight'); assert.equal(pr.presentKey('w', false), 'presenter')
  assert.equal(pr.presentKey('d', false), 'ink'); assert.equal(pr.presentKey('C', false), 'clearInk'); assert.equal(pr.presentKey('b', false), 'blackout'); assert.equal(pr.presentKey('v', false), 'voice')
  assert.equal(pr.presentKey('+', false), 'faster'); assert.equal(pr.presentKey('-', false), 'slower');
  assert.equal(pr.presentKey('.', false), 'blackout'); assert.equal(pr.presentKey(',', false), 'whiteout'); assert.equal(pr.presentKey('z', false), 'undoInk')
  const two = pr.sortedChapters([{ date: '2020-01-01', title: 'first' }, { date: '2020-01-01', title: 'second' }])
  assert.equal(pr.chapterStartingAt(two, Date.UTC(2020, 0, 1), 'day').chapter.title, 'second'); assert.equal(pr.chapterInEffect(two, Date.UTC(2020, 0, 1), 'day').chapter.title, 'second')
})

test('transitions, per chapter hold, banner image and index', () => {
  assert.deepEqual(pr.chapterGoToOptions({ date: '2020' }, 1500), { duration: 1500, animate: true })
  assert.deepEqual(pr.chapterGoToOptions({ date: '2020', transition: 'jump' }, 1500), { duration: 0, animate: false })
  assert.deepEqual(pr.chapterGoToOptions({ date: '2020' }, 0), { duration: 0, animate: false })
  assert.equal(pr.chapterHold({ date: '2020', holdMs: 900 }, 4000), 900)
  assert.equal(pr.chapterHold({ date: '2020' }, 4000), 4000)
  assert.equal(pr.chapterHold(null, NaN), 4000)
  const cs = pr.sortedChapters([{ date: '2019', title: 'A', image: 'https://x/y.jpg' }, { date: '2021', title: 'B', image: 'http://plain/no.jpg' }])
  const D = (y) => Date.UTC(y, 0, 1)
  const m1 = pr.bannerModel({ chapters: cs, start: D(2018), end: D(2022), ms: D(2019), g: 'year', chapterLabel: (i, n) => `${i}/${n}` })
  assert.equal(m1.index, 0); assert.equal(m1.image, 'https://x/y.jpg')
  const m2 = pr.bannerModel({ chapters: cs, start: D(2018), end: D(2022), ms: D(2021), g: 'year', chapterLabel: (i, n) => `${i}/${n}` })
  assert.equal(m2.index, 1); assert.equal(m2.image, '')
  const m0 = pr.bannerModel({ chapters: cs, start: D(2018), end: D(2022), ms: D(2018), g: 'year', chapterLabel: (i, n) => `${i}/${n}` })
  assert.equal(m0.index, -1)
})

test('url date codec and query helpers', () => {
  assert.deepEqual(tm.parseUrlDate('2019-06-01'), { mode: 'single', a: D('2019-06-01'), b: D('2019-06-01') })
  assert.deepEqual(tm.parseUrlDate('2019..2020-02'), { mode: 'range', a: D('2019-01-01'), b: D('2020-02-01') })
  assert.deepEqual(tm.parseUrlDate('2019-06-01~2023-06-01').mode, 'compare')
  assert.equal(tm.parseUrlDate('junk'), null); assert.equal(tm.parseUrlDate(''), null); assert.equal(tm.parseUrlDate('2019..bad'), null)
  assert.equal(tm.formatUrlDate('range', D('2019-01-01'), D('2020-02-01')), '2019-01-01..2020-02-01')
  assert.equal(tm.withUrlParam('https://x/app/?a=1&tm=old#p1', 'tm', '2019-01-01'), 'https://x/app/?a=1&tm=2019-01-01#p1')
  assert.equal(tm.withUrlParam('https://x/app/', 'tm', '2019'), 'https://x/app/?tm=2019')
  assert.equal(tm.withUrlParam('https://x/app/?tm=1', 'tm', null), 'https://x/app/')
  assert.equal(tm.readUrlParam('?a=1&tm=2019-06-01%7E2020', 'tm'), '2019-06-01~2020')
  assert.equal(tm.readUrlParam('?a=1', 'tm'), null)
})

test('readDateFromRecord: named field, first date-looking value, span end', () => {
  const rec = { attributes: { OBJECTID: 12, NAME: 'x', ISSUE_DATE: 1560000000000, EXPIRE_DATE: '2021-03-01', SCORE: 4.5 } }
  assert.deepEqual(tm.readDateFromRecord(rec, 'expire_date'), { start: D('2021-03-01'), end: NaN })
  const r = tm.readDateFromRecord(rec, null)
  assert.equal(r.start, 1560000000000); assert.equal(r.end, D('2021-03-01'))
  assert.ok(Number.isNaN(tm.readDateFromRecord({ attributes: { A: 1, B: 'hello' } }, null).start))
  assert.equal(tm.readDateFromRecord({ attributes: { value: '2019' } }, null).start, D('2019-01-01'))
})
