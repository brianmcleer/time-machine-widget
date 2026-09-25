/**
 * Time Machine - presentation branding.
 *
 * The builder can give the banner, the presenter window, the web slideshow and the
 * video their own colors, font, date size, corner radius and logo. Anything left empty
 * falls back to the app theme (the tokens). Pure: config in, a Brand out.
 */
import type { Tokens } from '../theme'

export interface BrandConfig {
  brandBackground?: string
  brandText?: string
  brandMuted?: string
  brandAccent?: string
  brandFont?: string
  brandDateSize?: number
  brandRadius?: number
  brandLogo?: string
  brandLogoHeight?: number
}

export interface Brand {
  background: string
  text: string
  muted: string
  accent: string
  /** Text that sits on the accent color: black or white by contrast. */
  accentText: string
  /** CSS font-family stack. */
  font: string
  /** Banner date size in px. */
  dateSize: number
  /** Card corner radius in px. */
  radius: number
  /** https URL of a logo, or empty. */
  logo: string
  logoHeight: number
  /** True when any color, font, logo or size came from the builder rather than the theme. */
  custom: boolean
}

export const FONT_CHOICES: Array<{ key: string, label: string, stack: string }> = [
  { key: 'system', label: 'App font', stack: '' },
  { key: 'arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { key: 'segoe', label: 'Segoe UI', stack: '"Segoe UI", Tahoma, sans-serif' },
  { key: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { key: 'trebuchet', label: 'Trebuchet MS', stack: '"Trebuchet MS", Helvetica, sans-serif' },
  { key: 'georgia', label: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
  { key: 'times', label: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { key: 'mono', label: 'Monospace', stack: 'Consolas, "Courier New", monospace' }
]

/** A CSS color the browser will accept: hex, rgb(), hsl() or a named color; nothing else. */
export function cleanColor (v: string | undefined | null): string {
  const s = String(v == null ? '' : v).trim()
  if (!s) return ''
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s.toLowerCase()
  if (/^(rgb|hsl)a?\(\s*[\d.%]+\s*,?\s*[\d.%]+\s*,?\s*[\d.%]+\s*(,?\s*[\d.%]+\s*)?\)$/i.test(s)) return s
  if (/^[a-z]{3,20}$/i.test(s) && !/^(transparent|inherit|initial|unset|revert|currentcolor|none)$/i.test(s)) return s.toLowerCase()
  return ''
}

/** Relative luminance of a hex color, 0 dark to 1 light; null when not hex. */
export function luminance (hex: string): number | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex || '').trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const ch = (i: number): number => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4)
}

/** Black or white, whichever reads on the color. Non hex colors get white. */
export function contrastText (color: string): string {
  const l = luminance(color)
  if (l === null) return '#ffffff'
  // break even between black and white text is a luminance near 0.18
  return l > 0.179 ? '#000000' : '#ffffff'
}

/** WCAG contrast ratio between two hex colors, or null when either is not hex. */
export function contrastRatio (a: string, b: string): number | null {
  const la = luminance(a); const lb = luminance(b)
  if (la === null || lb === null) return null
  const hi = Math.max(la, lb); const lo = Math.min(la, lb)
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}

/** The font stack for a choice key, or a custom family typed by the builder. */
export function fontStack (v: string | undefined): string {
  const s = String(v || '').trim()
  if (!s || s === 'system') return ''
  const hit = FONT_CHOICES.find(f => f.key === s)
  if (hit) return hit.stack
  // a typed family name: letters, digits, spaces, quotes and commas only
  const balanced = s.split('"').length % 2 === 1 && s.split("'").length % 2 === 1
  return /^[A-Za-z0-9 ,"'\-]{1,80}$/.test(s) && balanced ? s : ''
}

export function resolveBrand (cfg: BrandConfig, tokens: Tokens): Brand {
  const background = cleanColor(cfg.brandBackground) || tokens.surface
  const text = cleanColor(cfg.brandText) || tokens.text
  const muted = cleanColor(cfg.brandMuted) || tokens.textSecondary
  const accent = cleanColor(cfg.brandAccent) || tokens.primary
  const accentText = cleanColor(cfg.brandAccent) ? contrastText(accent) : tokens.primaryText
  const font = fontStack(cfg.brandFont)
  const dateSize = isFinite(Number(cfg.brandDateSize)) && Number(cfg.brandDateSize) >= 14 ? Math.min(96, Math.round(Number(cfg.brandDateSize))) : 30
  const radius = isFinite(Number(cfg.brandRadius)) && Number(cfg.brandRadius) >= 0 ? Math.min(40, Math.round(Number(cfg.brandRadius))) : -1
  const logo = /^https:\/\/\S+$/i.test(String(cfg.brandLogo || '').trim()) ? String(cfg.brandLogo).trim() : ''
  const logoHeight = isFinite(Number(cfg.brandLogoHeight)) && Number(cfg.brandLogoHeight) >= 12 ? Math.min(120, Math.round(Number(cfg.brandLogoHeight))) : 32
  const custom = !!(cleanColor(cfg.brandBackground) || cleanColor(cfg.brandText) || cleanColor(cfg.brandMuted) || cleanColor(cfg.brandAccent) || font || logo || radius >= 0 || dateSize !== 30)
  return { background, text, muted, accent, accentText, font, dateSize, radius: radius >= 0 ? radius : parseInt(String(tokens.radiusLg), 10) || 8, logo, logoHeight, custom }
}

/** Tokens with the brand laid over them, for the banner and the presenter window. */
export function brandTokens (tokens: Tokens, b: Brand): Tokens {
  return { ...tokens, surface: b.background, background: b.background, text: b.text, textSecondary: b.muted, primary: b.accent, primaryText: b.accentText, radiusLg: `${b.radius}px` }
}
