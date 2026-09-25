/**
 * Time Machine - the map side. Walks the map for layers that can follow the slider,
 * remembers each layer's own filter, applies ours on top and puts theirs back.
 *
 * Everything is duck-typed against the Maps SDK objects (no esri imports), so the
 * test suite can drive it with plain objects, and a missing property never throws.
 */
import type { Config, Granularity, LayerRule, YearSet } from '../../config'
import {
  FieldInfo, FieldPick, resolveFieldPick, findRule, buildWhere, combineWhere,
  yearFromTitle, pickYearChild, fitRange, isRealisticDate, yearWindow, type YearWindow, dateFields, isDateField, safeField, markTracking, orderDateFields,
  indexToDate, sqlTimestamp, addUnits, startOfUnit, type ActivityUnit, type ActivityBar
} from './timeMath'

/** One thing the slider drives. */
export interface TimeTarget {
  key: string
  title: string
  kind: 'layer' | 'sublayer'
  /** The SDK object whose definitionExpression we set. */
  target: any
  /** The map layer that owns it (same as target for a top-level layer). */
  owner: any
  pick: FieldPick
  /** Off when the user unticks it in the panel. */
  enabled: boolean
  /** Exposed date fields the user may switch between (name and alias). */
  dateFields: FieldInfo[]
  /** True when the layer (and every parent) is turned on in the map right now. */
  on: boolean
  /** True when a builder rule fixed the field; the panel then offers no choice. */
  fixed: boolean
}

export interface YearSetTarget {
  key: string
  title: string
  group: any
  children: Array<{ key: string, layer: any, year: number | null, wasVisible: boolean }>
}

/** Layer types that carry a queryable date field. */
const FEATURE_TYPES = ['feature', 'geojson', 'csv', 'wfs', 'ogc-feature', 'subtype-group', 'oriented-imagery', 'stream']

export function isFeatureLike (layer: any): boolean {
  const t = String(layer && layer.type || '')
  return FEATURE_TYPES.indexOf(t) >= 0
}

/** Depth-first over map.layers (top of the list first), into group layers. */
export function walkLayers (map: any, visit: (layer: any, path: any[]) => void): void {
  const walk = (coll: any, path: any[]): void => {
    const items: any[] = coll && typeof coll.toArray === 'function' ? coll.toArray() : (Array.isArray(coll) ? coll : (coll && coll.items) || [])
    for (let i = items.length - 1; i >= 0; i--) {
      const l = items[i]
      if (!l) continue
      visit(l, path)
      if (l.type === 'group' && l.layers) walk(l.layers, path.concat([l]))
    }
  }
  walk(map && map.layers, [])
}

/**
 * Only the fields the map exposes. A layer whose popup names its fields hides the
 * rest from users, so the widget hides them too; when that would leave no date field
 * the whole exposed list is used instead.
 */
export function exposedFields (obj: any, all: FieldInfo[]): FieldInfo[] {
  try {
    const pt = obj && obj.popupTemplate
    const infos: any[] = pt && pt.fieldInfos ? (typeof pt.fieldInfos.toArray === 'function' ? pt.fieldInfos.toArray() : Array.from(pt.fieldInfos)) : []
    if (!infos.length) return all
    const shown = new Set<string>()
    for (const fi of infos) if (fi && fi.visible !== false && fi.fieldName) shown.add(String(fi.fieldName).toLowerCase())
    const kept = all.filter(f => shown.has(f.name.toLowerCase()))
    return kept.some(isDateField) ? kept : all
  } catch (e) { return all }
}

/** Read fields off a layer or sublayer, loading it when needed. Never throws. */
export async function readFields (obj: any, fetchJson?: (url: string) => Promise<any>, timeoutMs: number = 8000): Promise<FieldInfo[]> {
  try {
    if (obj && Array.isArray(obj.fields) && obj.fields.length) return markTracking(obj.fields.map(fieldInfo), obj.editFieldsInfo)
    if (obj && typeof obj.load === 'function') {
      try { await withTimeout(obj.load(), timeoutMs) } catch (e) { /* fall through to the REST read */ }
      if (Array.isArray(obj.fields) && obj.fields.length) return markTracking(obj.fields.map(fieldInfo), obj.editFieldsInfo)
    }
    if (obj && obj.url && fetchJson) {
      const j = await withTimeout(fetchJson(String(obj.url) + (String(obj.url).indexOf('?') >= 0 ? '&' : '?') + 'f=json'), timeoutMs)
      if (j && Array.isArray(j.fields)) return markTracking(j.fields.map(fieldInfo), j.editFieldsInfo)
    }
  } catch (e) { /* no fields: the layer is skipped */ }
  return []
}

