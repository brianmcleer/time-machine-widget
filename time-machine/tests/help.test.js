// Run: node tests/transpile.js && node --test tests/
// Help guide content rules (handoff Section 10.8 and 10.9).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { buildHelpSections } = require('./build/runtime/helpSections.js')
const messages = require('./build/runtime/translations/default.js').default

const t = (id, values) => {
  assert.ok(id in messages, `missing translation ${id}`)
  let s = String(messages[id])
  if (values) for (const k of Object.keys(values)) s = s.split(`{${k}}`).join(values[k])
  return s
}
const FLAGS = ['range', 'compare', 'play', 'dateInputs', 'layerList', 'yearSets', 'sublayers', 'restoreOnClose', 'counts', 'shareLink', 'messageAction', 'rememberDate', 'present', 'chapters', 'chapterJump', 'loop', 'activity', 'step', 'grid', 'spotlight', 'presenter', 'story', 'deck', 'stage', 'pace', 'video', 'highlight', 'cleanStage', 'stamp', 'client']
const ALL_ON = Object.fromEntries(FLAGS.map(k => [k, true]))
const ALL_OFF = Object.fromEntries(FLAGS.map(k => [k, false]))
const flat = (secs) => secs.map(s => [s.title, s.intro || '', ...s.body].join('\n')).join('\n')

test('every string resolves and no token is left unfilled', () => {
  const text = flat(buildHelpSections(t, ALL_ON))
  assert.ok(!/\{\w+\}/.test(text), 'unfilled token')
  assert.ok(!/\bhelp[A-Z]\w+/.test(text), 'raw key leaked')
})

test('section order, unique keys, distinct icons, only start is ordered', () => {
  const secs = buildHelpSections(t, ALL_ON)
  assert.deepEqual(secs.map(s => s.key), ['start', 'modes', 'play', 'layers', 'present', 'stage', 'story', 'export', 'share', 'keep', 'trouble', 'tips'])
  assert.equal(new Set(secs.map(s => s.icon)).size, secs.length)
  assert.deepEqual(secs.filter(s => s.ordered).map(s => s.key), ['start'])
  assert.equal(secs[0].body.length, 3)
  assert.deepEqual(buildHelpSections(t, ALL_OFF).map(s => s.key), ['start', 'keep', 'trouble', 'tips'])
})

