/**
 * Time Machine - pure date logic. No esri, no jimu, no DOM, so every function here
 * runs in plain Node under the test suite.
 *
 * Dates are millisecond timestamps throughout. All rounding is done in UTC so a
 * day boundary is the same on every machine and matches what a feature service
 * stores (esriFieldTypeDate values are UTC epoch milliseconds).
 */
import type { Granularity, LayerRule } from '../../config'

export interface FieldInfo { name: string, type?: string, alias?: string, /** editor tracking (created or last edited): a poor story date */ tracking?: boolean }

/** Editor tracking names, matched when a service does not say which fields track edits. */
const TRACKING_NAMES = ['created_date', 'creationdate', 'creation_date', 'create_date', 'datecreated', 'date_created', 'last_edited_date', 'edit_date', 'editdate', 'last_edit_date', 'lasteditdate', 'date_modified', 'modified_date', 'modifieddate', 'gdb_from_date', 'gdb_to_date']

const END_LIKE = /clos|end|expir|complet|resolv|retir|remov|to_date|todate|finish|until/i

export function isTrackingName (name: string): boolean { return TRACKING_NAMES.indexOf(String(name || '').toLowerCase()) >= 0 }

/** Mark the editor tracking fields from a layer's editFieldsInfo, or by name. */
export function markTracking (fields: FieldInfo[], editFieldsInfo?: any): FieldInfo[] {
  const named = new Set<string>()
  if (editFieldsInfo) for (const k of ['creationDateField', 'editDateField']) { const v = editFieldsInfo[k]; if (v) named.add(String(v).toLowerCase()) }
  return fields.map(f => ({ ...f, tracking: named.has(f.name.toLowerCase()) || isTrackingName(f.name) }))
}

/** Story dates first, editor tracking last. */
export function orderDateFields (fields: FieldInfo[]): FieldInfo[] {
  const ds = dateFields(fields)
  return [...ds.filter(f => !f.tracking), ...ds.filter(f => f.tracking)]
}

/** Every type name a date field can carry across the SDK, REST and EB data sources. */
const DATE_TYPES = ['date', 'esriFieldTypeDate', 'date-only', 'esriFieldTypeDateOnly', 'timestamp-offset', 'esriFieldTypeTimestampOffset']

export function isDateField (f: FieldInfo): boolean {
  return !!f && DATE_TYPES.indexOf(String(f.type || '')) >= 0
}

export function dateFields (fields: FieldInfo[] | null | undefined): FieldInfo[] {
  return (fields || []).filter(isDateField)
}

/** Pairs that mark a span (a thing that starts and later ends). Lower-case, checked as
 *  whole names first and then as prefixes so "PERMIT_START"/"PERMIT_END" also pair. */
const SPAN_PAIRS: Array<[string, string]> = [
  ['start_date', 'end_date'], ['startdate', 'enddate'], ['start', 'end'],
  ['begin_date', 'end_date'], ['begindate', 'enddate'], ['begin', 'end'],
  ['from_date', 'to_date'], ['fromdate', 'todate'], ['from', 'to'],
  ['issue_date', 'expire_date'], ['issued', 'expired'], ['issue_date', 'expiration_date'], ['issued_date', 'expiration_date'],
  ['open_date', 'close_date'], ['opened', 'closed'], ['open', 'close'],
  ['install_date', 'remove_date'], ['installed', 'removed'],
  ['effective_date', 'retire_date'], ['effective', 'retired'],
  ['created_date', 'retired_date'], ['created', 'retired']
]

export interface FieldPick {
  start: string
  end?: string
  /** True when the field holds a date with no time (esriFieldTypeDateOnly): the clause then uses DATE literals. */
  startDateOnly?: boolean
  endDateOnly?: boolean
}

const DATE_ONLY_TYPES = ['date-only', 'esriFieldTypeDateOnly']
export function isDateOnlyField (f: FieldInfo | undefined): boolean { return !!f && DATE_ONLY_TYPES.indexOf(String(f.type || '')) >= 0 }