/** One request per map service answers for every sublayer at once. */
export async function readServiceFields (owner: any, fetchJson?: (url: string) => Promise<any>, timeoutMs: number = 8000): Promise<Map<string, FieldInfo[]>> {
  const out = new Map<string, FieldInfo[]>()
  if (!owner || !owner.url || !fetchJson) return out
  try {
    const j = await withTimeout(fetchJson(String(owner.url).replace(/\/+$/, '') + '/layers?f=json'), timeoutMs)
    for (const l of (j && Array.isArray(j.layers) ? j.layers : [])) {
      if (l && Array.isArray(l.fields)) out.set(String(l.id), markTracking(l.fields.map(fieldInfo), l.editFieldsInfo))
    }
  } catch (e) { /* per-sublayer reads take over */ }
  return out
}

export function withTimeout<T> (p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => { reject(new Error('timeout')) }, ms)
    Promise.resolve(p).then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

/** Turned on in the map: the layer and every parent group are visible. */
export function isLayerOn (layer: any): boolean {
  let l = layer
  let guard = 0
  while (l && guard++ < 50) {
    if (l.visible === false) return false
    l = l.parent && l.parent.type ? l.parent : null
  }
  return true
}

export function isTargetOn (t: TimeTarget): boolean {
  if (t.kind === 'sublayer') {
    if (!isLayerOn(t.owner)) return false
    let s = t.target; let guard = 0
    while (s && guard++ < 50 && s !== t.owner) { if (s.visible === false) return false; s = s.parent && s.parent !== t.owner && s.parent.id !== undefined ? s.parent : null }
    return true
  }
  return isLayerOn(t.target)
}

/** A short string that changes whenever any layer's visibility changes; cheap to watch. */
export function visibilitySignature (map: any): string {
  const parts: string[] = []
  try {
    const all: any[] = map && map.allLayers && typeof map.allLayers.toArray === 'function' ? map.allLayers.toArray() : []
    for (const l of all) {
      parts.push(l.visible === false ? '0' : '1')
      if (l.allSublayers && typeof l.allSublayers.toArray === 'function') for (const s of l.allSublayers.toArray()) parts.push(s.visible === false ? '0' : '1')
    }
  } catch (e) { /* ignore */ }
  return parts.join('')
}

function fieldInfo (f: any): FieldInfo {
  return { name: String(f && f.name || ''), type: String(f && f.type || ''), alias: f && f.alias }
}

export type SkipReason = 'no-date-field' | 'no-fields' | 'rule-off' | 'not-in-rules'

export interface DiscoverOptions {
  config: Config
  widgetId: string
  fetchJson?: (url: string) => Promise<any>
  /** Called for every candidate layer that does not follow the slider, with why. */
  onSkip?: (title: string, key: string, reason: SkipReason) => void
}

/**
 * Find every layer and map image sublayer that can follow the slider. Rules with
 * mode "off" remove a layer; other rules choose its fields. With autoDiscover off only
 * layers that have a rule are used.
 */
