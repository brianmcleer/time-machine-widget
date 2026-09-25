/**
 * Time Machine - compare mode. Two dates side by side behind an <arcgis-swipe>
 * divider: the left side shows the map as of date A, the right side as of date B.
 *
 * Feature-type layers are cloned (the clone carries date B's filter) and the clone
 * is placed on the right. Map services get one MapImageLayer clone per service with
 * date B on the dated sublayers. Year sets put the A child on the left and the B
 * child on the right.
 *
 * The swipe pointer-events fix and the startLayers/leadingLayers branch are copied
 * from Basemap Gallery Custom 1.21.2 (handoff Section 12, items 9 to 11).
 */
import type { TimeTarget, YearSetTarget } from './layerEngine'
import { buildWhere, combineWhere, pickYearChild } from './timeMath'
import { originalWhere } from './layerEngine'
import type { Granularity } from '../../config'

const SWIPE_POINTER_CSS = ':host{pointer-events:none!important}' +
  '.esri-swipe__container{pointer-events:none!important}' +
  '.esri-swipe__divider,.esri-swipe__handle,.esri-swipe__handle-inner{pointer-events:auto!important}'

export function letMapEventsThroughSwipe (swipe: any): void {
  try {
    swipe.style.pointerEvents = 'none'
    swipe.style.position = 'absolute'
    swipe.style.inset = '0'
    const root = swipe.shadowRoot
    if (!root) return
    if (typeof CSSStyleSheet !== 'undefined' && Array.isArray(root.adoptedStyleSheets) && !swipe.__tmPointerSheet) {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(SWIPE_POINTER_CSS)
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
      swipe.__tmPointerSheet = true
    } else if (!swipe.__tmPointerSheet) {
      const style = document.createElement('style')
      style.textContent = SWIPE_POINTER_CSS
      root.appendChild(style)
      swipe.__tmPointerSheet = true
    }
  } catch (err) {
    console.warn('Time Machine: could not adjust swipe pointer events', err)
  }
}

export interface CompareSession {
  swipe: any
  clones: any[]
  /** Originals on the left, paired by index with `clones` on the right. */
  originals: any[]
  /** Year-set children switched on for the session, with their previous visibility. */
  touched: Array<{ layer: any, wasVisible: boolean }>
  yearSets: YearSetTarget[]
  Collection: any
  onInput: () => void
}

export interface CompareDeps {
  view: any
  Collection: any
  /** Builds a MapImageLayer for the right side of a map service. Absent: sublayers follow date A on both sides. */
  MapImageLayer?: any
  widgetId: string
  g: Granularity
  targets: TimeTarget[]
  yearSets: YearSetTarget[]
  dateA: number
  dateB: number
  position: number
  onPosition: (pct: number) => void
}

async function waitForSwipe (): Promise<void> {
  if (typeof customElements === 'undefined' || !customElements.whenDefined) return
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('arcgis-swipe is not registered')) }, 15000)
    customElements.whenDefined('arcgis-swipe').then(
      () => { clearTimeout(timer); resolve() },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })
}

/** Stable id for a clone so a sweep can find it after a close and reopen. */
export function cloneId (widgetId: string, key: string): string {
  return `time-machine-${widgetId}-cmp-${key}`
}

/** Remove any clone left on the map from an earlier session of this widget. */
export function sweepClones (map: any, widgetId: string): void {
  try {
    const prefix = `time-machine-${widgetId}-cmp-`
    const all: any[] = map && map.allLayers && typeof map.allLayers.toArray === 'function' ? map.allLayers.toArray() : []
    for (const l of all) {
      if (String(l.id || '').indexOf(prefix) === 0) { try { map.remove(l) } catch (e) { /* ignore */ } try { l.destroy && l.destroy() } catch (e) { /* ignore */ } }
    }
  } catch (e) { /* ignore */ }
}

