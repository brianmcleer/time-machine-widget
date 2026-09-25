/**
 * Time Machine - video export.
 *
 * Frames are pictures of the map drawn onto an offscreen canvas with a caption strip
 * (date, chapter title), and the canvas stream goes through MediaRecorder to a WebM
 * file. No library. Works where MediaRecorder and canvas.captureStream exist (Chrome,
 * Edge, Firefox); `videoSupported` says so up front.
 */
export interface Recorder {
  /** Draw one frame: a map picture (data URL) and the caption lines. */
  frame: (imageDataUrl: string, date: string, title: string) => Promise<void>
  /** Stop and hand back the file. */
  stop: () => Promise<Blob>
  cancel: () => void
  readonly mimeType: string
}

export interface RecorderStyle { background: string, text: string, muted: string, accent: string, credit: string, font?: string }

export function videoSupported (): boolean {
  try {
    const w: any = window
    if (!w.MediaRecorder || typeof document.createElement('canvas').captureStream !== 'function') return false
    return pickMime() !== ''
  } catch (e) { return false }
}

export function pickMime (): string {
  const w: any = window
  if (!w.MediaRecorder || typeof w.MediaRecorder.isTypeSupported !== 'function') return ''
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) { if (w.MediaRecorder.isTypeSupported(m)) return m }
  return ''
}

/** Caption strip layout: how tall it is and the font sizes for a given frame width. */
export function captionLayout (width: number, height: number): { stripH: number, dateSize: number, titleSize: number, pad: number } {
  const stripH = Math.round(height * 0.12)
  return { stripH, dateSize: Math.round(stripH * 0.46), titleSize: Math.round(stripH * 0.3), pad: Math.round(width * 0.02) }
}

export function createRecorder (width: number, height: number, fps: number, style: RecorderStyle): Recorder | null {
  const w: any = window
  const mime = pickMime()
  if (!mime) return null
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const stream = canvas.captureStream(fps)
  let rec: any
  try { rec = new w.MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 }) } catch (e) { return null }
  const chunks: Blob[] = []
  rec.ondataavailable = (e: any) => { if (e.data && e.data.size) chunks.push(e.data) }
  rec.start(500)
  const lay = captionLayout(width, height)
  const paint = (img: HTMLImageElement | null, date: string, title: string): void => {
    ctx.fillStyle = style.background
    ctx.fillRect(0, 0, width, height)
    if (img) {
      // fit the picture above the strip at its own aspect
      const boxH = height - lay.stripH
      const r = Math.min(width / img.width, boxH / img.height)
      const dw = Math.round(img.width * r); const dh = Math.round(img.height * r)
      ctx.drawImage(img, Math.round((width - dw) / 2), Math.round((boxH - dh) / 2), dw, dh)
    }
    ctx.fillStyle = style.background
    ctx.fillRect(0, height - lay.stripH, width, lay.stripH)
    ctx.fillStyle = style.accent
    ctx.fillRect(0, height - lay.stripH, width, Math.max(3, Math.round(lay.stripH * 0.06)))
    ctx.fillStyle = style.text
    ctx.textBaseline = 'middle'
    const family = style.font ? style.font + ', ' : ''
    ctx.font = `700 ${lay.dateSize}px ${family}-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
    ctx.fillText(date, lay.pad, height - lay.stripH * 0.5)
    if (title) {
      ctx.font = `600 ${lay.titleSize}px ${family}-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
      const dateW = ctx.measureText(date).width * (lay.dateSize / lay.titleSize)
      const x = lay.pad * 2 + Math.round(dateW)
      let t = title
      while (t.length > 3 && ctx.measureText(t).width > width - x - lay.pad * 2 - (style.credit ? width * 0.2 : 0)) t = t.slice(0, -2)
      if (t !== title) t = t.replace(/\s+\S*$/, '') + '...'
      ctx.fillText(t, x, height - lay.stripH * 0.5)
    }
    if (style.credit) {
      ctx.fillStyle = style.muted
      ctx.font = `${Math.round(lay.titleSize * 0.7)}px ${family}-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
      ctx.textAlign = 'right'
      ctx.fillText(style.credit, width - lay.pad, height - lay.stripH * 0.5)
      ctx.textAlign = 'left'
    }
  }
  paint(null, '', '')
  return {
    mimeType: mime,
    frame: (dataUrl, date, title) => new Promise(resolve => {
      if (!dataUrl) { paint(null, date, title); resolve(); return }
      const img = new Image()
      img.onload = () => { paint(img, date, title); resolve() }
      img.onerror = () => { paint(null, date, title); resolve() }
      img.src = dataUrl
    }),
    stop: () => new Promise(resolve => {
      rec.onstop = () => { resolve(new Blob(chunks, { type: mime.split(';')[0] })) }
      try { rec.stop() } catch (e) { resolve(new Blob(chunks, { type: mime.split(';')[0] })) }
      try { stream.getTracks().forEach((t: any) => t.stop()) } catch (e) { /* ignore */ }
    }),
    cancel: () => { try { rec.ondataavailable = null; rec.stop() } catch (e) { /* ignore */ } try { stream.getTracks().forEach((t: any) => t.stop()) } catch (e) { /* ignore */ } }
  }
}

/** Frames per slider step for a video of a given length: at least one, at most a cap. */
export function framesPerStep (steps: number, seconds: number, fps: number, cap: number = 12): number {
  if (steps <= 0) return 1
  return Math.max(1, Math.min(cap, Math.round((seconds * fps) / steps)))
}