export async function discoverTargets (map: any, opts: DiscoverOptions): Promise<TimeTarget[]> {
  const cfg = opts.config
  const rules: LayerRule[] = (cfg.rules || []) as LayerRule[]
  const preferred = (cfg.preferredFields && cfg.preferredFields.length ? cfg.preferredFields : []) as string[]
  const auto = cfg.autoDiscover !== false
  const candidates: Array<{ key: string, title: string, kind: 'layer' | 'sublayer', target: any, owner: any }> = []

  walkLayers(map, (layer) => {
    if (layer.listMode === 'hide') return
    if (isFeatureLike(layer)) {
      candidates.push({ key: String(layer.id), title: String(layer.title || layer.id), kind: 'layer', target: layer, owner: layer })
      return
    }
    if ((layer.type === 'map-image' || layer.type === 'tile') && layer.allSublayers) {
      const subs: any[] = typeof layer.allSublayers.toArray === 'function' ? layer.allSublayers.toArray() : []
      for (const s of subs) {
        if (!s || (s.sublayers && s.sublayers.length)) continue // group sublayer
        candidates.push({ key: `${layer.id}::${s.id}`, title: `${layer.title || layer.id}: ${s.title || s.id}`, kind: 'sublayer', target: s, owner: layer })
      }
    }
  })

  // one /layers request per map service, shared by all its sublayers
  const serviceFields = new Map<any, Promise<Map<string, FieldInfo[]>>>()
  const results = await Promise.all(candidates.map(async (c): Promise<TimeTarget | null> => {
    const rule = findRule(rules, c.key, c.title) || (c.kind === 'sublayer' ? findRule(rules, c.key, String(c.target.title || '')) : null)
    const skip = (r: SkipReason): null => { if (opts.onSkip) opts.onSkip(c.title, c.key, r); return null }
    if (rule && rule.mode === 'off') return skip('rule-off')
    if (!auto && !rule) return skip('not-in-rules')
    let all: FieldInfo[] = []
    if (c.kind === 'sublayer' && Array.isArray(c.target.fields) && c.target.fields.length) all = markTracking(c.target.fields.map(fieldInfo), c.target.editFieldsInfo)
    else if (c.kind === 'sublayer') {
      if (!serviceFields.has(c.owner)) serviceFields.set(c.owner, readServiceFields(c.owner, opts.fetchJson))
      const m = await serviceFields.get(c.owner)!
      all = m.get(String(c.target.id)) || await readFields(c.target, opts.fetchJson)
    } else all = await readFields(c.target, opts.fetchJson)
    const fields = exposedFields(c.target, all)
    const pick = resolveFieldPick(fields, preferred, rule)
    if (!pick) return skip(all.length ? 'no-date-field' : 'no-fields')
    const dates = orderDateFields(fields)
    const fixed = !!(rule && (rule.mode === 'field' || rule.mode === 'span'))
    return { key: c.key, title: c.title, kind: c.kind, target: c.target, owner: c.owner, pick, enabled: true, dateFields: dates, on: false, fixed }
  }))
  const out = results.filter((x): x is TimeTarget => !!x)
  for (const t of out) t.on = isTargetOn(t)
  return out
}

/** Group layers configured as year sets, with their dated children. */
export function discoverYearSets (map: any, sets: YearSet[] | null | undefined): YearSetTarget[] {
  const out: YearSetTarget[] = []
  if (!sets || !sets.length) return out
  walkLayers(map, (layer) => {
    if (layer.type !== 'group') return
    const title = String(layer.title || '')
    const hit = sets.find(s => (s.groupLayerId && s.groupLayerId === String(layer.id)) || (!s.groupLayerId && (s.title || '').trim().toLowerCase() === title.trim().toLowerCase()))
    if (!hit) return
    const kids: any[] = layer.layers && typeof layer.layers.toArray === 'function' ? layer.layers.toArray() : []
    out.push({
      key: String(layer.id),
      title,
      group: layer,
      children: kids.map(k => ({ key: String(k.id), layer: k, year: yearFromTitle(String(k.title || '')), wasVisible: k.visible !== false }))
    })
  })
  return out
}

/* ------------------------------------------------------------------ apply / restore */

const ORIG = '__timeMachineOriginal'

/** Remember the layer's own filter once, before we ever touch it. */
export function rememberOriginal (obj: any, widgetId: string): void {
  if (!obj) return
  const bag = obj[ORIG] || (obj[ORIG] = {})
  if (!(widgetId in bag)) bag[widgetId] = obj.definitionExpression == null ? null : String(obj.definitionExpression)
}

export function originalWhere (obj: any, widgetId: string): string | null {
  const bag = obj && obj[ORIG]
  if (!bag || !(widgetId in bag)) return obj && obj.definitionExpression != null ? String(obj.definitionExpression) : null
  return bag[widgetId]
}

export interface ApplyInput {
  targets: TimeTarget[]
  widgetId: string
  g: Granularity
  from: number
  to: number
  semantic: 'asof' | 'between'
  /**
   * Layer views by target key. A feature layer with a view is filtered on the client
   * (layerView.filter), which is instant: no request, no redraw wait. Targets without a
   * view, and map service sublayers, fall back to definitionExpression on the server.
   */
  layerViews?: Map<string, any>
  /** Asks a map service for a fresh picture; the default calls layer.refresh() at once. The widget passes one that waits for the picture in flight. */
  refresh?: (owner: any) => void
  /** Called with the clause in force for each target (null when the target is left alone). */
  onWhere?: (key: string, where: string | null) => void
}

const VIEW_WHERE = '__timeMachineViewWhere'
const LAST = '__timeMachineLastWhere'