/** Build the right-hand (date B) side and hang the divider on the view. */
export async function startCompare (d: CompareDeps): Promise<CompareSession> {
  const { view, Collection, widgetId, g, targets, yearSets, dateA, dateB } = d
  const map = view.map
  sweepClones(map, widgetId)
  await waitForSwipe()

  const left: any[] = []
  const right: any[] = []
  const clones: any[] = []
  const originals: any[] = []
  const touched: Array<{ layer: any, wasVisible: boolean }> = []

  for (const t of targets) {
    if (!t.enabled || t.kind !== 'layer' || typeof t.target.clone !== 'function') continue
    let c: any
    try { c = t.target.clone() } catch (e) { continue }
    c.id = cloneId(widgetId, t.key)
    c.title = `${t.title} (B)`
    c.listMode = 'hide'
    c.definitionExpression = combineWhere(originalWhere(t.target, widgetId), buildWhere({ pick: t.pick, g, from: dateB, to: dateB, semantic: 'asof' }))
    const idx = map.layers && typeof map.layers.indexOf === 'function' ? map.layers.indexOf(t.owner) : -1
    try { map.add(c, idx >= 0 ? idx + 1 : undefined) } catch (e) { continue }
    clones.push(c)
    originals.push(t.target)
    left.push(t.target)
    right.push(c)
  }

  // Map image sublayers: one clone of the whole service per owner, carrying every visible
  // leaf sublayer, with date B on the dated ones. The owner stays on the left.
  if (d.MapImageLayer) {
    const byOwner = new Map<any, TimeTarget[]>()
    for (const t of targets) {
      if (!t.enabled || t.kind !== 'sublayer' || !t.owner || !t.owner.url) continue
      if (!byOwner.has(t.owner)) byOwner.set(t.owner, [])
      byOwner.get(t.owner)!.push(t)
    }
    byOwner.forEach((subs, owner) => {
      try {
        const leaves: any[] = owner.allSublayers && typeof owner.allSublayers.toArray === 'function' ? owner.allSublayers.toArray() : []
        const spec: any[] = []
        for (const sl of leaves) {
          if (!sl || (sl.sublayers && sl.sublayers.length) || sl.visible === false) continue
          const t = subs.find(x => x.target === sl)
          const where = t
            ? combineWhere(originalWhere(sl, widgetId), buildWhere({ pick: t.pick, g, from: dateB, to: dateB, semantic: 'asof' }))
            : (sl.definitionExpression || null)
          spec.push({ id: sl.id, visible: true, definitionExpression: where || undefined })
        }
        if (!spec.length) return
        const c = new d.MapImageLayer({ url: owner.url, id: cloneId(widgetId, String(owner.id)), title: `${owner.title || owner.id} (B)`, listMode: 'hide', sublayers: spec, opacity: owner.opacity })
        c.__tmSublayerKeys = subs.map(s => s.key)
        const idx = map.layers && typeof map.layers.indexOf === 'function' ? map.layers.indexOf(owner) : -1
        map.add(c, idx >= 0 ? idx + 1 : undefined)
        clones.push(c); originals.push(owner); left.push(owner); right.push(c)
      } catch (e) { /* this service stays as date A on both sides */ }
    })
  }

  // every dated child of a year set is remembered so a later date change can switch them
  for (const s of yearSets) {
    for (const c of s.children) if (c.year != null) touched.push({ layer: c.layer, wasVisible: c.layer.visible !== false })
  }
  const ys = yearSetSides(yearSets, dateA, dateB)
  left.push(...ys.left); right.push(...ys.right)

  const swipe: any = document.createElement('arcgis-swipe')
  swipe.view = view
  swipe.direction = 'horizontal'
  swipe.position = d.position
  const start = new Collection(left)
  const end = new Collection(right)
  if ('startLayers' in swipe || !('leadingLayers' in swipe)) {
    swipe.startLayers = start
    swipe.endLayers = end
  } else {
    swipe.leadingLayers = start
    swipe.trailingLayers = end
  }
  const onInput = (): void => {
    const v = Number(swipe.position)
    if (isFinite(v)) d.onPosition(Math.round(v))
  }
  swipe.addEventListener('arcgisSwipeInput', onInput)
  swipe.addEventListener('arcgisSwipeChange', onInput)
  letMapEventsThroughSwipe(swipe)
  swipe.addEventListener('arcgisReady', () => { letMapEventsThroughSwipe(swipe) }, { once: true })
  view.ui.add(swipe, 'manual')
  letMapEventsThroughSwipe(swipe)
  return { swipe, clones, originals, touched, yearSets, Collection, onInput }
}

