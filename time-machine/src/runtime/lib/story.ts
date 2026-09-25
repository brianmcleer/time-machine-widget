/**
 * Time Machine - story chapters beyond the builder: capture from the map at run time,
 * keep a draft in the browser, apply a chapter's map state (layers, basemap, feature),
 * and export the whole thing as configuration XML for the builder to import.
 *
 * Duck-typed against the Maps SDK so it runs in node tests with plain objects.
 */
import type { Chapter, Config } from '../../config'
import { configToXml } from '../../configXml'
import { toIsoDate } from './timeMath'

export interface LayerUndo { layer: any, visible: boolean }

const PORTAL_ID = /^[0-9a-f]{32}$/i

function allLayers (map: any): any[] {
  try {
    if (map && map.allLayers && typeof map.allLayers.toArray === 'function') return map.allLayers.toArray()
    if (map && map.layers && typeof map.layers.toArray === 'function') return map.layers.toArray()
  } catch (e) { /* ignore */ }
  return []
}

/** A chapter that reproduces what the map shows right now. */
export function captureView (view: any, map: any, ms: number, title: string): Chapter {
  const c: Chapter = { date: toIsoDate(ms), title, text: '' }
  try {
    const center = view && view.center
    const lon = center && center.longitude != null ? Number(center.longitude) : NaN; const lat = center && center.latitude != null ? Number(center.latitude) : NaN
    if (isFinite(lon) && isFinite(lat)) { c.lon = Math.round(lon * 1e6) / 1e6; c.lat = Math.round(lat * 1e6) / 1e6 }
    const scale = view && view.scale != null ? Number(view.scale) : NaN
    if (isFinite(scale) && scale > 0) c.scale = Math.round(scale)
    const rot = view && view.rotation != null ? Number(view.rotation) : NaN
    if (isFinite(rot) && Math.abs(rot) > 0.01) c.rotation = Math.round(rot * 10) / 10
  } catch (e) { /* no viewpoint */ }
  const on: string[] = []; const off: string[] = []
  for (const l of allLayers(map)) {
    if (!l || l.id == null || l.listMode === 'hide') continue
    const id = String(l.id)
    // compare clones and other run time helpers are not part of a story
    if (id.indexOf('time-machine-') === 0) continue
    if (l.visible === false) off.push(id); else on.push(id)
  }
  if (on.length) c.layersOn = on
  if (off.length) c.layersOff = off
  try {
    const bm = map && map.basemap
    const id = bm && ((bm.portalItem && bm.portalItem.id) || bm.id)
    if (id && typeof id === 'string' && !/^basemap-\d+$/.test(id) && id !== 'basemap') c.basemap = id
  } catch (e) { /* no basemap id */ }
  return c
}

/** Turn layers on and off as the chapter says. Returns what to put back. */
export function applyChapterLayers (map: any, chapter: Chapter | null | undefined): LayerUndo[] {
  const undo: LayerUndo[] = []
  if (!chapter || (!chapter.layersOn && !chapter.layersOff)) return undo
  const want = new Map<string, boolean>()
  for (const id of chapter.layersOff || []) want.set(String(id), false)
  for (const id of chapter.layersOn || []) want.set(String(id), true)
  for (const l of allLayers(map)) {
    if (!l || l.id == null) continue
    const v = want.get(String(l.id))
    if (v === undefined) continue
    const cur = l.visible !== false
    if (cur === v) continue
    undo.push({ layer: l, visible: cur })
    try { l.visible = v } catch (e) { /* read only layer */ }
  }
  return undo
}

/** Put layers back in reverse order; later chapters win over earlier ones. */
export function restoreLayers (undo: LayerUndo[]): void {
  for (let i = undo.length - 1; i >= 0; i--) { try { undo[i].layer.visible = undo[i].visible } catch (e) { /* ignore */ } }
}

/** Keep only the first undo entry per layer so the original state is what comes back. */
export function mergeUndo (existing: LayerUndo[], more: LayerUndo[]): LayerUndo[] {
  const seen = new Set(existing.map(u => u.layer))
  const out = existing.slice()
  for (const u of more) if (!seen.has(u.layer)) { seen.add(u.layer); out.push(u) }
  return out
}

