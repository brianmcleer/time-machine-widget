/**
 * Time Machine - stage tools for presentations: ink, blackout, narration, pace.
 *
 * Ink: a canvas over the map the speaker draws on with the mouse or a pen (key D),
 * cleared with C, in the theme color. Blackout: a black cover (key B) to pull the
 * room's eyes back to the speaker, as PowerPoint does. Narration: the browser reads
 * the chapter aloud (key V) through the Web Speech API. Pace: are we ahead or behind
 * a target length. Plain DOM and pure math; no React, no SDK.
 */

/* ------------------------------------------------------------------ ink */

export interface Ink {
  setDrawing: (on: boolean) => void
  isDrawing: () => boolean
  clear: () => void
  /** Removes the last stroke. */
  undo: () => void
  setColor: (color: string) => void
  destroy: () => void
}

export function createInk (container: HTMLElement, color: string, width: number = 4): Ink {
  const canvas = document.createElement('canvas')
  canvas.className = 'tm-ink'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;touch-action:none;'
  container.appendChild(canvas)
  let ctx = canvas.getContext('2d')
  let drawing = false
  let down = false
  let last: { x: number, y: number } | null = null
  let stroke = color
  // strokes as point lists so the last one can be undone by repainting the rest
  const strokes: Array<{ color: string, width: number, points: Array<{ x: number, y: number, w: number }> }> = []
  let current: { color: string, width: number, points: Array<{ x: number, y: number, w: number }> } | null = null
  const fit = (): void => {
    const r = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    // keep what is drawn when the container resizes
    const keep = document.createElement('canvas'); keep.width = canvas.width; keep.height = canvas.height
    try { keep.getContext('2d')!.drawImage(canvas, 0, 0) } catch (e) { /* empty */ }
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr))
    ctx = canvas.getContext('2d')
    if (ctx) { ctx.scale(dpr, dpr); try { ctx.drawImage(keep, 0, 0, r.width, r.height) } catch (e) { /* empty */ } }
  }
  fit()
  const pos = (e: PointerEvent): { x: number, y: number } => { const r = container.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const onDown = (e: PointerEvent): void => { if (!drawing) return; down = true; last = pos(e); current = { color: stroke, width, points: [{ ...last, w: width }] }; strokes.push(current); try { canvas.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ } e.preventDefault() }
  const onMove = (e: PointerEvent): void => {
    if (!drawing || !down || !ctx || !last) return
    const p = pos(e)
    ctx.strokeStyle = stroke; ctx.lineWidth = e.pointerType === 'pen' && e.pressure ? width * (0.5 + e.pressure) : width
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    if (current) current.points.push({ x: p.x, y: p.y, w: ctx.lineWidth })
    last = p
    e.preventDefault()
  }
  const onUp = (): void => { down = false; last = null; current = null }
  const repaint = (): void => {
    if (!ctx) return
    const r = container.getBoundingClientRect(); ctx.clearRect(0, 0, r.width, r.height)
    for (const s of strokes) {
      ctx.strokeStyle = s.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      for (let i = 1; i < s.points.length; i++) { ctx.lineWidth = s.points[i].w; ctx.beginPath(); ctx.moveTo(s.points[i - 1].x, s.points[i - 1].y); ctx.lineTo(s.points[i].x, s.points[i].y); ctx.stroke() }
    }
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  let ro: any = null
  try { ro = new (window as any).ResizeObserver(fit); ro.observe(container) } catch (e) { window.addEventListener('resize', fit) }
  return {
    setDrawing: (on) => { drawing = on; canvas.style.pointerEvents = on ? 'auto' : 'none'; canvas.style.cursor = on ? 'crosshair' : '' },
    isDrawing: () => drawing,
    clear: () => { strokes.length = 0; current = null; if (ctx) { const r = container.getBoundingClientRect(); ctx.clearRect(0, 0, r.width, r.height) } },
    undo: () => { if (strokes.length) { strokes.pop(); current = null; repaint() } },
    setColor: (c) => { stroke = c },
    destroy: () => {
      try { if (ro) ro.disconnect(); else window.removeEventListener('resize', fit) } catch (e) { /* ignore */ }
      try { canvas.remove() } catch (e) { /* ignore */ }
    }
  }
}

/* ------------------------------------------------------------------ blackout */

export interface Blackout { toggle: (color?: string) => boolean, isOn: () => boolean, destroy: () => void }

export function createBlackout (container: HTMLElement, label: string, onOff?: () => void): Blackout {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'tm-blackout'
  el.setAttribute('aria-label', label)
  el.style.cssText = 'position:absolute;inset:0;background:#000;border:0;padding:0;z-index:7;display:none;cursor:pointer;'
  el.title = label
  container.appendChild(el)
  let on = false
  let before: HTMLElement | null = null
  const set = (v: boolean): void => {
    on = v; el.style.display = on ? '' : 'none'
    if (on) { before = document.activeElement as HTMLElement; try { el.focus() } catch (e) { /* ignore */ } } else { try { if (before && before.isConnected) before.focus() } catch (e) { /* ignore */ } if (onOff) onOff() }
  }
  el.addEventListener('click', () => { set(false) })
  return { toggle: (color) => { if (color) el.style.background = color; set(!on); return on }, isOn: () => on, destroy: () => { try { el.remove() } catch (e) { /* ignore */ } } }
}

/* ------------------------------------------------------------------ narration */

export interface Narrator { say: (text: string) => void, stop: () => void, available: boolean }

export function createNarrator (lang: string = (typeof document !== 'undefined' && document.documentElement.lang) || 'en-US'): Narrator {
  const synth: any = typeof window !== 'undefined' && (window as any).speechSynthesis
  const Utter: any = typeof window !== 'undefined' && (window as any).SpeechSynthesisUtterance
  const available = !!(synth && Utter)
  return {
    available,
    say: (text) => {
      if (!available || !text || !text.trim()) return
      try { synth.cancel(); const u = new Utter(text); u.lang = lang; u.rate = 1; synth.speak(u) } catch (e) { /* no voice */ }
    },
    stop: () => { try { if (available) synth.cancel() } catch (e) { /* ignore */ } }
  }
}

/** What the voice reads for a chapter: title, then text. Notes are for the presenter, not the room. */
export function narrationText (title: string, text: string): string {
  return [title, text].map(s => String(s || '').trim()).filter(Boolean).join('. ')
}

/* ------------------------------------------------------------------ pace */

export interface Pace {
  /** Seconds ahead (negative) or behind (positive) the planned point, or null without a target. */
  deltaSec: number | null
  /** Planned seconds into the talk at this chapter, given equal time per chapter. */
  plannedSec: number | null
  remainingSec: number | null
  label: 'ahead' | 'behind' | 'on' | null
}

export function pace (elapsedMs: number, chapterIndex: number, chapterCount: number, targetMinutes: number | undefined): Pace {
  if (!targetMinutes || !isFinite(targetMinutes) || targetMinutes <= 0 || chapterCount <= 0) return { deltaSec: null, plannedSec: null, remainingSec: null, label: null }
  const total = targetMinutes * 60
  const idx = Math.max(0, chapterIndex)
  const planned = (idx / chapterCount) * total
  const elapsed = Math.max(0, elapsedMs / 1000)
  const delta = Math.round(elapsed - planned)
  const tol = Math.max(15, total * 0.04)
  return { deltaSec: delta, plannedSec: Math.round(planned), remainingSec: Math.max(0, Math.round(total - elapsed)), label: delta > tol ? 'behind' : delta < -tol ? 'ahead' : 'on' }
}

/** Seconds spent per chapter so far, for rehearsal. */
export function addDwell (dwell: Record<number, number>, index: number, ms: number): Record<number, number> {
  if (index < 0 || !isFinite(ms) || ms <= 0) return dwell
  return { ...dwell, [index]: (dwell[index] || 0) + ms }
}

/** A gentle camera move to run while a chapter holds: a slow zoom in, or none. */
export function driftTarget (scale: number | undefined, mode: 'none' | 'zoomIn' | 'zoomOut' | undefined): { scale: number } | null {
  if (!mode || mode === 'none' || !scale || !isFinite(scale) || scale <= 0) return null
  return { scale: mode === 'zoomIn' ? scale * 0.8 : scale * 1.25 }
}
