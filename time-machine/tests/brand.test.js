// Run: node tests/transpile.js && node --test tests/
// Presentation branding: color cleaning, contrast, fonts, resolve over the theme.
const test = require('node:test')
const assert = require('node:assert/strict')
const b = require('./build/runtime/lib/brand.js')

const tokens = { surface: '#fff', background: '#f4f4f4', text: '#1f1f1f', textSecondary: '#6b6b6b', primary: '#0079c1', primaryText: '#ffffff', radiusLg: '8px' }

test('cleanColor accepts hex, rgb, hsl and names; rejects junk', () => {
  assert.equal(b.cleanColor('#ABC'), '#abc'); assert.equal(b.cleanColor(' #112233 '), '#112233')
  assert.equal(b.cleanColor('rgb(1, 2, 3)'), 'rgb(1, 2, 3)'); assert.equal(b.cleanColor('hsl(200 50% 40%)'), 'hsl(200 50% 40%)')
  assert.equal(b.cleanColor('Navy'), 'navy')
  assert.equal(b.cleanColor('url(x)'), ''); assert.equal(b.cleanColor('#12'), ''); assert.equal(b.cleanColor('red; background: url(x)'), ''); assert.equal(b.cleanColor(null), '')
})

test('luminance, contrast text and ratio', () => {
  assert.equal(b.contrastText('#ffffff'), '#000000'); assert.equal(b.contrastText('#000'), '#ffffff'); assert.equal(b.contrastText('#0079c1'), '#ffffff'); assert.equal(b.contrastText('rgb(1,2,3)'), '#ffffff')
  assert.equal(b.contrastRatio('#ffffff', '#000000'), 21); assert.ok(b.contrastRatio('#ffffff', '#767676') >= 4.5); assert.equal(b.contrastRatio('#fff', 'navy'), null)
})

test('font stacks: choices, typed names, junk', () => {
  assert.equal(b.fontStack('georgia'), 'Georgia, "Times New Roman", serif'); assert.equal(b.fontStack('system'), ''); assert.equal(b.fontStack(''), '')
  assert.equal(b.fontStack('Source Sans Pro, sans-serif'), 'Source Sans Pro, sans-serif')
  assert.equal(b.fontStack('x</style><script>'), '')
})

test('resolveBrand falls back to the theme and marks custom', () => {
  const plain = b.resolveBrand({}, tokens)
  assert.equal(plain.background, '#fff'); assert.equal(plain.accent, '#0079c1'); assert.equal(plain.accentText, '#ffffff'); assert.equal(plain.font, ''); assert.equal(plain.dateSize, 30); assert.equal(plain.radius, 8); assert.equal(plain.logo, ''); assert.equal(plain.custom, false)
  const custom = b.resolveBrand({ brandBackground: '#003366', brandText: '#fff', brandAccent: '#ffcc00', brandFont: 'georgia', brandDateSize: 200, brandRadius: 0, brandLogo: 'https://x/logo.png', brandLogoHeight: 500 }, tokens)
  assert.equal(custom.background, '#003366'); assert.equal(custom.accentText, '#000000'); assert.equal(custom.dateSize, 96); assert.equal(custom.radius, 0); assert.equal(custom.logo, 'https://x/logo.png'); assert.equal(custom.logoHeight, 120); assert.equal(custom.custom, true)
  assert.equal(b.resolveBrand({ brandLogo: 'http://x/logo.png' }, tokens).logo, '')
  assert.equal(b.resolveBrand({ brandLogo: 'javascript:alert(1)' }, tokens).logo, '')
  const t2 = b.brandTokens(tokens, custom)
  assert.equal(t2.surface, '#003366'); assert.equal(t2.primary, '#ffcc00'); assert.equal(t2.primaryText, '#000000'); assert.equal(t2.radiusLg, '0px'); assert.equal(t2.divider, undefined)
})

test('audit: contrast threshold, keyword colors, unbalanced quotes', () => {
  assert.equal(b.contrastText('#4caf50'), '#000000'); assert.equal(b.contrastText('#0079c1'), '#ffffff')
  assert.equal(b.cleanColor('transparent'), ''); assert.equal(b.cleanColor('inherit'), ''); assert.equal(b.cleanColor('teal'), 'teal')
  assert.equal(b.fontStack('"Segoe'), ''); assert.equal(b.fontStack('"Segoe UI", sans-serif'), '"Segoe UI", sans-serif')
})
