/**
 * Time Machine - the presentation banner on the map.
 *
 * A plain DOM card added through view.ui so it sits over the map and survives the
 * widget panel being collapsed. Built without React on purpose: view.ui takes a DOM
 * node, and a portal into a node the SDK owns is fragile across re-renders.
 *
 * Colors come from the theme tokens the widget passes in (handoff 11.2). The wrapper
 * lets map events through; only the card itself takes pointer events (12.10).
 */
import type { Tokens } from '../theme'
import type { BannerModel } from './presentation'

export interface BannerStrings {
  play: string
  pause: string
  prev: string
  next: string
  exit: string
  fullscreen: string
  grid: string
  spotlight: string
  presenter: string
  gridTitle: string
  ink: string
  blackout: string
  nextIn: string
  regionLabel: string
  back: string
  step: string
  clearInk: string
  speed: string
  progress: string
}

export interface BannerHandlers {
  onToggle: () => void
  onPrev: () => void
  onNext: () => void
  onExit: () => void
  onFullscreen: () => void
  onGoto: (index: number) => void
  onSpotlight: () => void
  onPresenter: () => void
  onInk: () => void
  onBlackout: () => void
  onBack: () => void
  onStep: () => void
  onClearInk: () => void
  onSpeed: () => void
}

export interface BannerOptions {
  showProgress: boolean
  grid: boolean
  spotlight: boolean
  presenter: boolean
  ink: boolean
  /** CSS font-family for the card; empty inherits the app font. */
  font?: string
  dateSize?: number
  logo?: string
  logoHeight?: number
  logoAlt?: string
}

export interface BannerChapter { index: number, date: string, title: string }

export interface Banner {
  el: HTMLElement
  update: (m: BannerModel, playing: boolean) => void
  setTokens: (t: Tokens) => void
  /** The chapter tiles for the grid; thumbnails arrive later through setThumb. */
  setChapters: (list: BannerChapter[]) => void
  setThumb: (index: number, dataUrl: string) => void
  toggleGrid: () => boolean
  isGridOpen: () => boolean
  setSpotlight: (on: boolean) => void
  setInk: (on: boolean) => void
  setFullscreen: (on: boolean) => void
  /** The play speed label shown on the speed button. */
  setSpeed: (label: string) => void
  /** Puts keyboard focus on the banner's first control. */
  focus: () => void
  /** The activity bars as a thin strip under the progress bar. */
  setBars: (bars: Array<{ from: number, to: number, n: number }>, count: number) => void
  /** Seconds until play moves on, or null to hide. */
  setCountdown: (sec: number | null) => void
  destroy: () => void
}

const ICONS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  prev: 'M6 6h2v12H6zm3.5 6 8.5 6V6z',
  next: 'M16 6h2v12h-2zM6 18l8.5-6L6 6z',
  exit: 'M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z',
  fullscreen: 'M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z',
  grid: 'M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z',
  spotlight: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  presenter: 'M3 4h18v12H3zm2 2v8h14V6zm3 12h8v2H8z',
  ink: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z',
  blackout: 'M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.4 5.4 0 0 1-4.4 2.26 5.4 5.4 0 0 1-3.14-9.8A9 9 0 0 0 12 3z',
  back: 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z',
  step: 'M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z',
  clear: 'M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 0 1-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0zM4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95z'
}