/** Swap the basemap. `Basemap` is the SDK class when a portal item id is used. Returns the previous basemap. */
export function applyChapterBasemap (map: any, id: string | undefined, Basemap: any): any {
  if (!map || !id) return null
  const prev = map.basemap
  try {
    if (PORTAL_ID.test(id)) { if (!Basemap) return null; map.basemap = new Basemap({ portalItem: { id } }) } else map.basemap = id
  } catch (e) { return null }
  return prev
}

/** Find the chapter's feature and open the popup on it. Resolves false when nothing matched. */
export async function showChapterFeature (view: any, map: any, chapter: Chapter | null | undefined): Promise<boolean> {
  if (!view || !chapter || !chapter.featureLayerId) return false
  const layer = allLayers(map).find(l => l && String(l.id) === String(chapter.featureLayerId))
  if (!layer || typeof layer.queryFeatures !== 'function') return false
  try {
    const q = typeof layer.createQuery === 'function' ? layer.createQuery() : {}
    q.where = chapter.featureWhere && chapter.featureWhere.trim() ? chapter.featureWhere : '1=1'
    q.outFields = ['*']; q.returnGeometry = true; q.num = 1
    const r = await layer.queryFeatures(q)
    const f = r && r.features && r.features[0]
    if (!f) return false
    if (typeof view.openPopup === 'function') await view.openPopup({ features: [f], location: f.geometry && f.geometry.type === 'point' ? f.geometry : undefined })
    return true
  } catch (e) { return false }
}

/* ------------------------------------------------------------------ draft in the browser */

const DRAFT_KEY = (widgetId: string): string => `timeMachine.story.${widgetId}`

export function readDraft (widgetId: string, storage?: { getItem: (k: string) => string | null }): Chapter[] {
  try {
    const s = storage || window.localStorage
    const raw = s.getItem(DRAFT_KEY(widgetId))
    const v = raw ? JSON.parse(raw) : null
    return Array.isArray(v) ? v.filter(c => c && typeof c === 'object' && typeof c.date === 'string') : []
  } catch (e) { return [] }
}

export function writeDraft (widgetId: string, chapters: Chapter[], storage?: { setItem: (k: string, v: string) => void, removeItem: (k: string) => void }): boolean {
  try {
    const s = storage || window.localStorage
    if (!chapters.length) s.removeItem(DRAFT_KEY(widgetId)); else s.setItem(DRAFT_KEY(widgetId), JSON.stringify(chapters))
    return true
  } catch (e) { return false }
}

/** Builder chapters first, then the draft; both sorted later by sortedChapters. */
export function mergeChapters (builder: Chapter[] | null | undefined, draft: Chapter[] | null | undefined): Chapter[] {
  return [...(Array.isArray(builder) ? builder : []), ...(Array.isArray(draft) ? draft : [])]
}

/** The whole configuration with the merged chapters, as XML for the builder's Import box. */
export function storyXml (cfg: Config, chapters: Chapter[]): string {
  return configToXml({ ...cfg, chapters })
}

/** Move a draft chapter up or down by one. */
export function moveChapter (list: Chapter[], index: number, dir: 1 | -1): Chapter[] {
  const out = list.slice()
  const j = index + dir
  if (index < 0 || index >= out.length || j < 0 || j >= out.length) return out
  const x = out[index]; out[index] = out[j]; out[j] = x
  return out
}

/* ------------------------------------------------------------------ presenter window model */

export interface PresenterState {
  date: string
  playing: boolean
  index: number
  total: number
  title: string
  text: string
  notes: string
  nextTitle: string
  nextDate: string
  elapsedMs: number
  chapters: Array<{ i: number, date: string, title: string, dwellSec?: number }>
  /** Pace against the planned length, when one is set. */
  /** Small pictures of the map at the current and the next chapter, once visited. */
  thumb?: string
  nextThumb?: string
  paceLabel?: 'ahead' | 'behind' | 'on' | null
  paceDeltaSec?: number | null
  remainingSec?: number | null
}

export function formatElapsed (ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60
  const mm = String(m).padStart(2, '0'); const ss = String(r).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

/** Presenter commands the window can send back. */
export type PresenterCommand = 'toggle' | 'next' | 'prev' | 'step' | 'back' | 'exit' | { goto: number }

export function parseCommand (raw: any): PresenterCommand | null {
  if (typeof raw === 'string') {
    if (raw === 'toggle' || raw === 'next' || raw === 'prev' || raw === 'step' || raw === 'back' || raw === 'exit') return raw
    const m = /^goto:(\d+)$/.exec(raw)
    if (m) return { goto: Number(m[1]) }
  }
  return null
}