test('feature gating in both directions, one flag at a time', () => {
  const offText = flat(buildHelpSections(t, ALL_OFF))
  for (const word of ['Compare', 'Range', 'Play', 'Snapshots', 'divider', 'type a date', 'Present', 'Copy link', 'Chapters', 'remembered', 'how many', 'Next change', 'Step by', 'Spotlight', 'Draw on the map', 'Presenter window', 'Web slideshow', 'WebM', 'glow', 'date stamp', 'zoom buttons and compass']) assert.ok(!offText.includes(word), `${word} present with flags off`)
  const cases = [
    ['range', 'Range:'], ['compare', 'Compare:'], ['play', 'Press Play'], ['yearSets', 'Snapshots by year'], ['dateInputs', 'type a date'], ['counts', 'how many'],
    ['shareLink', 'Copy link'], ['messageAction', 'selecting a record'], ['rememberDate', 'remembered'], ['present', 'Press Present'], ['activity', 'Next change'], ['step', 'Step by Day']
  ]
  for (const [flag, word] of cases) {
    const on = flat(buildHelpSections(t, { ...ALL_OFF, layerList: true, [flag]: true }))
    assert.ok(on.includes(word), `${word} missing with ${flag} on`)
  }
  // things that live inside present
  const P = { ...ALL_OFF, present: true }
  for (const [flag, word] of [['spotlight', 'Spotlight, or L'], ['stage', 'Draw on the map, or D'], ['presenter', 'Presenter window, or W'], ['cleanStage', 'zoom buttons and compass']]) {
    assert.ok(flat(buildHelpSections(t, { ...P, [flag]: true })).includes(word), `${word} missing`)
    assert.ok(!flat(buildHelpSections(t, { ...ALL_ON, [flag]: false })).includes(word), `${word} present with ${flag} off`)
  }
  // black screen and read aloud are always there once presenting exists
  const pOnly = flat(buildHelpSections(t, P))
  assert.ok(pOnly.includes('Black screen, or B') && pOnly.includes('V reads the chapter'))
  // compound gates
  assert.ok(!flat(buildHelpSections(t, { ...P, grid: true })).includes('Chapter grid'), 'grid needs chapters')
  assert.ok(flat(buildHelpSections(t, { ...P, grid: true, story: true })).includes('Chapter grid'))
  assert.ok(!flat(buildHelpSections(t, { ...P, deck: true })).includes('Web slideshow'), 'deck needs story')
  assert.ok(flat(buildHelpSections(t, { ...P, deck: true, story: true })).includes('Web slideshow'))
  assert.ok(!flat(buildHelpSections(t, { ...P, deck: true, story: true, video: true, activity: false })).includes('Generate chapters'), 'auto needs activity')
  assert.ok(!flat(buildHelpSections(t, { ...P, story: true, video: true })).includes('WebM'), 'video needs deck')
  assert.ok(flat(buildHelpSections(t, { ...P, story: true, deck: true, video: true })).includes('WebM'))
  assert.ok(!flat(buildHelpSections(t, { ...P, presenter: true })).includes('planned length'), 'pace needs presentMinutes')
  assert.ok(flat(buildHelpSections(t, { ...P, presenter: true, pace: true })).includes('planned length'))
  assert.ok(flat(buildHelpSections(t, { ...ALL_ON, sublayers: false })).indexOf('map service') < 0)
  assert.ok(flat(buildHelpSections(t, { ...ALL_ON, chapters: false, story: false })).indexOf('Chapters are') < 0)
  assert.ok(flat(buildHelpSections(t, { ...ALL_ON, chapters: false })).includes('Chapters are'))
  assert.ok(flat(buildHelpSections(t, { ...ALL_ON, chapterJump: false })).indexOf('chapter to chapter') < 0)
  assert.ok(flat(buildHelpSections(t, ALL_ON)).includes('chapter to chapter'))
  assert.ok(flat(buildHelpSections(t, { ...ALL_ON, loop: false })).indexOf('starts over') < 0)
  assert.ok(flat(buildHelpSections(t, { ...ALL_ON, restoreOnClose: false })).includes('leaves the date in place'))
  assert.ok(flat(buildHelpSections(t, ALL_ON)).includes('puts every layer back'))
  assert.ok(flat(buildHelpSections(t, { ...ALL_ON, highlight: false, stamp: true })).includes('date stamp'))
  assert.ok(!flat(buildHelpSections(t, { ...ALL_ON, highlight: true, stamp: false })).includes('date stamp'))
  assert.ok(flat(buildHelpSections(t, ALL_ON)).includes('2999'))
  assert.ok(flat(buildHelpSections(t, { ...P, presenter: true })).includes('blocked a pop up'))
  assert.ok(!flat(buildHelpSections(t, P)).includes('blocked a pop up'))
})