function svg (d: string): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="${d}"/></svg>`
}

export function createBanner (position: 'bottom' | 'top', tokens: Tokens, s: BannerStrings, h: BannerHandlers, o: BannerOptions): Banner {
  const showProgress = o.showProgress
  const wrap = document.createElement('div')
  wrap.className = 'tm-present'
  wrap.setAttribute('role', 'region')
  wrap.setAttribute('aria-label', s.regionLabel)
  const reduce = ((): boolean => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) } catch (e) { return false } })()
  wrap.style.cssText = `position:absolute;left:0;right:0;${position === 'top' ? 'top:16px' : 'bottom:28px'};display:flex;justify-content:center;pointer-events:none;z-index:5;`

  const card = document.createElement('div')
  card.className = 'tm-present-card'
  card.style.cssText = 'pointer-events:auto;min-width:min(300px,96%);max-width:min(680px,94%);padding:14px 18px 12px 18px;font-family:inherit;box-sizing:border-box;'
  if (o.font) card.style.fontFamily = o.font
  wrap.appendChild(card)

  const head = document.createElement('div')
  head.style.cssText = 'display:flex;align-items:baseline;gap:12px;justify-content:space-between;'
  const date = document.createElement('div'); date.className = 'tm-present-date'; date.style.cssText = `font-size:${o.dateSize || 30}px;font-weight:700;line-height:1.1;letter-spacing:0.5px;`
  const logo = document.createElement('img'); logo.alt = o.logoAlt || ''; logo.style.cssText = `display:none;height:${o.logoHeight || 32}px;max-width:160px;object-fit:contain;margin-left:12px;`
  if (o.logo) { logo.src = o.logo; logo.style.display = ''; logo.addEventListener('error', () => { logo.style.display = 'none' }) }
  const chap = document.createElement('div'); chap.className = 'tm-present-chapter'; chap.style.cssText = 'font-size:12px;white-space:nowrap;'
  // one quiet live region that speaks only when the chapter changes
  const live = document.createElement('div'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;'
  const focusStyle = document.createElement('style'); focusStyle.textContent = '.tm-present button:focus-visible{outline:2px solid currentColor;outline-offset:2px}'
  const right = document.createElement('div'); right.style.cssText = 'display:flex;align-items:center;gap:8px;'
  right.appendChild(chap); right.appendChild(logo)
  head.appendChild(date); head.appendChild(right)
  const body = document.createElement('div'); body.style.cssText = 'display:flex;gap:12px;align-items:flex-start;'
  const copy = document.createElement('div'); copy.style.cssText = 'flex:1;min-width:0;'
  const title = document.createElement('div'); title.style.cssText = 'font-size:17px;font-weight:600;margin-top:6px;line-height:1.3;'
  const text = document.createElement('div'); text.style.cssText = 'font-size:13px;margin-top:4px;line-height:1.5;max-height:6.2em;overflow:hidden;'
  const img = document.createElement('img'); img.alt = ''; img.style.cssText = 'display:none;max-width:200px;max-height:130px;border-radius:6px;margin-top:6px;object-fit:cover;flex:0 0 auto;'
  img.addEventListener('error', () => { img.style.display = 'none' })
  copy.appendChild(title); copy.appendChild(text); body.appendChild(copy); body.appendChild(img)
  // chapter grid: the tiled view, hidden until asked for
  const grid = document.createElement('div'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', s.gridTitle)
  grid.style.cssText = 'display:none;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin:10px 0 4px 0;max-height:260px;overflow:auto;'
  let gridOpen = false
  let tiles: HTMLButtonElement[] = []
  let currentIndex = -1
  const bar = document.createElement('div'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-label', s.progress); bar.style.cssText = `position:relative;height:6px;border-radius:3px;margin:12px 0 10px 0;overflow:visible;${showProgress ? '' : 'display:none;'}`
  const fill = document.createElement('div'); fill.style.cssText = 'position:absolute;left:0;top:0;bottom:0;border-radius:3px;width:0;transition:width 120ms linear;'
  const strip = document.createElement('div'); strip.style.cssText = 'position:relative;height:14px;margin:-6px 0 8px 0;display:none;'
  const countdown = document.createElement('div'); countdown.style.cssText = 'font-size:11px;margin:-4px 0 6px 0;display:none;'
  if (!reduce) { title.style.transition = 'opacity 250ms ease'; text.style.transition = 'opacity 250ms ease'; img.style.transition = 'opacity 250ms ease' }
  const marks = document.createElement('div'); marks.style.cssText = 'position:absolute;inset:0;'
  bar.appendChild(fill); bar.appendChild(marks)

  const ctl = document.createElement('div'); ctl.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;'
  const coarse = ((): boolean => { try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) } catch (e) { return false } })()
  const small = ((): boolean => { try { return window.innerWidth < 480 } catch (e) { return false } })()
  const mk = (name: keyof typeof ICONS, label: string, on: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'; b.title = label; b.setAttribute('aria-label', label)
    const sz = coarse ? 44 : 34
    b.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:${sz}px;height:${sz}px;border-radius:${sz / 2}px;border:1px solid transparent;background:transparent;cursor:pointer;color:inherit;`
    b.innerHTML = svg(ICONS[name])
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); on() })
    return b
  }
  const bBack = mk('back', s.back, h.onBack)
  const bStep = mk('step', s.step, h.onStep)
  const bClear = mk('clear', s.clearInk, h.onClearInk); bClear.style.display = 'none'
  // play speed: a text button that cycles slowest to fastest
  const bSpeed = document.createElement('button')
  bSpeed.type = 'button'; bSpeed.title = s.speed; bSpeed.setAttribute('aria-label', s.speed)
  bSpeed.style.cssText = `display:inline-flex;align-items:center;justify-content:center;min-width:${coarse ? 44 : 34}px;height:${coarse ? 44 : 34}px;padding:0 8px;border-radius:17px;border:1px solid currentColor;background:transparent;cursor:pointer;color:inherit;font:600 12px/1 inherit;white-space:nowrap;`
  bSpeed.textContent = '1x'
  bSpeed.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); h.onSpeed() })
  const bPrev = mk('prev', s.prev, h.onPrev)
  const bPlay = mk('play', s.play, h.onToggle)
  const bNext = mk('next', s.next, h.onNext)
  const bFull = mk('fullscreen', s.fullscreen, h.onFullscreen)
  const bExit = mk('exit', s.exit, h.onExit)
  const bGrid = mk('grid', s.grid, () => { toggleGrid() })
  bGrid.setAttribute('aria-expanded', 'false')
  const bSpot = mk('spotlight', s.spotlight, h.onSpotlight)
  const bPres = mk('presenter', s.presenter, h.onPresenter)
  const bInk = mk('ink', s.ink, h.onInk)
  const bBlack = mk('blackout', s.blackout, h.onBlackout)
  const spacer = document.createElement('span'); spacer.style.flex = '1'
  ctl.appendChild(bPrev); ctl.appendChild(bBack); ctl.appendChild(bPlay); ctl.appendChild(bStep); ctl.appendChild(bNext); ctl.appendChild(bSpeed); ctl.appendChild(spacer)
  if (o.ink) ctl.appendChild(bClear)
  if (o.grid) ctl.appendChild(bGrid)
  if (o.spotlight) ctl.appendChild(bSpot)
  if (o.ink && !small) ctl.appendChild(bInk)
  ctl.appendChild(bBlack)
  if (o.presenter && !small) ctl.appendChild(bPres)
  if (document.fullscreenEnabled !== false && typeof (document.documentElement as any).requestFullscreen === 'function') ctl.appendChild(bFull)
  ctl.appendChild(bExit)
  if (small && !o.dateSize) date.style.fontSize = '22px'
  card.style.maxHeight = '55%'; card.style.overflow = 'auto'

  card.appendChild(focusStyle); card.appendChild(head); card.appendChild(body); card.appendChild(grid); card.appendChild(bar); card.appendChild(strip); card.appendChild(countdown); card.appendChild(ctl); card.appendChild(live)

  const paintTiles = (): void => {
    tiles.forEach((b, i) => {
      const on = i === currentIndex
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current')
      b.style.borderColor = on ? cur.primary : cur.divider
      b.style.boxShadow = on ? `0 0 0 2px ${cur.primary}` : 'none'
    })
  }
  const toggleGrid = (): boolean => {
    gridOpen = !gridOpen
    grid.style.display = gridOpen ? 'grid' : 'none'
    bGrid.setAttribute('aria-expanded', gridOpen ? 'true' : 'false')
    if (gridOpen) { const t = tiles[currentIndex >= 0 ? currentIndex : 0]; if (t) t.focus() } else bGrid.focus()
    return gridOpen
  }
  const setChapters = (list: BannerChapter[]): void => {
    grid.innerHTML = ''
    tiles = list.map(c => {
      const b = document.createElement('button'); b.type = 'button'
      b.style.cssText = 'display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:6px;border-radius:6px;border:1px solid transparent;background:transparent;color:inherit;cursor:pointer;text-align:left;font:inherit;'
      const th = document.createElement('div'); th.className = 'tm-thumb'; th.style.cssText = 'height:70px;border-radius:4px;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;opacity:0.9;'
      th.textContent = String(c.index + 1)
      const d = document.createElement('div'); d.style.cssText = 'font-size:11px;'; d.textContent = c.date
      const tt = document.createElement('div'); tt.style.cssText = 'font-size:12px;font-weight:600;line-height:1.25;overflow:hidden;max-height:2.5em;'; tt.textContent = c.title || ''
      b.appendChild(th); b.appendChild(d); if (c.title) b.appendChild(tt)
      b.title = `${c.index + 1}. ${c.title || c.date}`
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); h.onGoto(c.index) })
      grid.appendChild(b)
      return b
    })
    tiles.forEach(b => { const th = b.firstChild as HTMLElement; th.style.background = cur.divider })
    paintTiles()
  }
  const setThumb = (index: number, dataUrl: string): void => {
    const b = tiles[index]; if (!b || !dataUrl) return
    const th = b.firstChild as HTMLElement
    th.style.backgroundImage = `url("${dataUrl}")`; th.textContent = ''
  }
  const setInk = (on: boolean): void => {
    bClear.style.display = on ? '' : 'none'
    bInk.setAttribute('aria-pressed', on ? 'true' : 'false')
    bInk.style.background = on ? cur.primary : 'transparent'
    bInk.style.color = on ? cur.primaryText : cur.primary
  }
  const setBars = (bars: Array<{ from: number, to: number, n: number }>, count: number): void => {
    strip.innerHTML = ''
    const live = bars.filter(b => b.n > 0)
    if (!live.length || !showProgress) { strip.style.display = 'none'; return }
    const max = Math.max(1, ...live.map(b => b.n))
    for (const b of live) {
      const i = document.createElement('i')
      const l = Math.max(0, Math.min(100, (b.from / Math.max(1, count)) * 100)); const w = Math.max(0.3, Math.min(100 - l, ((b.to - b.from) / Math.max(1, count)) * 100))
      i.style.cssText = `position:absolute;bottom:0;left:${l}%;width:${w}%;height:${Math.max(10, (b.n / max) * 100)}%;background:${cur.primary};opacity:0.35;border-radius:1px 1px 0 0;`
      strip.appendChild(i)
    }
    strip.style.display = ''
  }
  const setCountdown = (sec: number | null): void => {
    if (sec === null || !isFinite(sec)) { countdown.style.display = 'none'; return }
    countdown.textContent = s.nextIn.replace('{n}', String(Math.max(0, Math.ceil(sec))))
    countdown.style.display = ''
  }
  const setSpotlight = (on: boolean): void => {
    bSpot.setAttribute('aria-pressed', on ? 'true' : 'false')
    bSpot.style.background = on ? cur.primary : 'transparent'
    bSpot.style.color = on ? cur.primaryText : cur.primary
  }

  let cur: Tokens = tokens
  const setTokens = (t: Tokens): void => {
    cur = t
    card.style.background = t.surface
    card.style.color = t.text
    card.style.borderRadius = t.radiusLg
    card.style.boxShadow = t.shadowHover
    card.style.borderLeft = `5px solid ${t.primary}`
    bar.style.background = t.divider
    fill.style.background = t.primary
    chap.style.color = t.textSecondary
    text.style.color = t.text
    tiles.forEach(b => { const d = b.children[1] as HTMLElement; if (d) d.style.color = t.textSecondary })
    for (const b of [bPrev, bBack, bPlay, bStep, bNext, bFull, bExit, bGrid, bSpot, bPres, bInk, bBlack, bClear]) { b.style.color = t.primary; b.style.borderColor = t.divider }
    countdown.style.color = t.textSecondary
    tiles.forEach(b => { const th = b.firstChild as HTMLElement; if (!th.style.backgroundImage) th.style.background = t.divider })
    paintTiles()
  }
  setTokens(tokens)

  const update = (m: BannerModel, playing: boolean): void => {
    date.textContent = m.date
    chap.textContent = m.chapterLabel
    if (m.index !== currentIndex) {
      // a new chapter fades in, and is the one thing a screen reader hears
      if (!reduce) { for (const el of [title, text, img]) { el.style.opacity = '0' }; setTimeout(() => { for (const el of [title, text, img]) el.style.opacity = '1' }, 30) }
      live.textContent = [m.chapterLabel, m.title, m.text].filter(Boolean).join('. ')
    }
    img.alt = m.title || m.date
    title.textContent = m.title
    title.style.display = m.title ? '' : 'none'
    text.textContent = m.text
    text.style.display = m.text ? '' : 'none'
    if (m.image) { if (img.getAttribute('src') !== m.image) img.setAttribute('src', m.image); img.style.display = '' } else { img.style.display = 'none'; img.removeAttribute('src') }
    if (m.index !== currentIndex) { currentIndex = m.index; paintTiles() }
    fill.style.width = `${Math.round(m.progress * 1000) / 10}%`
    bar.setAttribute('aria-valuenow', String(Math.round(m.progress * 100))); bar.setAttribute('aria-valuetext', m.date)
    bPlay.innerHTML = svg(playing ? ICONS.pause : ICONS.play)
    bPlay.title = playing ? s.pause : s.play
    bPlay.setAttribute('aria-label', playing ? s.pause : s.play)
    bPlay.setAttribute('aria-pressed', playing ? 'true' : 'false')
    const marksKey = m.marks.map(p => Math.round(p * 1000)).join(',')
    if (marks.getAttribute('data-k') !== marksKey) {
      marks.setAttribute('data-k', marksKey)
      marks.innerHTML = ''
      for (const p of m.marks) {
        const t = document.createElement('span')
        t.style.cssText = `position:absolute;top:-3px;width:3px;height:12px;border-radius:2px;left:calc(${Math.round(p * 1000) / 10}% - 1px);background:${cur.text};opacity:0.6;`
        marks.appendChild(t)
      }
    }
  }

  const destroy = (): void => { try { wrap.remove() } catch (e) { /* ignore */ } }
  return { el: wrap, update, setTokens, setChapters, setThumb, toggleGrid, isGridOpen: () => gridOpen, setSpotlight, setInk, setBars, setCountdown, setFullscreen: (on: boolean) => { bFull.setAttribute('aria-pressed', on ? 'true' : 'false') }, setSpeed: (label: string) => { bSpeed.textContent = label; bSpeed.setAttribute('aria-label', `${s.speed}: ${label}`); bSpeed.title = `${s.speed}: ${label}` }, focus: () => { try { bPlay.focus() } catch (e) { /* ignore */ } }, destroy }
}