/** Adds the date-only flags to a pick from the field list it came from. */
export function withPickTypes (pick: FieldPick | null, fields: FieldInfo[]): FieldPick | null {
  if (!pick) return null
  const find = (n: string): FieldInfo | undefined => fields.find(f => f.name.toLowerCase() === String(n || '').toLowerCase())
  const out: FieldPick = { start: pick.start }
  if (pick.end) out.end = pick.end
  if (isDateOnlyField(find(pick.start))) out.startDateOnly = true
  if (pick.end && isDateOnlyField(find(pick.end))) out.endDateOnly = true
  return out
}

/** Find a start/end pair among the date fields, or null. */
export function pickSpan (fields: FieldInfo[]): FieldPick | null {
  const ds = dateFields(fields)
  if (ds.length < 2) return null
  const lower = ds.map(f => ({ n: f.name, l: f.name.toLowerCase() }))
  for (const [a, b] of SPAN_PAIRS) {
    const sa = lower.find(x => x.l === a)
    const sb = lower.find(x => x.l === b)
    if (sa && sb) return { start: sa.n, end: sb.n }
  }
  // prefix form: xxx_start / xxx_end, xxx_from / xxx_to
  for (const [a, b] of SPAN_PAIRS) {
    for (const sa of lower) {
      if (!sa.l.endsWith('_' + a) && !sa.l.endsWith(a)) continue
      const stem = sa.l.slice(0, sa.l.length - a.length)
      const sb = lower.find(x => x !== sa && x.l === stem + b)
      if (sb) return { start: sa.n, end: sb.n }
    }
  }
  return null
}

/**
 * Choose the date field a layer follows. Order: an exact match in the preferred list,
 * then a preferred name contained in the field name, then a start/end span, then the
 * first date field. Returns null when the layer has no date field at all.
 */
export function pickDateField (fields: FieldInfo[], preferred: string[]): FieldPick | null {
  const all = dateFields(fields)
  if (!all.length) return null
  // a builder's exact preference wins, tracking or not
  const prefAll = (preferred || []).map(p => String(p || '').toLowerCase()).filter(Boolean)
  for (const p of prefAll) { const hit = all.find(f => f.name.toLowerCase() === p); if (hit) return { start: hit.name } }
  // editor tracking dates only when nothing else is dated...
  const story = all.filter(f => !f.tracking)
  // ...or when the only other dates are closing dates: then created + closed is a span (Report a Concern)
  const creation = all.find(f => f.tracking && /creat/i.test(f.name))
  if (creation && story.length && story.every(f => END_LIKE.test(f.name))) return { start: creation.name, end: story[0].name }
  const ds = story.length ? story : all
  const pref = (preferred || []).map(p => String(p || '').toLowerCase()).filter(Boolean)
  for (const p of pref) {
    const hit = ds.find(f => f.name.toLowerCase() === p)
    if (hit) return { start: hit.name }
  }
  for (const p of pref) {
    const hit = ds.find(f => f.name.toLowerCase().indexOf(p) >= 0)
    if (hit) return { start: hit.name }
  }
  const span = pickSpan(ds)
  if (span) return span
  return { start: ds[0].name }
}

/** Apply a builder rule on top of the automatic choice. */
export function resolveFieldPick (fields: FieldInfo[], preferred: string[], rule: LayerRule | null | undefined): FieldPick | null {
  if (rule) {
    if (rule.mode === 'off') return null
    // a rule's field names must be plain identifiers, or the rule is ignored
    const s = rule.startField && safeField(rule.startField) ? rule.startField : ''
    const e = rule.endField && safeField(rule.endField) ? rule.endField : ''
    if (rule.mode === 'field' && s) return withPickTypes({ start: s }, fields)
    if (rule.mode === 'span' && s) return withPickTypes({ start: s, end: e || undefined }, fields)
  }
  return withPickTypes(pickDateField(fields, preferred), fields)
}

