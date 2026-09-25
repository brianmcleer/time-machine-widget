/**
 * Time Machine - the client side date cache.
 *
 * One request per feature layer when the widget opens (object id and the date field
 * or fields, no geometry, paged), and from then on the range, the activity bars, the
 * counts beside each layer and the "what changed" ids are all worked out in the browser
 * with no further requests. Layers with more features than the builder's cap, and map
 * service sublayers, keep using the server.
 *
 * Pure functions over plain arrays; the loader is duck-typed against the SDK query API.
 */
import type { TimeTarget } from './layerEngine'
import { originalWhere, withTimeout } from './layerEngine'
import { activityKey, coerceDate, endOfUnit, startOfUnit, isRealisticDate, type ActivityUnit, type YearWindow } from './timeMath'
import type { Granularity } from '../../config'

export interface DateCache {
  /** Object ids, in the order the values below are stored. */
  ids: number[]
  /** Start date per feature in epoch ms; NaN when the record has none. */
  starts: number[]
  /** End date per feature for a span pick; NaN for open ended or when the pick has no end. */
  ends: number[] | null
  /** True when every record was read; false when the cap stopped the read (cache unusable). */
  complete: boolean
  total: number
}

export interface LoadOptions {
  widgetId: string
  /** Stop and give up above this many records. */
  max: number
  pageSize?: number
  timeoutMs?: number
}

/** Reads the date values of a layer. Resolves null when the layer cannot be read or is over the cap. */
export async function loadDateCache (t: TimeTarget, o: LoadOptions): Promise<DateCache | null> {
  const obj = t.target
  if (!obj || t.kind !== 'layer' || typeof obj.queryFeatures !== 'function' || typeof obj.createQuery !== 'function') return null
  const oidField: string = obj.objectIdField || 'OBJECTID'
  const fields = [oidField, t.pick.start, ...(t.pick.end ? [t.pick.end] : [])]
  const page = Math.max(100, o.pageSize || 2000)
  const timeout = o.timeoutMs || 20000
  const ids: number[] = []; const starts: number[] = []; const ends: number[] | null = t.pick.end ? [] : null
  const caps = obj.capabilities && obj.capabilities.query
  if (caps && (caps.supportsPagination === false || caps.supportsOrderBy === false)) return null
  let start = 0
  let firstOfPrev = NaN
  for (let guard = 0; guard < 1000; guard++) {
    const q = obj.createQuery()
    q.where = originalWhere(obj, o.widgetId) || '1=1'
    q.outFields = fields
    q.returnGeometry = false
    q.start = start
    q.num = page
    q.orderByFields = [oidField]
    let r: any
    try { r = await withTimeout(obj.queryFeatures(q), timeout) } catch (e) { return null }
    const feats: any[] = r && Array.isArray(r.features) ? r.features : []
    // a service that ignores the offset hands the same page back: give up rather than loop
    const firstId = feats.length ? Number(feats[0].attributes && feats[0].attributes[oidField]) : NaN
    if (start > 0 && isFinite(firstId) && firstId === firstOfPrev) return null
    firstOfPrev = firstId
    for (const f of feats) {
      const at = f && f.attributes ? f.attributes : {}
      ids.push(Number(at[oidField]))
      starts.push(coerceDate(at[t.pick.start]))
      if (ends) ends.push(coerceDate(at[t.pick.end as string]))
    }
    if (ids.length > o.max) return null
    const more = !!(r && r.exceededTransferLimit) && feats.length > 0
    if (!more) break
    start += feats.length
  }
  return { ids, starts, ends, complete: true, total: ids.length }
}

/** Oldest and newest start (and end) dates, NaN when none. */
export function cacheRange (c: DateCache, w?: YearWindow): { start: number, end: number } {
  let s = NaN; let e = NaN
  // placeholder dates (9999, 2999, 1899) never set the edge, as with the server read
  const take = (v: number): void => { if (!isFinite(v) || !isRealisticDate(v, w)) return; if (!isFinite(s) || v < s) s = v; if (!isFinite(e) || v > e) e = v }
  for (const v of c.starts) take(v)
  if (c.ends) for (const v of c.ends) take(v)
  return { start: s, end: e }
}

/** How many features are on the map at a date (as of) or inside a range (between), the same rules as buildWhere. */
export function cacheCount (c: DateCache, g: Granularity, from: number, to: number, semantic: 'asof' | 'between'): number {
  const lo = startOfUnit(from, g); const hi = endOfUnit(to, g)
  let n = 0
  for (let i = 0; i < c.starts.length; i++) {
    const s = c.starts[i]
    if (!isFinite(s)) continue
    if (c.ends) {
      const e = c.ends[i]
      if (s <= hi && (!isFinite(e) || e >= lo)) n++
    } else if (semantic === 'between') { if (s >= lo && s <= hi) n++ } else if (s <= hi) n++
  }
  return n
}

/** Counts per year or month of the start date. */
export function cacheActivity (c: DateCache, unit: ActivityUnit): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of c.starts) { if (!isFinite(s)) continue; const k = activityKey(s, unit); out.set(k, (out.get(k) || 0) + 1) }
  return out
}

/** Object ids whose start date falls inside [from, to], for the change glow. */
export function cacheIdsBetween (c: DateCache, from: number, to: number, cap: number = 2500): number[] {
  const out: number[] = []
  for (let i = 0; i < c.starts.length; i++) { const s = c.starts[i]; if (isFinite(s) && s >= from && s <= to) { out.push(c.ids[i]); if (out.length > cap) return [] } }
  return out
}