test('writing rules: no dashes, no jargon, troubleshooting shape, contact line last', () => {
  const secs = buildHelpSections(t, ALL_ON)
  const text = flat(secs)
  assert.ok(!/[–—]/.test(text), 'em or en dash in guide')
  for (const word of ['instance', 'session', 'persist', 'sync', 'toggle', 'modal']) assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(text), `jargon: ${word}`)
  const trouble = secs.find(s => s.key === 'trouble')
  const lines = trouble.body
  assert.equal(lines[lines.length - 1], 'Still stuck? Contact the GIS Division and mention the Time Machine name and this app.')
  for (const l of lines.slice(0, -1)) { assert.ok(l.includes(':'), `no colon: ${l}`); assert.ok(/\.$/.test(l), `no full stop: ${l}`) }
  assert.equal(messages.helpTitle, 'Help')
  assert.equal(messages.close, 'Close')
  assert.match(messages.helpSearchPlaceholder, /^Search the guide \(try ".+" or ".+"\)$/)
  assert.equal(messages.firstRunTitle, 'New here?')
  assert.equal(messages.firstRunHelpLink, 'Open the guide.')
  assert.equal(messages.firstRunBody.split('. ').length, 1)
  // settings hints follow the same rules
  const settings = require('./build/setting/translations/default.js').default
  for (const k of Object.keys(settings)) {
    const v = String(settings[k])
    assert.ok(!/[–—]/.test(v), `dash in setting ${k}`)
    for (const word of ['instance', 'session', 'persist', 'sync', 'toggle', 'toggles', 'modal']) assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(v), `jargon in setting ${k}: ${word}`)
    if (k.endsWith('Hint')) assert.ok(v.split(/\. /).length <= 3, `hint too long: ${k}`)
  }
})

test('control names in the guide match the translations exactly', () => {
  const text = flat(buildHelpSections(t, ALL_ON))
  for (const key of ['today', 'play', 'pause', 'speed', 'allOn', 'allOff', 'modeSingle', 'modeRange', 'modeCompare', 'present', 'presentExit', 'copyLink',
    'nextChange', 'prevChange', 'stepDay', 'stepMonth', 'stepYear', 'reset', 'resetRange', 'toStart', 'toEnd', 'stepBack', 'stepForward', 'advanced', 'loopPlay', 'layerFilter',
    'presentGrid', 'presentSpotlight', 'presentPresenter', 'presentInk', 'presentBlackout', 'presentFullscreen', 'storyAdd', 'storySetDate', 'storyGo', 'storyUp', 'storyDown', 'storyRemove', 'storyCopy', 'storyDownload', 'storyClear',
    'autoGo', 'autoBusiest', 'autoEvery', 'deckHtml', 'deckCancel', 'video', 'storyHidden', 'storyRehearsed', 'presentClearInk']) {
    assert.ok(text.includes(messages[key]), `control ${messages[key]} (${key}) not in guide`)
  }
  assert.ok(text.includes(messages.layersSkipped.replace(' ({n})', '')), 'skipped list name not in guide')
  assert.equal(messages.modeSingle, require('./build/setting/translations/default.js').default.modeSingle)
})

test('search finds the words a user would type', () => {
  const text = flat(buildHelpSections(t, ALL_ON)).toLowerCase()
  for (const w of ['play', 'compare', 'slider', 'today', 'divider', 'year', 'slow', 'slideshow', 'video', 'draw', 'notes']) assert.ok(text.includes(w), w)
})

test('theme.ts and HelpPopup.tsx are byte copies of the reference widget', () => {
  const ref = '/home/claude/w/print-advanced/src/runtime'
  if (!fs.existsSync(ref)) return
  for (const f of ['theme.ts', 'components/HelpPopup.tsx']) {
    assert.equal(fs.readFileSync(path.join(__dirname, '..', 'src', 'runtime', f), 'utf8'), fs.readFileSync(path.join(ref, f), 'utf8'), f)
  }
})

test('no hex color and no inline svg in the guide or the widget markup', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'runtime', 'widget.tsx'), 'utf8')
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'hex color in widget.tsx')
  assert.ok(!/<svg/.test(src))
  assert.ok(!/(info|primary|warning|success|error)-light/.test(src.replace(/\/\/.*$/gm, '')), 'a *-light theme variable in widget.tsx')
})

test('every widget translation key referenced in widget.tsx exists', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'runtime', 'widget.tsx'), 'utf8')
  const used = new Set([...src.matchAll(/\bt\('([A-Za-z_]+)'/g)].map(m => m[1]))
  for (const k of used) assert.ok(k in messages, `missing key ${k}`)
  for (const k of ['speedSlowest', 'speedSlow', 'speedNormal', 'speedFast', 'speedFastest']) assert.ok(k in messages)
})