/** Set every enabled target's filter. Returns the number of layers changed. */
export function applyTime (a: ApplyInput): number {
  let n = 0
  const touched = new Set<any>()
  for (const t of a.targets) {
    if (!t.target) continue
    rememberOriginal(t.target, a.widgetId)
    // a filter we did not write (another widget's) becomes the layer's own filter from now on
    const curNow = t.target.definitionExpression == null ? null : String(t.target.definitionExpression)
    const last: string | null = t.target[LAST] === undefined ? null : t.target[LAST]
    if ((curNow || null) !== (last || null) && (curNow || null) !== (originalWhere(t.target, a.widgetId) || null)) t.target[ORIG][a.widgetId] = curNow
    const ours = t.enabled ? buildWhere({ pick: t.pick, g: a.g, from: a.from, to: a.to, semantic: a.semantic }) : null
    const lv = a.layerViews && t.kind === 'layer' ? a.layerViews.get(t.key) : null
    if (lv && 'filter' in lv && !lv.destroyed && (!lv.layer || lv.layer === t.target)) {
      // client side: the layer keeps its own definitionExpression, the view filters what is drawn
      const orig = originalWhere(t.target, a.widgetId)
      const cur = t.target.definitionExpression == null ? null : String(t.target.definitionExpression)
      if ((cur || null) !== (orig || null)) { try { t.target.definitionExpression = orig; t.target[LAST] = orig } catch (e) { /* ignore */ } }
      const prev: string | null = lv[VIEW_WHERE] === undefined ? null : lv[VIEW_WHERE]
      if ((prev || null) !== (ours || null)) {
        try { lv.filter = ours ? { where: ours } : null; lv[VIEW_WHERE] = ours; n++ } catch (e) { /* view gone */ }
      }
      if (a.onWhere) a.onWhere(t.key, combineWhere(orig, ours))
      continue
    }
    const next = combineWhere(originalWhere(t.target, a.widgetId), ours)
    const cur = t.target.definitionExpression == null ? null : String(t.target.definitionExpression)
    if ((cur || null) !== (next || null)) {
      try { t.target.definitionExpression = next; t.target[LAST] = next; n++; if (t.kind === 'sublayer' && t.owner) touched.add(t.owner) } catch (e) { /* read-only target */ }
    }
    if (a.onWhere) a.onWhere(t.key, next)
  }
  // a map service only re-exports on the first sublayer filter change; every later one needs a refresh
  if (a.refresh) { for (const o of touched) a.refresh(o) } else refreshOwners(touched)
  return n
}

/** Ask each map service for a fresh picture, once per service. */
export function refreshOwners (owners: Set<any>): void {
  for (const o of owners) { try { if (typeof o.refresh === 'function') o.refresh() } catch (e) { /* ignore */ } }
}

/** Put every target's own filter back, on the layer and on its view. */
export function restoreAll (targets: TimeTarget[], widgetId: string, layerViews?: Map<string, any>): void {
  const touched = new Set<any>()
  for (const t of targets) {
    if (!t.target) continue
    const lv = layerViews ? layerViews.get(t.key) : null
    if (lv && lv[VIEW_WHERE] !== undefined) { try { lv.filter = null } catch (e) { /* ignore */ } delete lv[VIEW_WHERE] }
    const bag = t.target[ORIG]
    if (!bag || !(widgetId in bag)) continue
    try { t.target.definitionExpression = bag[widgetId]; delete t.target[LAST]; if (t.kind === 'sublayer' && t.owner) touched.add(t.owner) } catch (e) { /* ignore */ }
    delete bag[widgetId]
  }
  refreshOwners(touched)
}

/** Show the one child of each year set that matches the date. */
export function applyYearSets (sets: YearSetTarget[], ms: number): void {
  for (const s of sets) {
    const keep = pickYearChild(s.children.filter(c => c.year != null).map(c => ({ key: c.key, year: c.year as number })), ms)
    for (const c of s.children) {
      if (c.year == null) continue
      try { c.layer.visible = c.key === keep } catch (e) { /* ignore */ }
    }
  }
}

export function restoreYearSets (sets: YearSetTarget[]): void {
  for (const s of sets) for (const c of s.children) { try { c.layer.visible = c.wasVisible } catch (e) { /* ignore */ } }
}

/* ------------------------------------------------------------------ range from data */

export interface Stat { min: number | null, max: number | null }

