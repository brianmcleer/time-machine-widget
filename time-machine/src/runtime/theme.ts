import { useTheme } from 'jimu-theme'

/**
 * Design tokens for the widget, read from the Experience's theme so the widget follows the
 * app's colors and light/dark mode. Every token has a fallback in case a theme lacks a value.
 *
 * Structure follows jimu-theme's `theme.sys` (Experience Builder 1.13+). Reads are defensive
 * because theme shape has shifted between releases.
 */
export interface Tokens {
  primary: string
  primaryText: string
  surface: string
  background: string
  text: string
  textSecondary: string
  divider: string
  danger: string
  warning: string
  warningBg: string
  info: string
  infoBg: string
  radius: string
  radiusLg: string
  shadow: string
  shadowHover: string
}

/**
 * A faint tint of `color` over `base`. Used for banner and highlight backgrounds so text keeps
 * its contrast whatever the theme's accent colors are: a theme's "light" variants are not
 * reliably light (some Experience themes define info.light as a saturated blue). color-mix is
 * supported by every browser Experience Builder 1.21 supports; the fallback is a plain
 * translucent overlay for anything older.
 */
function tint (color: string, percent: number, base: string): string {
  if (typeof CSS !== 'undefined' && typeof (CSS as any).supports === 'function' && (CSS as any).supports('color', 'color-mix(in srgb, red 10%, white)')) {
    return `color-mix(in srgb, ${color} ${percent}%, ${base})`
  }
  return base
}

export function useTokens (): Tokens {
  const theme: any = useTheme()
  const sys = theme?.sys ?? {}
  const color = sys.color ?? {}
  const primary: string = color.primary?.main ?? '#0079c1'
  const surface: string = color.surface?.paper ?? '#ffffff'
  const warning: string = color.warning?.main ?? '#8a6100'
  const info: string = color.info?.main ?? primary
  return {
    primary,
    primaryText: color.primary?.text ?? '#ffffff',
    surface,
    background: color.surface?.background ?? '#f7f8fa',
    text: color.surface?.paperText ?? '#1b1f24',
    textSecondary: color.surface?.paperHint ?? '#5a6572',
    divider: color.divider?.secondary ?? color.divider?.primary ?? '#e1e5e9',
    danger: color.error?.main ?? '#d64545',
    warning,
    warningBg: tint(warning, 14, surface),
    info,
    infoBg: tint(primary, 10, surface),
    radius: sys.shape?.shape1 ?? '4px',
    radiusLg: sys.shape?.shape2 ?? '8px',
    shadow: sys.shadow?.shadow1 ?? '0 1px 3px rgba(0,0,0,0.10)',
    shadowHover: sys.shadow?.shadow2 ?? '0 6px 16px rgba(0,0,0,0.14)'
  }
}
