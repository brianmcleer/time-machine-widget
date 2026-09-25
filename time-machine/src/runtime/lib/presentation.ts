/**
 * Time Machine - presentation mode, the pure part.
 *
 * A presentation walks the timeline with a large banner on the map: the date, a
 * progress bar, and the current chapter's title and text. Chapters are builder-written
 * story points pinned to a date, each with an optional place to fly to.
 *
 * Nothing here touches the DOM or the SDK; widget.tsx and presentBanner.ts do that.
 */
import type { Chapter, Granularity } from '../../config'
import { parseIsoDate, startOfUnit, formatDate } from './timeMath'

export interface ChapterAt {
  index: number
  chapter: Chapter
  ms: number
}

/** Chapters with a valid date, sorted, each with its date in ms. */
export function sortedChapters (chapters: Chapter[] | null | undefined): ChapterAt[] {
  const out: ChapterAt[] = []
  for (const c of chapters || []) {
    const ms = parseIsoDate(c && c.date)
    if (isFinite(ms)) out.push({ index: 0, chapter: c, ms })
  }
  out.sort((a, b) => a.ms - b.ms)
  out.forEach((c, i) => { c.index = i })
  return out
}

/** The chapter that starts in the same slider unit as the date, or null. */
export function chapterStartingAt (chapters: ChapterAt[], ms: number, g: Granularity): ChapterAt | null {
  const unit = startOfUnit(ms, g)
  // two chapters on one unit: the later one is the one in effect, so it is the one landed on
  let hit: ChapterAt | null = null
  for (const c of chapters) if (startOfUnit(c.ms, g) === unit) hit = c
  return hit
}

/** The latest chapter on or before the date (what the banner shows while scrubbing). */
export function chapterInEffect (chapters: ChapterAt[], ms: number, g: Granularity): ChapterAt | null {
  const unit = startOfUnit(ms, g)
  let hit: ChapterAt | null = null
  for (const c of chapters) { if (startOfUnit(c.ms, g) <= unit) hit = c; else break }
  return hit
}

/** The next chapter strictly after the date, or null at the end (wraps when loop is on). */
export function nextChapter (chapters: ChapterAt[], ms: number, g: Granularity, loop: boolean): ChapterAt | null {
  const unit = startOfUnit(ms, g)
  const n = chapters.find(c => startOfUnit(c.ms, g) > unit)
  if (n) return n
  return loop && chapters.length ? chapters[0] : null
}

export function prevChapter (chapters: ChapterAt[], ms: number, g: Granularity): ChapterAt | null {
  const unit = startOfUnit(ms, g)
  let hit: ChapterAt | null = null
  for (const c of chapters) { if (startOfUnit(c.ms, g) < unit) hit = c; else break }
  return hit
}

/** Timeline progress, 0..1. */
export function progress (start: number, end: number, ms: number): number {
  if (!(end > start)) return 0
  const p = (ms - start) / (end - start)
  return p < 0 ? 0 : p > 1 ? 1 : p
}

export interface BannerModel {
  date: string
  title: string
  text: string
  progress: number
  chapterLabel: string
  /** Positions 0..1 along the bar where chapters sit, for tick marks. */
  marks: number[]
  /** Index of the chapter in effect, or -1. */
  index: number
  /** Picture for the chapter in effect (https URL), or empty. */
  image: string
}

/** Everything the banner needs to draw, computed once per date change. */
export function bannerModel (opts: { chapters: ChapterAt[], start: number, end: number, ms: number, g: Granularity, chapterLabel: (i: number, n: number) => string }): BannerModel {
  const c = chapterInEffect(opts.chapters, opts.ms, opts.g)
  return {
    date: formatDate(opts.ms, opts.g),
    title: c ? String(c.chapter.title || '') : '',
    text: c ? String(c.chapter.text || '') : '',
    progress: progress(opts.start, opts.end, opts.ms),
    chapterLabel: c ? opts.chapterLabel(c.index + 1, opts.chapters.length) : '',
    marks: opts.chapters.map(x => progress(opts.start, opts.end, x.ms)),
    index: c ? c.index : -1,
    image: c && c.chapter.image && /^https:\/\//i.test(String(c.chapter.image)) ? String(c.chapter.image) : ''
  }
}

/** A chapter's fly-to target, or null when it has none. */
export function chapterTarget (c: Chapter | null | undefined): { center: [number, number], scale?: number, rotation?: number } | null {
  if (!c) return null
  const lon = Number(c.lon); const lat = Number(c.lat)
  if (!isFinite(lon) || !isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null
  const scale = Number(c.scale)
  const rot = Number(c.rotation)
  return { center: [lon, lat], scale: isFinite(scale) && scale > 0 ? scale : undefined, rotation: isFinite(rot) ? rot : undefined }
}

/** goTo options for a chapter: a flight or a cut. */
export function chapterGoToOptions (c: Chapter | null | undefined, flyMs: number): { duration: number, animate: boolean } {
  const jump = !!c && c.transition === 'jump'
  const ms = isFinite(flyMs) && flyMs >= 0 ? flyMs : 1500
  return jump ? { duration: 0, animate: false } : { duration: ms, animate: ms > 0 }
}

/** Hold time for a chapter while playing: its own, else the builder default. */
export function chapterHold (c: Chapter | null | undefined, defaultMs: number): number {
  const own = c && Number(c.holdMs)
  if (own !== undefined && own !== null && isFinite(own) && own >= 0) return own
  return isFinite(defaultMs) && defaultMs >= 0 ? defaultMs : 4000
}

/** Keyboard map for presentation mode. Returns the action name or null. */
export function presentKey (key: string, shift: boolean): 'toggle' | 'next' | 'prev' | 'step' | 'back' | 'exit' | 'fullscreen' | 'start' | 'end' | 'grid' | 'spotlight' | 'presenter' | 'ink' | 'clearInk' | 'blackout' | 'whiteout' | 'voice' | 'undoInk' | 'faster' | 'slower' | null {
  switch (key) {
    case ' ': case 'Spacebar': return 'toggle'
    case 'ArrowRight': return shift ? 'next' : 'step'
    case 'ArrowLeft': return shift ? 'prev' : 'back'
    case 'PageDown': case 'n': case 'N': return 'next'
    case 'PageUp': case 'p': case 'P': return 'prev'
    case 'Home': return 'start'
    case 'End': return 'end'
    case 'Escape': return 'exit'
    case 'f': case 'F': return 'fullscreen'
    case 'g': case 'G': return 'grid'
    case 'l': case 'L': return 'spotlight'
    case 'w': case 'W': return 'presenter'
    case 'd': case 'D': return 'ink'
    case 'c': case 'C': return 'clearInk'
    case 'b': case 'B': case '.': return 'blackout'
    case ',': return 'whiteout'
    case 'z': case 'Z': return 'undoInk'
    case 'v': case 'V': return 'voice'
    case '+': case '=': return 'faster'
    case '-': case '_': return 'slower'
    default: return null
  }
}