/**
 * Oldest and newest date across the targets, from server-side statistics so no
 * features are pulled down. A layer that cannot answer is skipped.
 */
export async function dataRange (targets: TimeTarget[], queryStats: (target: TimeTarget, field: string) => Promise<Stat>, timeoutMs: number = 6000, window?: YearWindow): Promise<{ start: number, end: number }> {
  const jobs: Array<Promise<Stat | null>> = []
  for (const t of targets) {
    jobs.push(withTimeout(queryStats(t, t.pick.start), timeoutMs).catch(() => null))
    if (t.pick.end) jobs.push(withTimeout(queryStats(t, t.pick.end), timeoutMs).catch(() => null))
  }
  const stats = await Promise.all(jobs)
  const samples: Array<number | null> = []
  for (const s of stats) if (s) samples.push(s.min, s.max)
  return fitRange(NaN, NaN, samples, window)
}

/** Runs min/max statistics through the SDK query API on a layer or sublayer. */
export async function sdkStats (target: TimeTarget, field: string, widgetId: string, window?: YearWindow): Promise<Stat> {
  const f = safeField(field)
  if (!f) return { min: null, max: null }
  const base = originalWhere(target.target, widgetId) || '1=1'
  const first = await statsWhere(target, f, base)
  const { min, max } = yearWindow(window)
  // a placeholder max (2999, 9999) or min (1899) hides the real edge: ask once more inside the window
  let out = first
  if (typeof first.max === 'number' && !isRealisticDate(first.max, window)) {
    const again = await statsWhere(target, field, `(${base}) AND ${f} < TIMESTAMP '${max + 1}-01-01 00:00:00'`).catch(() => first)
    out = { ...out, max: again.max }
  }
  if (typeof first.min === 'number' && !isRealisticDate(first.min, window)) {
    const again = await statsWhere(target, field, `(${base}) AND ${f} >= TIMESTAMP '${min}-01-01 00:00:00'`).catch(() => first)
    out = { ...out, min: again.min }
  }
  return out
}

async function statsWhere (target: TimeTarget, field: string, where: string): Promise<Stat> {
  const obj = target.target
  if (!obj || typeof obj.queryFeatures !== 'function' || typeof obj.createQuery !== 'function') return { min: null, max: null }
  const q = obj.createQuery()
  q.where = where
  q.outStatistics = [
    { statisticType: 'min', onStatisticField: field, outStatisticFieldName: 'tm_min' },
    { statisticType: 'max', onStatisticField: field, outStatisticFieldName: 'tm_max' }
  ]
  q.returnGeometry = false
  // epoch ms can be negative: 1880 annexations are before 1970
  const num = (v: any): number | null => { if (v == null || v === '') return null; const n = typeof v === 'string' ? Date.parse(v) : Number(v); return isFinite(n) ? n : null }
  try {
    const r = await obj.queryFeatures(q)
    const a = r && r.features && r.features[0] && r.features[0].attributes
    if (a) {
      // servers differ in the case of the statistic name (TM_MIN on some databases)
      let mn: any = null; let mx: any = null
      for (const k of Object.keys(a)) { const lk = k.toLowerCase(); if (lk === 'tm_min') mn = a[k]; else if (lk === 'tm_max') mx = a[k] }
      const out = { min: num(mn), max: num(mx) }
      if (out.min !== null || out.max !== null) return out
      statsNote(target, field, 'statistics answered without a usable min or max: ' + JSON.stringify(a).slice(0, 200))
    } else statsNote(target, field, 'statistics answered with no record')
  } catch (e) { statsNote(target, field, 'statistics failed: ' + String((e && (e as any).message) || e)) }
  const edge = async (desc: boolean): Promise<number | null> => {
    const q2 = obj.createQuery()
    q2.where = `(${where}) AND ${field} IS NOT NULL`
    q2.outFields = [field]; q2.returnGeometry = false; q2.num = 1
    q2.orderByFields = [`${field} ${desc ? 'DESC' : 'ASC'}`]
    const r2 = await obj.queryFeatures(q2)
    const a2 = r2 && r2.features && r2.features[0] && r2.features[0].attributes
    if (!a2) return null
    for (const k of Object.keys(a2)) if (k.toLowerCase() === field.toLowerCase()) return num(a2[k])
    return null
  }
  try { const [mn, mx] = await Promise.all([edge(false), edge(true)]); if (mn === null && mx === null) statsNote(target, field, 'ordered reads answered without a date'); return { min: mn, max: mx } } catch (e) { statsNote(target, field, 'ordered reads failed: ' + String((e && (e as any).message) || e)); return { min: null, max: null } }
}