/** Which year-set children go on which side, switching their visibility as it goes. */
function yearSetSides (yearSets: YearSetTarget[], dateA: number, dateB: number): { left: any[], right: any[] } {
  const left: any[] = []; const right: any[] = []
  for (const s of yearSets) {
    const dated = s.children.filter(c => c.year != null).map(c => ({ key: c.key, year: c.year as number }))
    const a = pickYearChild(dated, dateA)
    const b = pickYearChild(dated, dateB)
    for (const c of s.children) {
      if (c.year == null) continue
      const on = c.key === a || c.key === b
      try { c.layer.visible = on } catch (e) { /* ignore */ }
      if (c.key === a) left.push(c.layer)
      if (c.key === b && b !== a) right.push(c.layer)
    }
  }
  return { left, right }
}

function setSides (s: CompareSession, left: any[], right: any[]): void {
  const start = new s.Collection(left); const end = new s.Collection(right)
  try {
    if ('startLayers' in s.swipe || !('leadingLayers' in s.swipe)) { s.swipe.startLayers = start; s.swipe.endLayers = end } else { s.swipe.leadingLayers = start; s.swipe.trailingLayers = end }
  } catch (e) { /* ignore */ }
}

/** Refresh both sides when either date moves. Clones keep their identity; the left
 *  side's originals are filtered by the caller (applyTime with date A). */
export function updateCompareDates (s: CompareSession, d: Pick<CompareDeps, 'widgetId' | 'g' | 'targets' | 'dateA' | 'dateB'>): void {
  for (const c of s.clones) {
    if (Array.isArray(c.__tmSublayerKeys)) {
      // a map service clone: refresh each dated sublayer inside it
      for (const key of c.__tmSublayerKeys) {
        const t = d.targets.find(x => x.key === key)
        const sub = t && c.allSublayers && typeof c.allSublayers.find === 'function' ? c.allSublayers.find((x: any) => String(x.id) === String(t.target.id)) : null
        if (!t || !sub) continue
        try { sub.definitionExpression = combineWhere(originalWhere(t.target, d.widgetId), buildWhere({ pick: t.pick, g: d.g, from: d.dateB, to: d.dateB, semantic: 'asof' })) } catch (e) { /* ignore */ }
      }
      // a map service only re-exports on the first sublayer filter change
      try { if (typeof c.refresh === 'function') c.refresh() } catch (e) { /* ignore */ }
      continue
    }
    const key = String(c.id).slice(cloneId(d.widgetId, '').length)
    const t = d.targets.find(x => x.key === key)
    if (!t) continue
    try { c.definitionExpression = combineWhere(originalWhere(t.target, d.widgetId), buildWhere({ pick: t.pick, g: d.g, from: d.dateB, to: d.dateB, semantic: 'asof' })) } catch (e) { /* ignore */ }
  }
  if (s.yearSets.length) {
    const ys = yearSetSides(s.yearSets, d.dateA, d.dateB)
    setSides(s, [...s.originals, ...ys.left], [...s.clones, ...ys.right])
  }
}

export function stopCompare (view: any, s: CompareSession | null): void {
  if (!s) return
  try { s.swipe.removeEventListener('arcgisSwipeInput', s.onInput); s.swipe.removeEventListener('arcgisSwipeChange', s.onInput) } catch (e) { /* ignore */ }
  try { view && view.ui && view.ui.remove(s.swipe) } catch (e) { /* ignore */ }
  try { s.swipe.remove && s.swipe.remove() } catch (e) { /* ignore */ }
  const map = view && view.map
  for (const c of s.clones) { try { map && map.remove(c) } catch (e) { /* ignore */ } try { c.destroy && c.destroy() } catch (e) { /* ignore */ } }
  for (const t of s.touched) { try { t.layer.visible = t.wasVisible } catch (e) { /* ignore */ } }
}
