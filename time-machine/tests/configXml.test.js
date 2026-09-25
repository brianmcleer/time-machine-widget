// Run: node tests/transpile.js && node --test tests/
const test = require('node:test')
const assert = require('node:assert/strict')
const { configToXml, xmlToConfig, XML_ROOT } = require('./build/configXml.js')

test('config round-trips through XML with types intact', () => {
  const cfg = { granularity: 'month', startDate: '2015-01-01', endDate: '', playIntervalMs: 600, allowCompare: false, preferredFields: ['a', 'b_c'], rules: [{ layerId: 'x::3', title: "O'Brien <Test> & Co", mode: 'span', startField: 'S', endField: 'E' }], yearSets: [{ groupLayerId: '', title: 'Aerials' }], showHelp: true, chapters: [{ date: '2020-06', title: 'Flood', text: 'The river rose.', lon: -108.5, lat: 39.1, scale: 24000, rotation: 15, transition: 'jump', holdMs: 2500, notes: 'Say hi', layersOn: ['a', 'b'], layersOff: ['c'], basemap: 'satellite', featureLayerId: 'permits', featureWhere: 'ID = 1', image: 'https://x/y.jpg', motion: 'zoomIn' }, { date: '2015', title: 'Start', text: '' }], chapterHoldMs: 3000, presentLoop: true, minYear: 1600, maxYear: 2100, presentMinutes: 20, narrate: true, chapterMotion: 'zoomOut', brandBackground: '#003366', brandDateSize: 40, brandRadius: 0, brandLogo: 'https://x/l.png', stampPosition: 'bottom-right' }
  const xml = configToXml(cfg)
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<' + XML_ROOT + ' version="1" t="o">'))
  assert.deepEqual(xmlToConfig(xml), cfg)
})

test('hand-edited strings are coerced and junk is dropped', () => {
  const xml = `<${XML_ROOT} t="o"><allowRange t="s">false</allowRange><playIntervalMs t="s">900</playIntervalMs><preferredFields t="s">a, b\nc</preferredFields><rules t="s">bad</rules><yearSets t="a"><item t="o"><groupLayerId t="s">g1</groupLayerId></item><item t="s">junk</item></yearSets></${XML_ROOT}>`
  const c = xmlToConfig(xml)
  assert.equal(c.allowRange, false)
  assert.equal(c.playIntervalMs, 900)
  assert.deepEqual(c.preferredFields, ['a', 'b', 'c'])
  assert.equal('rules' in c, false)
  assert.deepEqual(c.yearSets, [{ groupLayerId: 'g1', title: '' }])
  const c2 = xmlToConfig(`<${XML_ROOT} t="o"><chapters t="a"><item t="o"><date t="s">2020</date><lon t="s">-108.5</lon><lat t="s">x</lat></item></chapters><chapterHoldMs t="s">2500</chapterHoldMs></${XML_ROOT}>`)
  assert.deepEqual(c2.chapters, [{ date: '2020', title: '', text: '', lon: -108.5 }])
  assert.equal(c2.chapterHoldMs, 2500)
  const c3 = xmlToConfig(`<${XML_ROOT} t="o"><minYear t="s">1700</minYear><maxYear t="s">x</maxYear></${XML_ROOT}>`)
  assert.equal(c3.minYear, 1700); assert.equal(c3.maxYear, undefined)
  const c4 = xmlToConfig(`<${XML_ROOT} t="o"><chapters t="a"><item t="o"><date t="s">2020</date><layersOn t="s">a, b;c</layersOn><transition t="s">spin</transition><notes t="s"> </notes></item></chapters></${XML_ROOT}>`)
  assert.deepEqual(c4.chapters, [{ date: '2020', title: '', text: '', layersOn: ['a', 'b', 'c'] }])
})

test('wrong root and malformed XML are refused', () => {
  assert.throws(() => xmlToConfig('<PrintAdvancedConfig t="o"/>'), /ROOT/)
  assert.throws(() => xmlToConfig('<TimeMachineConfig t="o"><a t="s">x</b></TimeMachineConfig>'))
  assert.throws(() => xmlToConfig('not xml'))
})