/** The last reason a range read came up empty, per layer, for the panel and the console. */
export const statsNotes: Map<string, string> = new Map()
function statsNote (target: TimeTarget, field: string, why: string): void {
  statsNotes.set(target.key, `${target.title} (${field}): ${why}`)
  try { console.warn('[time-machine] range read', target.title, field, why) } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ what changed */

/**
 * Object ids of features dated inside (from, to] on one feature layer, on top of the
 * layer's own filter, for a brief highlight. Empty when the layer cannot answer or the
 * change is too big to be useful (more than `cap` features).
 */
export async function newSince (target: TimeTarget, widgetId: string, from: number, to: number, g: Granularity, cap: number = 2500, timeoutMs: number = 4000): Promise<number[]> {
  const obj = target.target
  if (!obj || target.kind !== 'layer' || typeof obj.queryObjectIds !== 'function' || typeof obj.createQuery !== 'function') return []
  // the unit after the previous position up to the new one
  const ours = buildWhere({ pick: target.pick, g, from: addUnits(startOfUnit(from, g), 1, g), to, semantic: 'between' })
  if (!ours) return []
  try {
    const q = obj.createQuery()
    q.where = combineWhere(originalWhere(obj, widgetId), ours) || ours
    q.returnGeometry = false
    const ids: any = await withTimeout(obj.queryObjectIds(q), timeoutMs)
    if (!Array.isArray(ids) || ids.length > cap) return []
    return ids
  } catch (e) { return [] }
}

/* ------------------------------------------------------------------ activity counts */

/**
 * Counts per year or month for one target, from one grouped statistics request
 * (EXTRACT on the date field, standardized SQL). When the service cannot group by an
 * expression the bars fall back to a small number of count requests, one per bucket.
 * Never throws; an empty map means "nothing known".
 */
export async function activityCounts (target: TimeTarget, unit: ActivityUnit, widgetId: string, bars: ActivityBar[], domainStart: number, g: Granularity, timeoutMs: number = 8000): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const obj = target.target
  const field = safeField(target.pick.start)
  if (!obj || !field || typeof obj.createQuery !== 'function') return out
  const base = originalWhere(obj, widgetId) || '1=1'
  if (typeof obj.queryFeatures === 'function') {
    try {
      const q = obj.createQuery()
      q.where = base
      q.returnGeometry = false
      q.outStatistics = [{ statisticType: 'count', onStatisticField: field, outStatisticFieldName: 'tm_n' }]
      q.groupByFieldsForStatistics = unit === 'year' ? [`EXTRACT(YEAR FROM ${field})`] : [`EXTRACT(YEAR FROM ${field})`, `EXTRACT(MONTH FROM ${field})`]
      const r: any = await withTimeout(obj.queryFeatures(q), timeoutMs)
      const feats: any[] = r && Array.isArray(r.features) ? r.features : []
      for (const f of feats) {
        const at = f && f.attributes ? f.attributes : {}
        let n = NaN; let year = NaN; let month = NaN
        for (const k of Object.keys(at)) {
          const v = Number(at[k])
          if (!isFinite(v)) continue
          if (k.toLowerCase() === 'tm_n') n = v
          else if (v > 31) year = v
          else month = v
        }
        if (!isFinite(n) || !isFinite(year)) continue
        const key = unit === 'year' ? String(Math.round(year)) : `${Math.round(year)}-${String(Math.round(isFinite(month) ? month : 1)).padStart(2, '0')}`
        out.set(key, (out.get(key) || 0) + n)
      }
      if (feats.length) return out
    } catch (e) { /* fall through to the bucket counts */ }
  }
  if (typeof obj.queryFeatureCount !== 'function' || bars.length > 40) return out
  const jobs = bars.map(async b => {
    const from = indexToDate(domainStart, b.from, g); const to = indexToDate(domainStart, b.to, g)
    const q = obj.createQuery()
    q.where = `(${base}) AND ${field} >= ${sqlTimestamp(from)} AND ${field} < ${sqlTimestamp(to)}`
    try { const n = await withTimeout(obj.queryFeatureCount(q), timeoutMs); if (typeof n === 'number') out.set(b.key, n) } catch (e) { /* skip */ }
  })
  await Promise.all(jobs)
  return out
}
