// Run: node tests/transpile.js && node --test tests/
// Slide decks: the web slideshow and auto chapters.
const test = require('node:test')
const assert = require('node:assert/strict')
const d = require('./build/runtime/lib/deck.js')

const png1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const model = () => ({
  title: 'Annexations', subtitle: '1882 to 2026', credit: 'GIS Division, City of Grand Junction',
  colors: { background: '#ffffff', text: '#1f1f1f', muted: 'rgb(107, 107, 107)', accent: '#2e6fd8', surface: '#f2f2f2' },
  slides: [
    { index: 0, date: '1882', title: 'The town', text: 'First plat & "square".', notes: 'Say <hello>', image: png1x1, caption: '3 features' },
    { index: 1, date: '1950', title: '', text: '', notes: '', image: '' }
  ]
})

test('web slideshow is self contained and escapes text', () => {
  const html = d.htmlDeck(model())
  assert.ok(html.startsWith('<!doctype html>'))
  assert.ok(html.includes('First plat &amp; &quot;square&quot;.'))
  assert.ok(html.includes('Say &lt;hello&gt;'))
  assert.ok(html.includes(png1x1))
  assert.equal((html.match(/class="slide/g) || []).length, 3)
  assert.ok(!/https?:\/\//.test(html.replace(/xmlns[^"]*"[^"]*"/g, '')), 'no external references')
})

test('auto chapters: busiest N and every N buckets', () => {
  const bars = [{ key: '1880', from: 0, to: 10, n: 2 }, { key: '1890', from: 10, to: 20, n: 0 }, { key: '1900', from: 20, to: 30, n: 9 }, { key: '1910', from: 30, to: 40, n: 5 }, { key: '1920', from: 40, to: 50, n: 9 }]
  assert.deepEqual(d.autoChapterKeys(bars, 'busiest', 2).map(b => b.key), ['1900', '1920'])
  assert.deepEqual(d.autoChapterKeys(bars, 'every', 2).map(b => [b.key, b.n, b.from, b.to]), [['1880 to 1890', 2, 0, 20], ['1900 to 1910', 14, 20, 40], ['1920', 9, 40, 50]])
  assert.deepEqual(d.autoChapterKeys([], 'busiest', 3), [])
})