/** Match a rule to a layer by id, then by sublayer id, then by title (case-insensitive). */
export function findRule (rules: LayerRule[] | null | undefined, layerId: string, title: string): LayerRule | null {
  if (!rules || !rules.length) return null
  const id = String(layerId || '').trim().toLowerCase()
  const byId = rules.find(r => r.layerId && String(r.layerId).trim().toLowerCase() === id)
  if (byId) return byId
  const t = (title || '').trim().toLowerCase()
  if (!t) return null
  // a rule written by title, or a picked layer whose id changed when the map was saved again: match the title
  return rules.find(r => !r.layerId && (r.title || '').trim().toLowerCase() === t) ||
    rules.find(r => !!r.layerId && (r.title || '').trim().toLowerCase() === t && !rules.some(o => o !== r && o.layerId && String(o.layerId).trim().toLowerCase() === id)) || null
}

/* ------------------------------------------------------------------ rounding */

const DAY = 86400000

export function startOfUnit (ms: number, g: Granularity): number {
  const d = new Date(ms)
  if (g === 'year') return Date.UTC(d.getUTCFullYear(), 0, 1)
  if (g === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Last millisecond of the unit that contains ms. */
export function endOfUnit (ms: number, g: Granularity): number {
  return addUnits(startOfUnit(ms, g), 1, g) - 1
}

export function addUnits (ms: number, n: number, g: Granularity): number {
  const d = new Date(ms)
  if (g === 'year') return Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate())
  if (g === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate())
  return ms + n * DAY
}

/** Number of whole units between a and b (a <= b), used for slider positions. */
export function unitsBetween (a: number, b: number, g: Granularity): number {
  const da = new Date(startOfUnit(a, g))
  const db = new Date(startOfUnit(b, g))
  if (g === 'year') return db.getUTCFullYear() - da.getUTCFullYear()
  if (g === 'month') return (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth())
  return Math.round((db.getTime() - da.getTime()) / DAY)
}

/** Slider position (0..n) to a date, and back. */
export function indexToDate (start: number, index: number, g: Granularity): number {
  return addUnits(startOfUnit(start, g), Math.max(0, Math.round(index)), g)
}
export function dateToIndex (start: number, ms: number, g: Granularity): number {
  return Math.max(0, unitsBetween(start, ms, g))
}

export function clamp (v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/* ------------------------------------------------------------------ parsing */

/** yyyy-mm-dd (or yyyy-mm, yyyy) to UTC ms; NaN when it does not parse. */
export function parseIsoDate (s: string | null | undefined): number {
  const m = /^\s*(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?\s*$/.exec(String(s || ''))
  if (!m) return NaN
  const y = Number(m[1]); const mo = m[2] ? Number(m[2]) - 1 : 0; const d = m[3] ? Number(m[3]) : 1
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return NaN
  const ms = Date.UTC(y, mo, d)
  const back = new Date(ms)
  if (back.getUTCMonth() !== mo || back.getUTCDate() !== d) return NaN
  return ms
}

export function toIsoDate (ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => (n < 10 ? '0' : '') + n
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Human label for the slider readout: "14 Mar 2024", "Mar 2024", "2024". */
export function formatDate (ms: number, g: Granularity): string {
  const d = new Date(ms)
  if (!isFinite(ms)) return ''
  if (g === 'year') return String(d.getUTCFullYear())
  if (g === 'month') return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/* ------------------------------------------------------------------ SQL */

/** TIMESTAMP literal in the form every ArcGIS service accepts under standardized queries. */
export function sqlTimestamp (ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => (n < 10 ? '0' : '') + n
  return `TIMESTAMP '${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}'`
}

/** DATE literal for date-only fields, which reject TIMESTAMP on hosted services. */
export function sqlDate (ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => (n < 10 ? '0' : '') + n
  return `DATE '${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}'`
}

/** Field names go in the clause bare. Anything that is not a plain identifier is refused
 *  so a builder-typed name can never inject SQL. */
export function safeField (name: string): string | null {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name || '') ? name : null
}

export interface WhereInput {
  pick: FieldPick
  g: Granularity
  /** Single date, or the low end of a range. */
  from: number
  /** High end of a range; equal to from for a single date. */
  to: number
  /** 'asof': everything that existed by the date. 'between': only things dated inside the range. */
  semantic: 'asof' | 'between'
}

/**
 * The definition expression for one layer.
 *
 *  single date, one field   FIELD <= end of that day
 *  single date, span        START <= end of day AND (END IS NULL OR END >= start of day)
 *  range, one field         FIELD >= start of from AND FIELD <= end of to
 *  range, span              START <= end of to AND (END IS NULL OR END >= start of from)
 *                           (anything alive at any point inside the range)
 *
 * Returns null when a field name is unsafe.
 */
export function buildWhere (w: WhereInput): string | null {
  const start = safeField(w.pick.start)
  if (!start) return null
  const lo = startOfUnit(w.from, w.g)
  const hi = endOfUnit(w.to, w.g)
  const end = w.pick.end ? safeField(w.pick.end) : null
  if (w.pick.end && !end) return null
  const sLit = (ms: number): string => (w.pick.startDateOnly ? sqlDate(ms) : sqlTimestamp(ms))
  const eLit = (ms: number): string => (w.pick.endDateOnly ? sqlDate(ms) : sqlTimestamp(ms))
  if (end) {
    return `${start} <= ${sLit(hi)} AND (${end} IS NULL OR ${end} >= ${eLit(lo)})`
  }
  if (w.semantic === 'between') return `${start} >= ${sLit(lo)} AND ${start} <= ${sLit(hi)}`
  return `${start} <= ${sLit(hi)}`
}

/** The layer's own filter stays in force; ours is ANDed on. */
export function combineWhere (original: string | null | undefined, ours: string | null): string | null {
  const o = (original || '').trim()
  if (!ours) return o || null
  if (!o || o === '1=1') return ours
  return `(${o}) AND (${ours})`
}

/* ------------------------------------------------------------------ year sets */

/** The four-digit year in a layer title ("Aerials 2019", "2021 Imagery (spring)"). */
export function yearFromTitle (title: string): number | null {
  const m = /(?:^|\D)((?:18|19|20)\d{2})(?:\D|$)/.exec(String(title || ''))
  return m ? Number(m[1]) : null
}

export interface YearChild { key: string, year: number }

/** The child to show for a date: the latest year on or before it, else the earliest year. */
export function pickYearChild (children: YearChild[], ms: number): string | null {
  const dated = children.filter(c => isFinite(c.year))
  if (!dated.length) return null
  const y = new Date(ms).getUTCFullYear()
  const before = dated.filter(c => c.year <= y).sort((a, b) => b.year - a.year)
  if (before.length) return before[0].key
  return dated.slice().sort((a, b) => a.year - b.year)[0].key
}

/* ------------------------------------------------------------------ range fitting */

/** Grow [start, end] to hold every finite value; a missing side stays as given. */
/** Years the builder allows data to push the range to. Defaults: 1800 to next year. */
export interface YearWindow { minYear?: number, maxYear?: number }

export function yearWindow (w: YearWindow | undefined, now: number = Date.now()): { min: number, max: number } {
  const nextYear = new Date(now).getUTCFullYear() + 1
  const min = w && typeof w.minYear === 'number' && isFinite(w.minYear) ? w.minYear : 1800
  const max = w && typeof w.maxYear === 'number' && isFinite(w.maxYear) ? w.maxYear : nextYear
  return max >= min ? { min, max } : { min: max, max: min }
}

/** Dates outside the window are placeholders (9999, 2999, 1899, 1900 epoch defaults), not real data. */
export function isRealisticDate (ms: number, w?: YearWindow, now: number = Date.now()): boolean {
  if (typeof ms !== 'number' || !isFinite(ms)) return false
  const y = new Date(ms).getUTCFullYear()
  const { min, max } = yearWindow(w, now)
  return y >= min && y <= max
}

export function fitRange (start: number, end: number, samples: Array<number | null | undefined>, w?: YearWindow, now: number = Date.now()): { start: number, end: number } {
  let s = start; let e = end
  for (const v of samples) {
    if (typeof v !== 'number' || !isFinite(v) || !isRealisticDate(v, w, now)) continue
    if (!isFinite(s) || v < s) s = v
    if (!isFinite(e) || v > e) e = v
  }
  return { start: s, end: e }
}

/** Slider tick labels: at most `max` evenly spaced positions, first and last always in. */
export function tickIndexes (count: number, max: number): number[] {
  if (count <= 0) return [0]
  if (count + 1 <= max) return Array.from({ length: count + 1 }, (_, i) => i)
  const out: number[] = []
  const step = count / (max - 1)
  for (let i = 0; i < max; i++) out.push(Math.round(i * step))
  return out.filter((v, i, a) => a.indexOf(v) === i)
}

/* ------------------------------------------------------------------ records and URLs */

/** Any value a record can carry for a date: epoch ms, ISO text, or a Date. NaN otherwise. */
export function coerceDate (v: any): number {
  if (v == null || v === '') return NaN
  if (typeof v === 'number') return isFinite(v) ? v : NaN
  if (v instanceof Date) return v.getTime()
  const s = String(v).trim()
  const iso = parseIsoDate(s)
  if (isFinite(iso)) return iso
  const n = Number(s)
  if (isFinite(n) && n > 1e11) return n
  const p = Date.parse(s)
  return isFinite(p) ? p : NaN
}

/**
 * The date (and end date, for a span) carried by a feature or record. A named field
 * wins; otherwise the first attribute whose value looks like a date, with a second
 * one taken as the end when its name says so.
 */
export function readDateFromRecord (feature: any, field: string | null): { start: number, end: number } {
  const attrs: any = (feature && (feature.attributes || feature)) || {}
  if (field) {
    const key = Object.keys(attrs).find(k => k.toLowerCase() === field.toLowerCase())
    return { start: key ? coerceDate(attrs[key]) : NaN, end: NaN }
  }
  const hits: Array<{ name: string, ms: number }> = []
  for (const k of Object.keys(attrs)) {
    const v = attrs[k]
    if (typeof v === 'number' && !(v > 1e11)) continue // ids, counts, coordinates
    const ms = coerceDate(v)
    if (isFinite(ms) && ms > Date.UTC(1800, 0, 1) && ms < Date.UTC(2200, 0, 1)) hits.push({ name: k.toLowerCase(), ms })
  }
  if (!hits.length) return { start: NaN, end: NaN }
  const endHit = hits.find(h => /(end|expir|close|retire|remov|finish|to_?date)/.test(h.name))
  const startHit = hits.find(h => h !== endHit) || hits[0]
  return { start: startHit.ms, end: endHit && endHit !== startHit ? endHit.ms : NaN }
}

export interface UrlDate { mode: 'single' | 'range' | 'compare', a: number, b: number }

/** "2019-06-01" | "2019-06-01..2020-01-01" (range) | "2019-06-01~2020-01-01" (compare). */
export function parseUrlDate (raw: string | null | undefined): UrlDate | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const m = /^([^.~]+?)(?:(\.\.|~)([^.~]+))?$/.exec(s)
  if (!m) return null
  const a = parseIsoDate(m[1])
  if (!isFinite(a)) return null
  if (!m[2]) return { mode: 'single', a, b: a }
  const b = parseIsoDate(m[3])
  if (!isFinite(b)) return null
  return { mode: m[2] === '..' ? 'range' : 'compare', a, b }
}

export function formatUrlDate (mode: 'single' | 'range' | 'compare', a: number, b: number): string {
  if (mode === 'single') return toIsoDate(a)
  return toIsoDate(a) + (mode === 'range' ? '..' : '~') + toIsoDate(b)
}

/** Replace or add one query parameter on a URL string, leaving the hash in place. */
export function withUrlParam (url: string, key: string, value: string | null): string {
  const hashAt = url.indexOf('#')
  const hash = hashAt >= 0 ? url.slice(hashAt) : ''
  const base = hashAt >= 0 ? url.slice(0, hashAt) : url
  const qAt = base.indexOf('?')
  const path = qAt >= 0 ? base.slice(0, qAt) : base
  const pairs = (qAt >= 0 ? base.slice(qAt + 1) : '').split('&').filter(p => p && decodeURIComponent(p.split('=')[0]) !== key)
  if (value != null) pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value))
  return path + (pairs.length ? '?' + pairs.join('&') : '') + hash
}

export function readUrlParam (search: string, key: string): string | null {
  const q = search.charAt(0) === '?' ? search.slice(1) : search
  for (const p of q.split('&')) {
    const [k, v] = p.split('=')
    if (k && decodeURIComponent(k) === key) return decodeURIComponent((v || '').replace(/\+/g, ' '))
  }
  return null
}

/* ------------------------------------------------------------------ activity (how much happened when) */

export type ActivityUnit = 'year' | 'month'

/** One bar above the slider: slider indexes [from, to) and how many features fall in it. */
export interface ActivityBar { key: string, from: number, to: number, n: number }

/** Years when the range is long, months when it is short. Never finer than the slider step. */
export function activityUnit (start: number, end: number, g: Granularity): ActivityUnit {
  if (g === 'year') return 'year'
  return unitsBetween(start, end, 'year') > 4 ? 'year' : 'month'
}

/** Key of the bucket a date falls in: "2019" or "2019-03". */
export function activityKey (ms: number, unit: ActivityUnit): string {
  const d = new Date(ms)
  const y = String(d.getUTCFullYear())
  return unit === 'year' ? y : `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Sum per-layer counts into bars placed on the slider index axis, in order. */
export function activityBars (start: number, end: number, g: Granularity, unit: ActivityUnit, perLayer: Array<Map<string, number>>): ActivityBar[] {
  const total = new Map<string, number>()
  for (const m of perLayer) m.forEach((n, k) => { total.set(k, (total.get(k) || 0) + (isFinite(n) ? n : 0)) })
  const last = unitsBetween(start, end, g)
  const out: ActivityBar[] = []
  let cursor = startOfUnit(start, unit)
  let guard = 0
  while (cursor <= end && guard++ < 5000) {
    const next = addUnits(cursor, 1, unit)
    const from = clamp(dateToIndex(start, cursor, g), 0, last)
    const to = clamp(dateToIndex(start, next, g), 0, last)
    const key = activityKey(cursor, unit)
    out.push({ key, from, to: Math.max(to, from + 1), n: total.get(key) || 0 })
    cursor = next
  }
  return out
}

/** Slider index of the next (dir 1) or previous (dir -1) bar with anything in it, or null. */
export function nextActive (bars: ActivityBar[], index: number, dir: 1 | -1): number | null {
  if (dir > 0) { for (const b of bars) if (b.n > 0 && b.from > index) return b.from } else { for (let i = bars.length - 1; i >= 0; i--) { const b = bars[i]; if (b.n > 0 && b.from < index) return b.from } }
  return null
}

/** The bar with the most in it, for the screen reader summary. */
export function busiestBar (bars: ActivityBar[]): ActivityBar | null {
  let best: ActivityBar | null = null
  for (const b of bars) if (b.n > 0 && (!best || b.n > best.n)) best = b
  return best
}
