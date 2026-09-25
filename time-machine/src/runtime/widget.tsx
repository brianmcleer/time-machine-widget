/** @jsx jsx */
/**
 * Time Machine - one date slider that drives every dated layer in the map.
 * Author: Brian McLeer, City of Grand Junction
 *
 * Feature layers, hosted layers and map image sublayers with a date field get a
 * definition expression for the chosen date (or range); group layers configured as
 * year sets switch to the matching snapshot; Compare mode puts two dates behind an
 * <arcgis-swipe> divider. Nothing is written anywhere: the filter lives in this
 * browser tab and is put back when the widget closes.
 */
import { React, jsx, css, WidgetState, loadArcGISJSAPIModules, type AllWidgetProps } from 'jimu-core'
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis'
import { Button, Checkbox, Loading, LoadingType, Select, Option, TextInput, TextArea, NumericInput, WidgetPlaceholder, Alert } from 'jimu-ui'
import { CalciteIcon, CalciteSlider } from 'calcite-components'
// Registers <arcgis-swipe> through Experience Builder's shared bundle (nothing is bundled here).
import 'arcgis-map-components'
import Collection from 'esri/core/Collection'
import * as reactiveUtils from 'esri/core/reactiveUtils'
import esriRequest from 'esri/request'
import { type IMConfig, type Config, type TimeMode, type Granularity, CONFIG_DEFAULTS } from '../config'
import defaultMessages from './translations/default'
import HelpPopup from './components/HelpPopup'
import FirstRunHint from './components/FirstRunHint'
import { buildHelpSections, type HelpFeatures } from './helpSections'
import { useTokens } from './theme'
import { beacon } from '../shared/beacon'
import type { BeaconHandle } from '../shared/beacon'
import {
  parseIsoDate, toIsoDate, formatDate, startOfUnit, unitsBetween, indexToDate, dateToIndex, clamp, tickIndexes,
  parseUrlDate, formatUrlDate, withUrlParam, readUrlParam,
  activityUnit, activityBars, nextActive, busiestBar, fitRange, endOfUnit, type ActivityBar, type ActivityUnit, type YearWindow
} from './lib/timeMath'
import {
  discoverTargets, discoverYearSets, applyTime, applyYearSets, restoreAll, restoreYearSets, dataRange, sdkStats,
  isTargetOn, visibilitySignature, activityCounts, newSince, statsNotes, originalWhere, type TimeTarget, type YearSetTarget, type SkipReason
} from './lib/layerEngine'
import { startCompare, stopCompare, updateCompareDates, type CompareSession } from './lib/compare'
import { sortedChapters, chapterStartingAt, chapterInEffect, nextChapter, prevChapter, bannerModel, chapterTarget, chapterGoToOptions, chapterHold as holdFor, presentKey, type ChapterAt } from './lib/presentation'
import { captureView, applyChapterLayers, restoreLayers, mergeUndo, applyChapterBasemap, showChapterFeature, readDraft, writeDraft, mergeChapters, storyXml, moveChapter, type LayerUndo, type PresenterState, type PresenterCommand } from './lib/story'
import { openPresenter, type PresenterHandle } from './lib/presenterWindow'
import { createSpotlight, type Spotlight } from './lib/spotlight'
import { createInk, createBlackout, createNarrator, narrationText, pace, addDwell, driftTarget, type Ink, type Blackout, type Narrator } from './lib/stage'
import { htmlDeck, autoChapterKeys, type DeckModel, type DeckSlide } from './lib/deck'
import { createRecorder, videoSupported, framesPerStep } from './lib/video'
import { resolveBrand, brandTokens } from './lib/brand'
import { loadDateCache, cacheRange, cacheCount, cacheActivity, cacheIdsBetween, type DateCache } from './lib/dateCache'
import type { Chapter } from '../config'
import { createBanner, type Banner } from './lib/presentBanner'

const widgetIcon = require('./assets/icons/icon.svg')
const { useState, useEffect, useRef, useCallback, useMemo } = React

const HELP_HINT_KEY = 'timeMachine.helpHintDismissed'
const readHelpHint = (id: string): boolean => { try { return window.localStorage.getItem(`${HELP_HINT_KEY}.${id}`) === '1' } catch (e) { return false } }
const writeHelpHint = (id: string): void => { try { window.localStorage.setItem(`${HELP_HINT_KEY}.${id}`, '1') } catch (e) { /* private browsing */ } }
const LAST_KEY = 'timeMachine.last'
const readLast = (id: string): { mode: TimeMode, a: string, b: string, g?: Granularity } | null => { try { const v = window.localStorage.getItem(`${LAST_KEY}.${id}`); return v ? JSON.parse(v) : null } catch (e) { return null } }
const writeLast = (id: string, v: { mode: TimeMode, a: string, b: string, g?: Granularity }): void => { try { window.localStorage.setItem(`${LAST_KEY}.${id}`, JSON.stringify(v)) } catch (e) { /* private browsing */ } }

type Props = AllWidgetProps<IMConfig> & { id: string, useMapWidgetIds?: string[], state?: string, stateProps?: { request?: { date: number, dateEnd?: number, nonce: number } } }

/** One plain object with every default filled in, read once per render. */
function readConfig (cfg: IMConfig | undefined): Config {
  const plain: any = cfg && typeof (cfg as any).asMutable === 'function' ? (cfg as any).asMutable({ deep: true }) : (cfg || {})
  const out: any = { ...CONFIG_DEFAULTS }
  for (const k of Object.keys(plain)) if (plain[k] !== undefined && plain[k] !== null) out[k] = plain[k]
  if (!Array.isArray(out.preferredFields) || !out.preferredFields.length) out.preferredFields = CONFIG_DEFAULTS.preferredFields
  for (const k of ['rules', 'yearSets', 'chapters']) if (!Array.isArray(out[k])) out[k] = []
  return out as Config
}

const addUnitsSafe = (ms: number, n: number, _g: Granularity): number => { const d = new Date(ms); d.setUTCFullYear(d.getUTCFullYear() + n); return d.getTime() }

/** Oldest and newest across several ranges, placeholders ignored. */
const fitRangeSafe = (ranges: Array<{ start: number, end: number }>, win: YearWindow): { start: number, end: number } => fitRange(NaN, NaN, ranges.flatMap(r => [r.start, r.end]), win)

const SPEEDS: Array<{ key: string, factor: number }> = [{ key: 'speedSlowest', factor: 4 }, { key: 'speedSlow', factor: 2 }, { key: 'speedNormal', factor: 1 }, { key: 'speedFast', factor: 0.4 }, { key: 'speedFastest', factor: 0.15 }]

const Widget: React.FC<Props> = (props) => {
  const cfg = useMemo(() => readConfig(props.config), [props.config])
  // the slider step: the builder's default, changed by the user when the builder allows it
  const [gran, setGran] = useState<Granularity>(cfg.granularity || 'day')
  const g: Granularity = gran
  const gRef = useRef<Granularity>(g); gRef.current = g
  // how many units one notch moves (every 5 years, every 3 months); the builder's default, changed in Advanced
  const [stepN, setStepN] = useState<number>(Math.max(1, Math.round(Number(cfg.stepSize) || 1)))
  const [advOpen, setAdvOpen] = useState(false)
  const [loop, setLoop] = useState(false)
  const loopRef = useRef(loop); loopRef.current = loop
  const [layerFilter, setLayerFilter] = useState('')
  const m: any = defaultMessages
  const t = useCallback((id: string, values?: Record<string, string>): string => {
    let s = String(m[id] ?? id)
    if (values) for (const k of Object.keys(values)) s = s.split(`{${k}}`).join(values[k])
    return s
  }, [])
  const tokensLive = useTokens()
  // useTokens builds a new object each render; effects keyed on it would rerun every second while presenting
  const tokensKey = JSON.stringify(tokensLive)
  const tokens = useMemo(() => tokensLive, [tokensKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // the presentation look: the builder's brand over the theme
  const brand = useMemo(() => resolveBrand(cfg, tokens), [cfg, tokens])
  const stageTokens = useMemo(() => brandTokens(tokens, brand), [tokens, brand])

  const [jmv, setJmv] = useState<JimuMapView | null>(null)
  const [loading, setLoading] = useState(false)
  const [targets, setTargets] = useState<TimeTarget[]>([])
  const [yearSets, setYearSets] = useState<YearSetTarget[]>([])
  const [domain, setDomain] = useState<{ start: number, end: number } | null>(null)
  const [mode, setMode] = useState<TimeMode>(cfg.defaultMode || 'single')
  const [a, setA] = useState(0)          // slider index of the single date, range start, or compare left
  const [b, setB] = useState(0)          // range end or compare right
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [position, setPosition] = useState(50)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [hintDismissed, setHintDismissed] = useState(() => readHelpHint(props.id))
  const [listOpen, setListOpen] = useState(true)
  const [dateText, setDateText] = useState<{ a: string, b: string }>({ a: '', b: '' })
  const [counts, setCounts] = useState<Record<string, number | null>>({})
  const [activity, setActivity] = useState<{ unit: ActivityUnit, bars: ActivityBar[], perLayer: Array<{ key: string, title: string, counts: Map<string, number> }> } | null>(null)
  const activitySeq = useRef(0)
  const [presenting, setPresenting] = useState(false)
  const [chapterHold, setChapterHold] = useState(false)
  const [draft, setDraft] = useState<Chapter[]>(() => readDraft(props.id))
  const [storyOpen, setStoryOpen] = useState(false)
  const [spotOn, setSpotOn] = useState(false)
  const [presenterOpen, setPresenterOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const [skipped, setSkipped] = useState<Array<{ title: string, reason: SkipReason }>>([])
  const [rangeNote, setRangeNote] = useState('')
  const [rangeSource, setRangeSource] = useState<'settings' | 'provisional' | 'data' | 'failed'>('provisional')
  const spotRef = useRef<Spotlight | null>(null)
  const presenterRef = useRef<PresenterHandle | null>(null)
  const layerUndoRef = useRef<LayerUndo[]>([])
  const basemapPrevRef = useRef<any>(null)
  const presentStartRef = useRef(0)
  const inkRef = useRef<Ink | null>(null)
  const blackRef = useRef<Blackout | null>(null)
  const narratorRef = useRef<Narrator | null>(null)
  const [inkOn, setInkOn] = useState(false)
  const [voiceOn, setVoiceOn] = useState(!!cfg.narrate)
  const voiceRef = useRef(voiceOn); voiceRef.current = voiceOn
  const dwellRef = useRef<Record<number, number>>({})
  const dwellSince = useRef<{ index: number, at: number } | null>(null)
  const uiComponentsRef = useRef<any>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const stampRef = useRef<HTMLDivElement | null>(null)
  const presentBtnRef = useRef<HTMLButtonElement | null>(null)
  const prevAppliedRef = useRef<number | null>(null)
  const highlightsRef = useRef<Array<{ remove: () => void }>>([])
  const highlightSeq = useRef(0)
  const thumbsRef = useRef<Map<number, string>>(new Map())
  const kioskApplied = useRef(false)

  const beaconRef = useRef<BeaconHandle | null>(null)
  const compareRef = useRef<CompareSession | null>(null)
  const applyTimer = useRef<any>(null)
  const playTimer = useRef<any>(null)
  const waitedRef = useRef(0)
  const layersWatch = useRef<any>(null)
  const discoverSeq = useRef(0)
  const targetsRef = useRef<TimeTarget[]>([])
  const yearSetsRef = useRef<YearSetTarget[]>([])
  const modeRef = useRef<TimeMode>(mode)
  const bannerRef = useRef<Banner | null>(null)
  const holdTimer = useRef<any>(null)
  const countSeq = useRef(0)
  const requestNonce = useRef<number | null>(null)
  const urlApplied = useRef(false)
  // chapters the slider can reach; hidden ones and ones outside the range stay out of the show
  const chapters: ChapterAt[] = useMemo(() => {
    const all = sortedChapters(mergeChapters(cfg.chapters, cfg.allowStoryDraft !== false ? draft : []).filter(c => !c || !c.hidden))
    const kept = domain ? all.filter(c => c.ms >= domain.start && c.ms <= endOfUnit(domain.end, g)) : all
    kept.forEach((c, i) => { c.index = i })
    return kept
  }, [cfg.chapters, draft, cfg.allowStoryDraft, domain, g])
  targetsRef.current = targets
  yearSetsRef.current = yearSets
  modeRef.current = mode

  const count = domain ? Math.max(1, unitsBetween(domain.start, domain.end, g)) : 1
  const dateA = domain ? indexToDate(domain.start, a, g) : Date.now()
  const dateB = domain ? indexToDate(domain.start, b, g) : Date.now()

  /* ---------------------------------------------------------------- lifecycle */

  const exitPresentRef = useRef(() => {})
  const changeModeRef = useRef((_m: TimeMode) => {})
  const pendingCompare = useRef(false)
  const refitRangeRef = useRef((_l: TimeTarget[], _s: number) => {})
  const deckBusyRef = useRef('')
  const stateRef = useRef<string | undefined>(props.state); stateRef.current = props.state
  const presentingRef = useRef(false)
  // feature layer views by target key: filtering on the view is instant, no server round trip
  const layerViewsRef = useRef<Map<string, any>>(new Map())
  const whereRef = useRef<Map<string, string | null>>(new Map())
  // client side date cache per target key (null: read failed or over the cap, so the server is used)
  const cacheRef = useRef<Map<string, DateCache | null>>(new Map())
  const [cacheTick, setCacheTick] = useState(0)
  const compareSeq = useRef(0)
  useEffect(() => {
    beaconRef.current = beacon.init(props)
    return () => {
      stopPlay()
      if (bannerRef.current) exitPresentRef.current()
      compareSeq.current++
      stopCompare(jmvRef.current && jmvRef.current.view, compareRef.current); compareRef.current = null
      if (cfg.restoreOnClose !== false) { restoreAll(targetsRef.current, props.id, layerViewsRef.current); restoreYearSets(yearSetsRef.current) }
      if (layersWatch.current) { try { layersWatch.current.remove() } catch (e) { /* ignore */ } }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const jmvRef = useRef<JimuMapView | null>(null)
  jmvRef.current = jmv
  const domainRef = useRef<{ start: number, end: number } | null>(null); domainRef.current = domain
  const aRef = useRef(0); aRef.current = a
  const bRef = useRef(0); bRef.current = b

  const onActiveViewChange = useCallback((view: JimuMapView): void => {
    if (bannerRef.current) exitPresentRef.current()
    compareSeq.current++
    stopCompare(jmvRef.current && jmvRef.current.view, compareRef.current); compareRef.current = null
    if (cfg.restoreOnClose !== false) { restoreAll(targetsRef.current, props.id, layerViewsRef.current); restoreYearSets(yearSetsRef.current) }
    layerViewsRef.current = new Map()
    cacheRef.current = new Map(); setCacheTick(t => t + 1)
    setJmv(view && view.view ? view : null)
  }, [cfg.restoreOnClose, props.id])

  /* Widget controller: Closed puts the map back, Opened applies the date again. */
  const prevState = useRef<string | undefined>(props.state)
  useEffect(() => {
    if (prevState.current === props.state) return
    prevState.current = props.state
    if (props.state === WidgetState.Closed) {
      // a presentation keeps running with the panel collapsed: the banner is the interface then
      if (presenting) return
      stopPlay()
      clearTimeout(applyTimer.current)
      compareSeq.current++
      stopCompare(jmv && jmv.view, compareRef.current); compareRef.current = null
      if (cfg.restoreOnClose !== false) { restoreAll(targets, props.id, layerViewsRef.current); restoreYearSets(yearSets); announce(t('statusRestored')) }
    } else if (props.state === WidgetState.Opened && domain) {
      scheduleApply(0)
      if (mode === 'compare') void beginCompare()
    }
  }, [props.state]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------------------------------------------------- discovery */

  const discover = useCallback(async (view: JimuMapView): Promise<void> => {
    if (cfg.rememberDate && cfg.allowStepChange !== false && !domainRef.current) {
      const last = readLast(props.id)
      if (last && (last.g === 'day' || last.g === 'month' || last.g === 'year') && last.g !== gRef.current) { gRef.current = last.g; setGran(last.g) }
    }
    const g = gRef.current
    const seq = ++discoverSeq.current
    const map: any = view.view.map
    setLoading(true); setError('')
    try {
      await (view.view as any).when?.()
      const skipped: Array<{ title: string, reason: SkipReason }> = []
      // esri/request carries the portal token, so secured services answer
      const fetchJson = async (u: string): Promise<any> => { const r = await esriRequest(u, { responseType: 'json' }); return r && r.data }
      let found = await discoverTargets(map, { config: cfg, widgetId: props.id, fetchJson, onSkip: (title, _key, reason) => { skipped.push({ title, reason }) } })
      if (seq !== discoverSeq.current) return
      let rulesMissed = false
      if (!found.length && cfg.autoDiscover === false && (cfg.rules || []).length) {
        // the picked layers belong to another map (a map widget with several maps): every dated layer of this map follows instead
        try { console.warn('[time-machine] no picked layer is in this map; picked ids', (cfg.rules || []).map((r: any) => `${r.layerId} (${r.title})`).join(', '), '; layers here', skipped.map(x => x.title).join(', ')) } catch (e) { /* ignore */ }
        skipped.length = 0
        found = await discoverTargets(map, { config: { ...cfg, autoDiscover: true, rules: [] }, widgetId: props.id, fetchJson, onSkip: (title, _key, reason) => { skipped.push({ title, reason }) } })
        if (seq !== discoverSeq.current) return
        rulesMissed = found.length > 0
      }
      setSkipped(skipped)
      const sets = discoverYearSets(map, cfg.yearSets)
      if (seq !== discoverSeq.current) return
      // keep the user's on/off choices across a re-discovery
      // a re-discovery keeps what the user chose: ticked or not, and which date field
      const prevOn: Record<string, { enabled: boolean, pick: TimeTarget['pick'] }> = {}
      for (const p of targetsRef.current) prevOn[p.key] = { enabled: p.enabled, pick: p.pick }
      for (const f of found) if (f.key in prevOn) { f.enabled = prevOn[f.key].enabled; if (!f.fixed && f.dateFields.some(d => d.name === prevOn[f.key].pick.start)) f.pick = prevOn[f.key].pick }

      let start = parseIsoDate(cfg.startDate)
      let end = parseIsoDate(cfg.endDate)
      if (!isFinite(end)) end = startOfUnit(Date.now(), g)
      // the panel opens at once on a provisional range; the statistics refit it (refitRange) as they land
      if (!isFinite(start)) start = domainRef.current ? domainRef.current.start : addUnitsSafe(end, -5, 'year')
      start = startOfUnit(start, g); end = startOfUnit(end, g)
      if (end < start) { const x = start; start = end; end = x }
      // one flat year at minimum keeps the slider usable on a single-date data set
      if (unitsBetween(start, end, g) < 1) end = indexToDate(start, 1, g)
      const dom = { start, end }
      const onOnes = found.filter(x => x.on)
      refitRangeRef.current(onOnes.length ? onOnes : found, seq)
      const n = unitsBetween(start, end, g)
      const def = parseIsoDate(cfg.defaultDate)
      let ia = isFinite(def) ? clamp(dateToIndex(start, def, g), 0, n) : n
      let ib = n
      let nextMode = modeRef.current
      let note = ''
      const allowed = (mm: TimeMode): boolean => mm === 'single' || (mm === 'range' && cfg.allowRange !== false) || (mm === 'compare' && cfg.allowCompare !== false)
      const fromUrl = cfg.allowShareLink !== false && !urlApplied.current ? parseUrlDate(readUrlParam(window.location.search, cfg.urlParam || 'tm')) : null
      if (fromUrl && allowed(fromUrl.mode)) {
        urlApplied.current = true
        nextMode = fromUrl.mode; ia = clamp(dateToIndex(start, fromUrl.a, g), 0, n); ib = clamp(dateToIndex(start, fromUrl.b, g), 0, n)
        note = t('fromLink')
      } else if (cfg.rememberDate && !domainRef.current) {
        const last = readLast(props.id)
        // a remembered step is applied before the range is rounded (changeStep does the rest later)
        const la = last ? parseIsoDate(last.a) : NaN; const lb = last ? parseIsoDate(last.b) : NaN
        if (last && isFinite(la) && allowed(last.mode)) {
          nextMode = last.mode; ia = clamp(dateToIndex(start, la, g), 0, n); ib = isFinite(lb) ? clamp(dateToIndex(start, lb, g), 0, n) : n
          note = t('restoredDate')
        }
      } else if (domainRef.current) {
        // a re-discovery keeps the slider where the user left it
        ia = clamp(dateToIndex(start, indexToDate(domainRef.current.start, aRef.current, g), g), 0, n)
        ib = clamp(dateToIndex(start, indexToDate(domainRef.current.start, bRef.current, g), g), 0, n)
      } else if (nextMode !== 'single') { ia = 0 }
      setTargets(found); setYearSets(sets); setDomain(dom)
      if (nextMode !== modeRef.current) setMode(nextMode)
      setA(ia); setB(ib)
      if (note) announce(note)
      if (!found.length && !sets.length) setError(cfg.autoDiscover === false ? t('noTargetsRules') : t('noTargets'))
      else if (rulesMissed) { setRangeNote(''); announce(t('noTargetsRulesFallback')) }
    } catch (e) {
      beaconRef.current?.error(e, 'discover')
      setError(String((e && (e as any).message) || e))
    } finally {
      if (seq === discoverSeq.current) setLoading(false)
    }
  }, [cfg, props.id, t]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!jmv) return
    void discover(jmv)
    // layers added or removed later (Add Data, a layer list toggle of a group) trigger a fresh read
    try {
      if (layersWatch.current) layersWatch.current.remove()
      let timer: any = null
      // compare clones and other helpers of ours do not count as new layers
      const ownCount = (): number => { try { return (jmv.view.map as any).allLayers.filter((l: any) => String(l && l.id || '').indexOf('time-machine-') !== 0).length } catch (e) { return 0 } }
      const wLen = reactiveUtils.watch(() => ownCount(), () => {
        clearTimeout(timer); timer = setTimeout(() => { void discover(jmv) }, 600)
      })
      // layers turned on or off in the map or the layer list: the panel follows
      let visTimer: any = null
      const wVis = reactiveUtils.watch(() => visibilitySignature(jmv.view.map), () => {
        let changed = false
        const next = targetsRef.current.map(x => { const on = isTargetOn(x); if (on !== x.on) changed = true; return on === x.on ? x : { ...x, on } })
        if (changed) { targetsRef.current = next; setTargets(next) }
        // the range follows the layers that are on: a layer just turned on can reach further back
        clearTimeout(visTimer)
        visTimer = setTimeout(() => {
          if (!targetsRef.current.length) { void discover(jmv); return }
          const onOnes = targetsRef.current.filter(x => x.on)
          if (changed && onOnes.length) refitRangeRef.current(onOnes, discoverSeq.current)
        }, 500)
      })
      layersWatch.current = { remove: () => { try { wLen.remove() } catch (e) { /* ignore */ } try { wVis.remove() } catch (e) { /* ignore */ } clearTimeout(visTimer) } }
    } catch (e) { /* older SDK without reactiveUtils: no live re-read */ }
    return () => { if (layersWatch.current) { try { layersWatch.current.remove() } catch (e) { /* ignore */ } layersWatch.current = null } }
  }, [jmv, discover])

  /* ---------------------------------------------------------------- apply */

  const announce = (s: string): void => { setStatus(s) }
  // the map status is announced once a drag settles, not on every notch
  const quietTimer = useRef<any>(null)
  const announceQuiet = (s: string): void => { clearTimeout(quietTimer.current); quietTimer.current = setTimeout(() => { setStatus(s) }, 700) }

  /* A map service draws one picture at a time. A refresh while a picture is on its way piles requests up on the
     server (seconds of backlog at speed), so one refresh is kept pending per service and sent when the view is free. */
  const pendingRefresh = useRef(new Set<any>())
  const refreshWatch = useRef(new Map<any, any>())
  const viewOf = (owner: any): any => { try { return jmv ? jmv.view.allLayerViews.find((v: any) => v && v.layer === owner) : null } catch (e) { return null } }
  const refreshOwner = (owner: any): void => {
    if (!owner || typeof owner.refresh !== 'function') return
    const lv = viewOf(owner)
    if (lv && lv.updating) {
      pendingRefresh.current.add(owner)
      if (!refreshWatch.current.has(owner)) {
        try {
          refreshWatch.current.set(owner, reactiveUtils.watch(() => !!lv.updating, (u: boolean) => {
            if (!u && pendingRefresh.current.has(owner)) { pendingRefresh.current.delete(owner); try { owner.refresh() } catch (e) { /* ignore */ } }
          }))
        } catch (e) { pendingRefresh.current.delete(owner); try { owner.refresh() } catch (e2) { /* ignore */ } }
      }
      return
    }
    pendingRefresh.current.delete(owner)
    try { owner.refresh() } catch (e) { /* ignore */ }
  }
  useEffect(() => () => { refreshWatch.current.forEach(w => { try { w.remove() } catch (e) { /* ignore */ } }); refreshWatch.current.clear(); pendingRefresh.current.clear() }, [jmv])
  /* a map service sometimes swallows the first refresh after the page loads: if its view is not drawing shortly after
     a filter change and nothing is pending, ask once more */
  const nudgeTimer = useRef<any>(null)
  const nudgeOwners = (changed: number): void => {
    if (!changed || !jmv) return
    clearTimeout(nudgeTimer.current)
    nudgeTimer.current = setTimeout(() => {
      const owners = new Set(targetsRef.current.filter(x => x.kind === 'sublayer' && x.enabled).map(x => x.owner))
      for (const o of owners) {
        const lv = viewOf(o)
        if (lv && !lv.updating && !pendingRefresh.current.has(o) && typeof o.refresh === 'function') { try { o.refresh() } catch (e) { /* ignore */ } }
      }
    }, 200)
  }
  const applyNow = useCallback((): void => {
    if (!domain || (stateRef.current === WidgetState.Closed && !presentingRef.current)) return
    const from = indexToDate(domain.start, a, g)
    const to = indexToDate(domain.start, b, g)
    let n = 0
    if (mode === 'range') {
      n = applyTime({ targets, widgetId: props.id, g, from: Math.min(from, to), to: Math.max(from, to), semantic: 'between', layerViews: layerViewsRef.current, refresh: refreshOwner, onWhere: (k, w) => { whereRef.current.set(k, w) } })
      applyYearSets(yearSets, Math.max(from, to))
      nudgeOwners(n)
      if (!playing) announceQuiet(t('statusRange', { from: formatDate(Math.min(from, to), g), to: formatDate(Math.max(from, to), g), n: String(n) }))
    } else {
      n = applyTime({ targets, widgetId: props.id, g, from, to: from, semantic: 'asof', layerViews: layerViewsRef.current, refresh: refreshOwner, onWhere: (k, w) => { whereRef.current.set(k, w) } })
      nudgeOwners(n)
      if (mode === 'compare' && compareRef.current) {
        updateCompareDates(compareRef.current, { widgetId: props.id, g, targets, dateA: from, dateB: to })
        if (!playing) announceQuiet(t('statusCompare', { a: formatDate(from, g), b: formatDate(to, g) }))
      } else {
        applyYearSets(yearSets, from)
        if (!playing) announceQuiet(t('statusApplied', { date: formatDate(from, g), n: String(n) }))
      }
    }
  }, [domain, a, b, g, mode, targets, yearSets, props.id, playing, t, jmv]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyNowRef = useRef(applyNow); applyNowRef.current = applyNow
  const scheduleApply = useCallback((delay: number): void => {
    clearTimeout(applyTimer.current)
    applyTimer.current = setTimeout(() => { applyNow() }, delay)
  }, [applyNow])

  useEffect(() => { if (domain) scheduleApply(playing ? 0 : 120); return () => clearTimeout(applyTimer.current) }, [a, b, mode, targets, yearSets, domain]) // eslint-disable-line react-hooks/exhaustive-deps

  /* client side: read the dates of every feature layer once, then range, bars, counts and glow need no server */
  const cacheKeyOf = (x: TimeTarget): string => `${x.key}|${x.pick.start}|${x.pick.end || ''}|${originalWhere(x.target, props.id) || ''}`
  const cacheKeys = targets.filter(x => x.kind === 'layer').map(cacheKeyOf).join(',')
  useEffect(() => {
    if (!jmv || cfg.clientSide === false) return
    let live = true
    const jobs = targets.filter(x => x.kind === 'layer' && !cacheRef.current.has(cacheKeyOf(x)))
      .sort((x, y) => Number(y.on) - Number(x.on))
    if (!jobs.length) return
    void Promise.all(jobs.map(async x => {
      const k = cacheKeyOf(x)
      const c = await loadDateCache(x, { widgetId: props.id, max: Math.max(1000, Number(cfg.clientMaxFeatures) || 50000) })
      if (!live) return
      cacheRef.current.set(k, c)
      if (c) try { console.info('[time-machine] dates cached', x.title, c.total) } catch (e) { /* ignore */ }
      setCacheTick(t => t + 1)
    }))
    return () => { live = false }
  }, [jmv, cacheKeys, cfg.clientSide, cfg.clientMaxFeatures]) // eslint-disable-line react-hooks/exhaustive-deps
  const cacheOf = (x: TimeTarget): DateCache | null => (cfg.clientSide === false ? null : cacheRef.current.get(cacheKeyOf(x)) || null)
  /** True while the layer's dates are still on their way: no point asking the server meanwhile. */
  const cachePending = (x: TimeTarget): boolean => cfg.clientSide !== false && x.kind === 'layer' && !cacheRef.current.has(cacheKeyOf(x))

  /* fetch the layer view of every feature target once, so the filter can run on the client */
  useEffect(() => {
    if (!jmv) return
    let live = true
    for (const x of targets) {
      const have = layerViewsRef.current.get(x.key)
      if (x.kind !== 'layer' || (have && !have.destroyed && (!have.layer || have.layer === x.target))) continue
      layerViewsRef.current.delete(x.key)
      try {
        jmv.view.whenLayerView(x.target).then((lv: any) => {
          if (!live || !lv || !('filter' in lv)) return
          layerViewsRef.current.set(x.key, lv)
          // the filter in force moves from the layer to the view, with the date the slider is on now
          clearTimeout(applyTimer.current); applyTimer.current = setTimeout(() => { applyNowRef.current() }, 0)
        }, () => { /* no view for this layer: server side filter stays */ })
      } catch (e) { /* ignore */ }
    }
    return () => { live = false }
  }, [jmv, targets]) // eslint-disable-line react-hooks/exhaustive-deps

  /* a small date stamp on the map, so the date is on screen even with the panel collapsed */
  useEffect(() => {
    if (!jmv || cfg.showMapStamp === false) return
    const el = document.createElement('div')
    el.className = 'tm-stamp'
    el.setAttribute('aria-hidden', 'true')
    const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    const corner = corners.indexOf(String(cfg.stampPosition)) >= 0 ? String(cfg.stampPosition) : 'top-right'
    // the attribution strip runs along the bottom edge: sit above it
    const lift = corner.indexOf('bottom') === 0 ? 'margin-bottom:22px;' : ''
    el.style.cssText = `${lift}pointer-events:none;font:600 13px/1.2 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:5px 9px;border-radius:${tokens.radius};background:${tokens.surface};color:${tokens.text};box-shadow:${tokens.shadow};border-left:4px solid ${tokens.primary};white-space:nowrap;`
    try { jmv.view.ui.add(el, corner) } catch (e) { return }
    stampRef.current = el
    return () => { try { jmv.view.ui.remove(el) } catch (e) { /* ignore */ } el.remove(); stampRef.current = null }
  }, [jmv, cfg.showMapStamp, cfg.stampPosition]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = stampRef.current; if (!el || !domain) return
    el.style.display = presenting || props.state === WidgetState.Closed ? 'none' : ''
    el.style.background = tokens.surface; el.style.color = tokens.text; el.style.borderLeftColor = tokens.primary
    el.textContent = mode === 'single' ? `${t('asOf')} ${formatDate(dateA, g)}` : mode === 'range' ? `${formatDate(Math.min(dateA, dateB), g)} ${t('toWord')} ${formatDate(Math.max(dateA, dateB), g)}` : `${formatDate(dateA, g)} | ${formatDate(dateB, g)}`
  }, [dateA, dateB, mode, presenting, props.state, tokens, domain, g, t])

  /* what changed: features that appeared since the previous position glow for a moment */
  useEffect(() => {
    if (!jmv || !domain || cfg.highlightNew === false || mode !== 'single' || deckBusyRef.current) { prevAppliedRef.current = null; return }
    const prev = prevAppliedRef.current
    prevAppliedRef.current = dateA
    // while playing fast there is no time to see a glow, and the queries would pile up
    if (prev === null || dateA <= prev || dateA - prev > 366 * 86400000 * 12 || (playing && (cfg.playIntervalMs || 1000) * speed < 800)) return
    const seq = ++highlightSeq.current
    const timer = setTimeout(async () => {
      for (const h of highlightsRef.current) { try { h.remove() } catch (e) { /* ignore */ } }
      highlightsRef.current = []
      const live = targets.filter(x => x.enabled && x.on && x.kind === 'layer')
      await Promise.all(live.map(async x => {
        const c = cacheOf(x)
        const ids = c ? cacheIdsBetween(c, indexToDate(startOfUnit(prev, g), 1, g), endOfUnit(dateA, g)) : await newSince(x, props.id, prev, dateA, g)
        if (!ids.length || seq !== highlightSeq.current) return
        try {
          const lv = await jmv.view.whenLayerView(x.target)
          if (seq !== highlightSeq.current || !lv || typeof lv.highlight !== 'function') return
          const h = lv.highlight(ids)
          highlightsRef.current.push(h)
          setTimeout(() => { try { h.remove() } catch (e) { /* ignore */ } highlightsRef.current = highlightsRef.current.filter(x => x !== h) }, 1800)
        } catch (e) { /* no layer view */ }
      }))
    }, 220)
    return () => clearTimeout(timer)
  }, [dateA, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  /* remember the date for next time */
  useEffect(() => {
    if (!domain || !cfg.rememberDate) return
    writeLast(props.id, { mode, a: toIsoDate(dateA), b: toIsoDate(dateB), g })
  }, [dateA, dateB, mode, domain, cfg.rememberDate, props.id])

  /* feature counts, a moment after the slider stops */
  useEffect(() => {
    if (!domain || cfg.showCounts === false || cfg.showLayerList === false || playing) return
    const seq = ++countSeq.current
    const timer = setTimeout(async () => {
      const next: Record<string, number | null> = {}
      for (const x of targets) {
        if (!x.enabled || !x.on || x.kind !== 'layer') continue
        const cache = cacheOf(x)
        if (cache) {
          const from = indexToDate(domain.start, Math.min(a, b), g); const to = indexToDate(domain.start, Math.max(a, b), g)
          next[x.key] = mode === 'range' ? cacheCount(cache, g, from, to, 'between') : cacheCount(cache, g, dateA, dateA, 'asof')
          continue
        }
        if (cachePending(x) || typeof x.target.queryFeatureCount !== 'function') continue
        try {
          const q = typeof x.target.createQuery === 'function' ? x.target.createQuery() : {}
          q.where = (whereRef.current.has(x.key) ? whereRef.current.get(x.key) : x.target.definitionExpression) || '1=1'
          const n = await x.target.queryFeatureCount(q)
          if (seq !== countSeq.current) return
          next[x.key] = typeof n === 'number' ? n : null
          setCounts(c => ({ ...c, ...next }))
        } catch (e) { next[x.key] = null }
      }
      if (seq === countSeq.current) setCounts(c => ({ ...c, ...next }))
    }, cfg.clientSide === false ? 500 : 150)
    return () => clearTimeout(timer)
  }, [a, b, mode, targets, domain, playing, cfg.showCounts, cfg.showLayerList, cacheTick])

  /* activity bars: one grouped count per layer, in the background, when the layer set or range changes */
  const activityKeys = targets.filter(x => x.enabled && x.on).map(x => `${x.key}|${x.pick.start}`).join(',')
  useEffect(() => {
    if (!domain || cfg.showActivity === false) { setActivity(null); return }
    const seq = ++activitySeq.current
    const unit = activityUnit(domain.start, domain.end, g)
    const live = targets.filter(x => x.enabled && x.on)
    const empty = activityBars(domain.start, domain.end, g, unit, [])
    const timer = setTimeout(async () => {
      const per = await Promise.all(live.map(async x => { const c = cacheOf(x); return { key: x.key, title: x.title, counts: c ? cacheActivity(c, unit) : cachePending(x) ? new Map<string, number>() : await activityCounts(x, unit, props.id, empty, domain.start, g) } }))
      if (seq !== activitySeq.current) return
      setActivity({ unit, bars: activityBars(domain.start, domain.end, g, unit, per.map(p => p.counts)), perLayer: per })
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, g, activityKeys, cfg.showActivity, props.id, cacheTick])

  const jumpChange = (dir: 1 | -1): void => {
    if (!activity) return
    const next = nextActive(activity.bars, a, dir)
    if (next === null) { announce(t(dir > 0 ? 'noNextChange' : 'noPrevChange')); return }
    beaconRef.current?.action(dir > 0 ? 'next-change' : 'prev-change')
    setA(next)
  }

  /* a date pushed in by the "Set the date" message action */
  useEffect(() => {
    const req = props.stateProps && props.stateProps.request
    if (!req || !domain || req.nonce === requestNonce.current) return
    requestNonce.current = req.nonce
    const ia = clamp(dateToIndex(domain.start, req.date, g), 0, count)
    if (isFinite(req.dateEnd as number) && mode !== 'single') { setA(ia); setB(clamp(dateToIndex(domain.start, req.dateEnd as number, g), 0, count)) } else if (mode === 'single') setA(ia); else { setA(ia); setB(ia) }
    beaconRef.current?.action('set-date', 'message')
    announce(t('fromMessage'))
  }, [props.stateProps && props.stateProps.request && props.stateProps.request.nonce, domain]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!domain) return
    setDateText({ a: toIsoDate(dateA), b: toIsoDate(dateB) })
  }, [dateA, dateB, domain])

  /* ---------------------------------------------------------------- play */

  const stopPlay = (): void => { clearInterval(playTimer.current); playTimer.current = null; waitedRef.current = 0; clearTimeout(holdTimer.current); setChapterHold(false); setPlaying(false) }
  useEffect(() => {
    if (!playing || chapterHold) return
    const ms = Math.max(120, Math.round((cfg.playIntervalMs || 800) * speed))
    const byChapter = presenting && cfg.presentStep === 'chapters' && chapters.length > 0
    playTimer.current = setInterval(() => {
      const dom = domainRef.current
      if (!dom) return
      // the slider never runs ahead of the map: while the map is still drawing the last step, wait (two ticks at most)
      // feature layer views filter in the browser and are waited for (two ticks at most); a map service keeps
      // one refresh pending and draws the newest date it can, so the clock never waits on it
      const busy = Array.from(layerViewsRef.current.values()).some((lv: any) => lv && !lv.destroyed && lv.updating)
      if (busy && waitedRef.current < 2) { waitedRef.current++; return }
      waitedRef.current = 0
      const limit = mode === 'range' ? bRef.current : count
      const cur = aRef.current
      if (byChapter) {
        const nx = nextChapter(chapters, indexToDate(dom.start, cur, g), g, !!cfg.presentLoop)
        if (!nx) { stopPlay(); return }
        const idx = clamp(dateToIndex(dom.start, nx.ms, g), 0, count)
        if (idx === cur) { stopPlay(); return }
        setA(idx)
        return
      }
      if (cur >= limit) {
        if ((presenting && cfg.presentLoop) || loopRef.current) { setA(mode === 'range' ? 0 : 0); return }
        if (presenting) { endReachedRef.current = true; announce(t('presentEndCard')) }
        stopPlay(); return
      }
      setA(Math.min(limit, cur + stepN))
    }, byChapter ? Math.max(ms, holdFor(domain ? chapterInEffect(chapters, dateA, g)?.chapter : null, holdDefault()) + (reduceMotion() ? 0 : (cfg.flyMs === undefined ? 1500 : cfg.flyMs))) : ms)
    return () => clearInterval(playTimer.current)
  }, [playing, chapterHold, speed, mode, count, stepN, cfg.playIntervalMs, presenting, cfg.presentStep, cfg.presentLoop, cfg.chapterHoldMs, chapters, g, presenting && cfg.presentStep === 'chapters' ? dateA : 0])

  /* landing on a chapter while presenting: hold, fly, announce */
  const holdDefault = (): number => { const v = Number(cfg.chapterHoldMs); return isFinite(v) && v >= 0 ? v : 4000 }
  const landSeq = useRef(0)
  const typedRef = useRef('')
  const endReachedRef = useRef(false)
  const typedTimer = useRef<any>(null)
  const reduceMotion = (): boolean => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) } catch (e) { return false } }
  useEffect(() => {
    if (!presenting || !domain || deckBusyRef.current) return
    const c = chapterStartingAt(chapters, dateA, g)
    if (!c) return
    const timers: any[] = []
    announce(t('statusChapter', { i: String(c.index + 1), title: String(c.chapter.title || formatDate(c.ms, g)) }))
    const ch = c.chapter
    const target = chapterTarget(ch)
    const opts = chapterGoToOptions(ch, reduceMotion() ? 0 : (cfg.flyMs === undefined ? 1500 : cfg.flyMs))
    const my = ++landSeq.current
    if (inkRef.current) inkRef.current.clear() // ink belongs to the chapter it was drawn on
    if (jmv) {
      // map state the chapter asks for: layers, basemap, then the flight, then the feature popup and a thumbnail
      if (!ch.featureLayerId) { try { jmv.view.closePopup() } catch (e) { /* ignore */ } }
      layerUndoRef.current = mergeUndo(layerUndoRef.current, applyChapterLayers(jmv.view.map, ch))
      if (ch.basemap) {
        void (async () => {
          let Basemap: any = null
          if (/^[0-9a-f]{32}$/i.test(ch.basemap || '')) { try { [Basemap] = await loadArcGISJSAPIModules(['esri/Basemap']) } catch (e) { Basemap = null } }
          if (!bannerRef.current) return // the presentation ended while the module loaded
          const prev = applyChapterBasemap(jmv.view.map, ch.basemap, Basemap)
          if (prev && !basemapPrevRef.current) basemapPrevRef.current = prev
        })()
      }
      const after = (): void => {
        if (!bannerRef.current || landSeq.current !== my) return
        void showChapterFeature(jmv.view, jmv.view.map, ch)
        // the hold and the slow zoom start once the map has arrived, so a flight never eats the hold
        const hold = holdFor(ch, holdDefault())
        if (playingRef.current && cfg.presentStep !== 'chapters') {
          setChapterHold(true)
          clearTimeout(holdTimer.current)
          holdTimer.current = setTimeout(() => { setChapterHold(false) }, hold)
        }
        const motion = ch.motion || cfg.chapterMotion
        const drift = target && !reduceMotion() ? driftTarget(target.scale || jmv.view.scale, motion) : null
        if (drift) {
          const ms = playingRef.current ? Math.max(1000, hold) : 6000
          timers.push(setTimeout(() => { if (bannerRef.current && landSeq.current === my) { try { void jmv.view.goTo({ scale: drift.scale }, { duration: ms, easing: 'linear' }) } catch (e) { /* ignore */ } } }, 100))
        }
        if (cfg.chapterGrid !== false && !thumbsRef.current.has(c.index) && typeof jmv.view.takeScreenshot === 'function') {
          try {
            void settled(jmv.view, 5000).then(() => shootView(jmv.view, 320, 60)).then((shot) => {
              if (shot.dataUrl && bannerRef.current) { thumbsRef.current.set(c.index, shot.dataUrl); bannerRef.current.setThumb(c.index, shot.dataUrl) }
            })
          } catch (e) { /* no screenshot */ }
        }
      }
      if (target) {
        try { void jmv.view.goTo({ center: target.center, scale: target.scale, rotation: target.rotation }, opts).then(after, () => { /* interrupted by the next chapter */ }) } catch (e) { after() }
      } else timers.push(setTimeout(after, 300))
    }
    if (voiceRef.current) {
      if (!narratorRef.current) narratorRef.current = createNarrator()
      // browsers keep quiet until the page has been clicked once (kiosk autoplay)
      const ua: any = (navigator as any).userActivation
      if (ua && ua.hasBeenActive === false) announce(t('voiceNeedsClick')); else narratorRef.current.say(narrationText(String(ch.title || ''), String(ch.text || '')))
    }
    if (!jmv && playing && cfg.presentStep !== 'chapters') { setChapterHold(true); clearTimeout(holdTimer.current); holdTimer.current = setTimeout(() => { setChapterHold(false) }, holdFor(ch, holdDefault())) }
    return () => { timers.forEach(clearTimeout) }
  }, [dateA, presenting]) // eslint-disable-line react-hooks/exhaustive-deps

  /* the banner's "next in N s" while a chapter holds */
  useEffect(() => {
    if (!presenting || !playing || !chapterHold) { setCountdown(null); return }
    const c = domain ? chapterInEffect(chapters, dateA, g) : null
    const total = holdFor(c ? c.chapter : null, holdDefault())
    const startedAt = Date.now()
    const id = setInterval(() => { setCountdown(Math.max(0, (total - (Date.now() - startedAt)) / 1000)) }, 250)
    setCountdown(total / 1000)
    return () => clearInterval(id)
  }, [presenting, playing, chapterHold]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bannerRef.current) bannerRef.current.setCountdown(countdown) }, [countdown])
  useEffect(() => { if (bannerRef.current && domain) bannerRef.current.setBars(activity ? activity.bars : [], count) }, [presenting, activity, count]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Speed label for the banner: Slowest to Fastest as a multiplier. */
  const speedLabel = (f: number): string => { const x = 1 / f; return (x >= 1 ? String(Math.round(x * 10) / 10) : String(Math.round(x * 100) / 100)) + 'x' }
  /** Next speed up or down the list, wrapping at neither end. */
  const cycleSpeed = (dir: 1 | -1): void => {
    const i = SPEEDS.findIndex(x => x.factor === speed)
    const j = Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 2 : i) + dir))
    if (SPEEDS[j].factor === speed) { announce(t(dir > 0 ? 'speedMax' : 'speedMin')); return }
    setSpeed(SPEEDS[j].factor)
    announce(t('speedSet', { s: t(SPEEDS[j].key) }))
  }
  useEffect(() => { if (bannerRef.current) bannerRef.current.setSpeed(speedLabel(speed)) }, [speed, presenting]) // eslint-disable-line react-hooks/exhaustive-deps
  const togglePlay = (): void => {
    if (playing) { stopPlay(); announce(t('statusPaused', { date: formatDate(dateA, g) })); return }
    beaconRef.current?.action('play')
    const limit = mode === 'range' ? b : count
    if (a >= limit) setA(0)
    setPlaying(true)
    announce(t('statusPlaying', { date: formatDate(dateA, g) }))
  }

  /* ---------------------------------------------------------------- compare */

  const beginCompare = async (bIndex: number = b): Promise<void> => {
    if (!jmv || !domain) return
    stopCompare(jmv.view, compareRef.current); compareRef.current = null
    const seq = ++compareSeq.current
    try {
      beaconRef.current?.action('compare')
      let MapImageLayer: any = null
      if (targets.some(x => x.enabled && x.kind === 'sublayer')) {
        try { [MapImageLayer] = await loadArcGISJSAPIModules(['esri/layers/MapImageLayer']) } catch (e) { MapImageLayer = null }
      }
      const session = await startCompare({
        view: jmv.view, Collection, MapImageLayer, widgetId: props.id, g, targets, yearSets,
        dateA: indexToDate(domain.start, a, g), dateB: indexToDate(domain.start, bIndex, g),
        position, onPosition: setPosition
      })
      // the user moved on while the divider was loading: throw the session away
      if (seq !== compareSeq.current || modeRef.current !== 'compare') { stopCompare(jmv.view, session); return }
      compareRef.current = session
      scheduleApply(0)
    } catch (e) {
      if (seq !== compareSeq.current) return
      beaconRef.current?.error(e, 'compare')
      setError(t('compareUnavailable'))
      setMode('single')
    }
  }

  const changeMode = (next: TimeMode): void => {
    if (next === mode) return
    stopPlay()
    if (mode === 'compare') { compareSeq.current++; stopCompare(jmv && jmv.view, compareRef.current); compareRef.current = null }
    setError('')
    const nb = next !== 'single' && b <= a ? count : b
    if (nb !== b) setB(nb)
    setMode(next)
    beaconRef.current?.action('mode', next)
    if (next === 'compare') void beginCompare(nb)
  }

  useEffect(() => {
    if (compareRef.current && jmv) { try { compareRef.current.swipe.position = position } catch (e) { /* ignore */ } }
  }, [position, jmv])

  /* ---------------------------------------------------------------- handlers */

  // screen readers get the date on the handle, not the notch number (set on Calcite's inner handles after each render)
  const sliderRef = useRef<any>(null)
  useEffect(() => {
    const el = sliderRef.current; if (!el || !domain) return
    try {
      const handles: any[] = el.shadowRoot ? Array.from(el.shadowRoot.querySelectorAll('[role="slider"]')) : []
      for (const h of handles) { const v = Number(h.getAttribute('aria-valuenow')); if (isFinite(v)) h.setAttribute('aria-valuetext', formatDate(indexToDate(domain.start, v, g), g)) }
    } catch (e) { /* closed shadow root */ }
  })
  const onSlider = (e: any): void => {
    const el = e && e.target
    if (!el) return
    if (mode === 'single') {
      const v = Number(el.value); if (isFinite(v)) setA(clamp(Math.round(v), 0, count))
    } else {
      const lo = Number(el.minValue); const hi = Number(el.maxValue)
      if (isFinite(lo)) setA(clamp(Math.round(lo), 0, count))
      if (isFinite(hi)) setB(clamp(Math.round(hi), 0, count))
    }
  }

  const commitDate = (which: 'a' | 'b', text: string): void => {
    if (!domain) return
    const ms = parseIsoDate(text)
    if (!isFinite(ms)) { setDateText(d => ({ ...d, [which]: toIsoDate(which === 'a' ? dateA : dateB) })); return }
    const i = clamp(dateToIndex(domain.start, ms, g), 0, count)
    beaconRef.current?.action('set-date', which)
    if (which === 'a') setA(i); else setB(i)
  }

  const toggleTarget = (key: string, on: boolean): void => {
    setTargets(ts => ts.map(x => (x.key === key ? { ...x, enabled: on } : x)))
  }
  /**
   * The slider range follows the data: oldest and newest date across the layers that are
   * on, unless the builder fixed the start or the end. Runs after discovery and again
   * whenever the set of layers following the slider changes. The user's date is kept.
   */
  const rangeSourceRef = useRef<'settings' | 'provisional' | 'data' | 'failed'>('provisional')
  const refitRange = (list: TimeTarget[], seq: number, attempt: number = 0): void => {
    const g = gRef.current
    const fixedS = parseIsoDate(cfg.startDate); const fixedE = parseIsoDate(cfg.endDate)
    if (cfg.fitRangeToData === false || (isFinite(fixedS) && isFinite(fixedE))) { rangeSourceRef.current = 'settings'; setRangeSource('settings'); return }
    if (!list.length) return
    const win = { minYear: cfg.minYear, maxYear: cfg.maxYear }
    // layers with a cache answer at once; the rest ask the server
    const cached = list.filter(x => !!cacheOf(x)); const rest = list.filter(x => !cacheOf(x) && !cachePending(x))
    if (!cached.length && !rest.length) return // every layer is still loading its dates; the cache landing refits
    const local = fitRangeSafe(cached.map(x => cacheRange(cacheOf(x) as DateCache, win)), win)
    const ask = rest.length ? dataRange(rest, (tt, field) => sdkStats(tt, field, props.id, win), 12000, win) : Promise.resolve({ start: NaN, end: NaN })
    void ask.then(server => ({ start: fitRangeSafe([local, server], win).start, end: fitRangeSafe([local, server], win).end })).then(r => {
      if (seq !== discoverSeq.current) return
      const d = domainRef.current; if (!d) return
      const got = isFinite(r.start) || isFinite(r.end)
      if (!got) {
        const notes = list.map(x => statsNotes.get(x.key)).filter(Boolean)
        try { console.warn('[time-machine] range not read for', list.map(x => `${x.title} [${x.pick.start}${x.pick.startDateOnly ? ', date only' : ''}]`).join(', '), notes, 'attempt', attempt + 1) } catch (e) { /* ignore */ }
        // one quiet retry: a slow or busy service often answers the second time
        if (attempt < 1) { setTimeout(() => { if (seq === discoverSeq.current) refitRange(list, seq, attempt + 1) }, 3000); return }
        // a range already read from the data stays; only a range never read is called a guess
        if (rangeSourceRef.current === 'data') return
        rangeSourceRef.current = 'failed'; setRangeSource('failed'); setRangeNote(notes.join(' | '))
        return
      }
      rangeSourceRef.current = 'data'; setRangeSource('data'); setRangeNote('')
      let s2 = isFinite(fixedS) ? fixedS : isFinite(r.start) ? r.start : d.start
      let e2 = isFinite(fixedE) ? fixedE : isFinite(r.end) ? r.end : d.end
      s2 = startOfUnit(s2, g); e2 = startOfUnit(e2, g)
      if (e2 < s2) { const x = s2; s2 = e2; e2 = x }
      if (unitsBetween(s2, e2, g) < 1) e2 = indexToDate(s2, 1, g)
      if (s2 === d.start && e2 === d.end) return
      const ca = indexToDate(d.start, aRef.current, g); const cb = indexToDate(d.start, bRef.current, g)
      const n2 = unitsBetween(s2, e2, g)
      setDomain({ start: s2, end: e2 })
      setA(clamp(dateToIndex(s2, ca, g), 0, n2)); setB(clamp(dateToIndex(s2, cb, g), 0, n2))
      announce(t('rangeFromData', { from: formatDate(s2, g), to: formatDate(e2, g) }))
    })
  }

  /* the layers following the slider changed (turned on or off in the map, or unticked): refit the range */
  const refitKeys = targets.filter(x => x.enabled && x.on).map(x => `${x.key}|${x.pick.start}`).join(',')
  const refitFirst = useRef(true)
  useEffect(() => {
    if (refitFirst.current) { refitFirst.current = false; return }
    if (!domain) return
    const live = targets.filter(x => x.enabled && x.on)
    if (!live.length) return
    const timer = setTimeout(() => { refitRange(live, discoverSeq.current) }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refitKeys])

  /** Day, month or year: the range is re-rounded and the dates the user is on are kept. */
  const changeStep = (next: Granularity): void => {
    const d = domainRef.current
    if (!d || next === g) return
    const ca = indexToDate(d.start, aRef.current, g); const cb = indexToDate(d.start, bRef.current, g)
    let s2 = startOfUnit(d.start, next); let e2 = startOfUnit(d.end, next)
    if (unitsBetween(s2, e2, next) < 1) e2 = indexToDate(s2, 1, next)
    const n2 = unitsBetween(s2, e2, next)
    // bars and counts belong to the old index scale; they come back for the new one
    setActivity(null)
    activitySeq.current++
    setGran(next)
    setDomain({ start: s2, end: e2 })
    setA(clamp(dateToIndex(s2, ca, next), 0, n2)); setB(clamp(dateToIndex(s2, cb, next), 0, n2))
    beaconRef.current?.action('step', next)
    announce(t('stepChanged', { step: t(next === 'day' ? 'stepDay' : next === 'month' ? 'stepMonth' : 'stepYear') }))
  }

  /* a cache just landed: the range can be exact at once */
  useEffect(() => {
    if (!domain || !cacheTick) return
    const live = targets.filter(x => x.enabled && x.on)
    if (live.length) refitRangeRef.current(live, discoverSeq.current)
  }, [cacheTick]) // eslint-disable-line react-hooks/exhaustive-deps

  const setAllTargets = (on: boolean): void => { setTargets(ts => ts.map(x => (x.on ? { ...x, enabled: on } : x))) }
  const setTargetField = (key: string, field: string): void => {
    beaconRef.current?.action('set-field')
    setTargets(ts => ts.map(x => (x.key === key ? { ...x, pick: { start: field } } : x)))
  }

  const openHelp = (): void => { if (!hintDismissed) writeHelpHint(props.id); setHintDismissed(true); setHelpOpen(true) }
  const dismissHint = (): void => { writeHelpHint(props.id); setHintDismissed(true) }

  const jumpToday = (): void => {
    if (!domain) return
    const i = clamp(dateToIndex(domain.start, startOfUnit(Date.now(), g), g), 0, count)
    beaconRef.current?.action('today')
    if (mode === 'single') setA(i); else { setA(0); setB(i) }
  }

  /** Back to how the widget opens fresh: builder step and mode, every layer ticked, opening date, nothing playing. */
  const resetAll = (): void => {
    if (!domain) return
    beaconRef.current?.action('reset')
    stopPlay()
    if (presenting) exitPresent()
    if (mode === 'compare') { stopCompare(jmv && jmv.view, compareRef.current); compareRef.current = null }
    setError('')
    try { window.localStorage.removeItem(`${LAST_KEY}.${props.id}`) } catch (e) { /* ignore */ }
    const g0: Granularity = cfg.granularity || 'day'
    let d = domain
    if (g0 !== g) {
      let s2 = startOfUnit(domain.start, g0); let e2 = startOfUnit(domain.end, g0)
      if (unitsBetween(s2, e2, g0) < 1) e2 = indexToDate(s2, 1, g0)
      d = { start: s2, end: e2 }
      setGran(g0); setDomain(d)
    }
    setStepN(Math.max(1, Math.round(Number(cfg.stepSize) || 1)))
    const n = unitsBetween(d.start, d.end, g0)
    const def = parseIsoDate(cfg.defaultDate)
    const m0: TimeMode = (cfg.defaultMode === 'range' && cfg.allowRange !== false) || (cfg.defaultMode === 'compare' && cfg.allowCompare !== false) ? cfg.defaultMode : 'single'
    setTargets(ts => ts.map(x => (x.enabled ? x : { ...x, enabled: true })))
    setMode(m0)
    setPosition(50)
    if (m0 === 'single') { setA(isFinite(def) ? clamp(dateToIndex(d.start, def, g0), 0, n) : n); setB(n) } else { setA(0); setB(isFinite(def) ? clamp(dateToIndex(d.start, def, g0), 0, n) : n) }
    if (m0 === 'compare') pendingCompare.current = true
    announce(t('resetDone'))
  }

  /* ---------------------------------------------------------------- presentation */

  const exitPresent = (): void => {
    if (bannerRef.current) { try { jmvRef.current && jmvRef.current.view.ui.remove(bannerRef.current.el) } catch (e) { /* ignore */ } bannerRef.current.destroy(); bannerRef.current = null }
    try { if (document.fullscreenElement) void document.exitFullscreen() } catch (e) { /* ignore */ }
    if (spotRef.current) { spotRef.current.destroy(); spotRef.current = null }
    setSpotOn(false)
    if (inkRef.current) { inkRef.current.destroy(); inkRef.current = null }
    setInkOn(false)
    if (blackRef.current) { blackRef.current.destroy(); blackRef.current = null }
    if (narratorRef.current) narratorRef.current.stop()
    if (dwellSince.current) { dwellRef.current = addDwell(dwellRef.current, dwellSince.current.index, Date.now() - dwellSince.current.at); dwellSince.current = null }
    const vv = jmvRef.current && jmvRef.current.view
    if (vv && uiComponentsRef.current) { try { vv.ui.components = uiComponentsRef.current } catch (e) { /* ignore */ } uiComponentsRef.current = null }
    if (presenterRef.current) { presenterRef.current.close(); presenterRef.current = null }
    setPresenterOpen(false)
    // the map goes back to how it was before the story changed it
    restoreLayers(layerUndoRef.current); layerUndoRef.current = []
    const v = jmvRef.current && jmvRef.current.view
    if (v && basemapPrevRef.current) { try { v.map.basemap = basemapPrevRef.current } catch (e) { /* ignore */ } basemapPrevRef.current = null }
    try { if (v && typeof v.closePopup === 'function') v.closePopup() } catch (e) { /* ignore */ }
    thumbsRef.current = new Map()
    setPresenting(false); presentingRef.current = false
    // the panel was collapsed during the show: now the close rules apply
    if (stateRef.current === WidgetState.Closed) { stopPlay(); if (cfg.restoreOnClose !== false) { restoreAll(targetsRef.current, props.id, layerViewsRef.current); restoreYearSets(yearSetsRef.current) } }
    stopPlay()
    if (presentPrevMode.current !== 'single') setTimeout(() => { changeModeRef.current(presentPrevMode.current) }, 0)
    setTimeout(() => { try { if (presentBtnRef.current && presentBtnRef.current.isConnected) presentBtnRef.current.focus(); else if (jmvRef.current) (jmvRef.current.view.container as HTMLElement).focus() } catch (e) { /* ignore */ } }, 50)
    clearTimeout(holdTimer.current); setChapterHold(false)
    announce(t('statusPresentOff'))
  }

  const toggleSpotlight = (): void => {
    const v = jmvRef.current && jmvRef.current.view
    if (!v || !v.container || cfg.allowSpotlight === false) return
    if (!spotRef.current) spotRef.current = createSpotlight(v.container)
    const on = spotRef.current.toggle()
    setSpotOn(on)
    if (bannerRef.current) bannerRef.current.setSpotlight(on)
    beaconRef.current?.action('spotlight', on ? 'on' : 'off')
    announce(t(on ? 'spotlightOn' : 'spotlightOff'))
  }

  const presenterState = (): PresenterState => {
    const d = domainRef.current
    const ms = d ? indexToDate(d.start, aRef.current, g) : Date.now()
    const c = chapterInEffect(chapters, ms, g)
    const n = nextChapter(chapters, ms, g, false)
    return {
      date: formatDate(ms, g), playing: playingRef.current, index: c ? c.index : -1, total: chapters.length,
      title: c ? String(c.chapter.title || '') : '', text: c ? String(c.chapter.text || '') : '', notes: c ? String(c.chapter.notes || '') : '',
      nextTitle: n ? String(n.chapter.title || formatDate(n.ms, g)) : '', nextDate: n ? formatDate(n.ms, g) : '',
      elapsedMs: presentStartRef.current ? Date.now() - presentStartRef.current : 0,
      chapters: chapters.map(x => ({ i: x.index, date: formatDate(x.ms, g), title: String(x.chapter.title || ''), dwellSec: dwellRef.current[x.index] ? Math.round(dwellRef.current[x.index] / 1000) : undefined })),
      thumb: c ? thumbsRef.current.get(c.index) || '' : '', nextThumb: n ? thumbsRef.current.get(n.index) || '' : '',
      ...(() => { const p = pace(presentStartRef.current ? Date.now() - presentStartRef.current : 0, c ? c.index : 0, chapters.length, cfg.presentMinutes); return { paceLabel: p.label, paceDeltaSec: p.deltaSec, remainingSec: p.remainingSec } })()
    }
  }

  useEffect(() => { if (bannerRef.current) bannerRef.current.setTokens(stageTokens) }, [stageTokens, presenting])
  useEffect(() => {
    if (!bannerRef.current) return
    bannerRef.current.setChapters(chapters.map(x => ({ index: x.index, date: formatDate(x.ms, g), title: String(x.chapter.title || '') })))
    thumbsRef.current = new Map() // indices shifted; pictures come back as chapters are visited
  }, [chapters, g]) // eslint-disable-line react-hooks/exhaustive-deps

  /* rehearsal: how long each chapter has been on screen */
  useEffect(() => {
    if (!presenting) { dwellSince.current = null; return }
    const c = domain ? chapterInEffect(chapters, dateA, g) : null
    const idx = c ? c.index : -1
    const now = Date.now()
    if (dwellSince.current && dwellSince.current.index !== idx) dwellRef.current = addDwell(dwellRef.current, dwellSince.current.index, now - dwellSince.current.at)
    if (!dwellSince.current || dwellSince.current.index !== idx) dwellSince.current = { index: idx, at: now }
  }, [presenting, dateA]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleInk = (): void => {
    const v = jmvRef.current && jmvRef.current.view
    if (!v || !v.container || cfg.allowInk === false) return
    if (!inkRef.current) inkRef.current = createInk(v.container, brand.accent)
    const on = !inkRef.current.isDrawing()
    inkRef.current.setDrawing(on)
    setInkOn(on)
    if (bannerRef.current) bannerRef.current.setInk(on)
    beaconRef.current?.action('ink', on ? 'on' : 'off')
    announce(t(on ? 'inkOn' : 'inkOff'))
  }
  const clearInk = (): void => { if (inkRef.current) { inkRef.current.clear(); announce(t('inkCleared')) } }
  const toggleBlackout = (color: string = 'black'): void => {
    const v = jmvRef.current && jmvRef.current.view
    if (!v || !v.container) return
    if (!blackRef.current) blackRef.current = createBlackout(v.container, t('blackoutLabel'), () => { setStatus(t('blackoutOff')) })
    const on = blackRef.current.toggle(color)
    beaconRef.current?.action('blackout', on ? 'on' : 'off')
    announce(t(on ? 'blackoutOn' : 'blackoutOff'))
  }
  const toggleVoice = (): void => {
    if (!narratorRef.current) narratorRef.current = createNarrator()
    if (!narratorRef.current.available) { announce(t('voiceNone')); return }
    const on = !voiceRef.current
    setVoiceOn(on)
    if (!on) narratorRef.current.stop()
    else { const c = domain ? chapterInEffect(chapters, dateA, g) : null; if (c) narratorRef.current.say(narrationText(String(c.chapter.title || ''), String(c.chapter.text || ''))) }
    beaconRef.current?.action('voice', on ? 'on' : 'off')
    announce(t(on ? 'voiceOn' : 'voiceOff'))
  }

  const onPresenterCommand = (c: PresenterCommand): void => {
    const d = domainRef.current
    if (typeof c === 'object') { gotoChapter(chapters[c.goto] || null); return }
    switch (c) {
      case 'toggle': presentRefs.current.togglePlay(); break
      case 'step': setA(v => clamp(v + stepN, 0, count)); break
      case 'back': setA(v => clamp(v - stepN, 0, count)); break
      case 'next': if (d) gotoChapter(nextChapter(chapters, indexToDate(d.start, aRef.current, g), g, false)); break
      case 'prev': if (d) gotoChapter(prevChapter(chapters, indexToDate(d.start, aRef.current, g), g)); break
      case 'exit': presentRefs.current.exit(); break
    }
  }

  const togglePresenter = (): void => {
    if (cfg.allowPresenterWindow === false) return
    if (presenterRef.current && presenterRef.current.isOpen()) { presenterRef.current.close(); presenterRef.current = null; setPresenterOpen(false); return }
    const h = openPresenter(props.id, stageTokens, {
      title: t('presenterTitle'), notes: t('presenterNotes'), next: t('presenterNext'), elapsed: t('presenterElapsed'),
      play: t('play'), pause: t('pause'), prev: t('presentPrev'), nextChapter: t('presentNext'), step: t('stepForward'), back: t('stepBack'),
      exit: t('presentExit'), chapters: t('presenterChapters'), noNotes: t('presenterNoNotes'), end: t('presenterEnd'),
      ahead: t('paceAhead'), behind: t('paceBehind'), onPace: t('paceOn'), remaining: t('paceRemaining')
    }, (c) => { presentRefs.current.command(c) }, { font: brand.font, logo: brand.logo, logoHeight: brand.logoHeight })
    if (!h) { announce(t('presenterBlocked')); return }
    presenterRef.current = h
    setPresenterOpen(true)
    beaconRef.current?.action('presenter-window')
    h.send(presenterState())
  }

  const toggleFullscreen = (): void => {
    try {
      const el: any = jmvRef.current && jmvRef.current.view && jmvRef.current.view.container
      if (!el) return
      if (document.fullscreenElement) void document.exitFullscreen(); else if (el.requestFullscreen) void el.requestFullscreen()
      setTimeout(() => { if (bannerRef.current) bannerRef.current.setFullscreen(!!document.fullscreenElement) }, 300)
    } catch (e) { /* ignore */ }
  }

  const gotoChapter = (c: ChapterAt | null): void => {
    if (!c || !domainRef.current) return
    setA(clamp(dateToIndex(domainRef.current.start, c.ms, g), 0, count))
  }

  const presentPrevMode = useRef<TimeMode>('single')
  const startPresent = (): void => {
    if (!jmv || !domain || presenting) return
    presentPrevMode.current = mode
    if (mode !== 'single') changeMode('single')
    // like a slide show, the story opens at its first chapter, or the oldest date, when the slider sits at the end
    if (a >= count) setA(chapters.length ? clamp(dateToIndex(domain.start, chapters[0].ms, g), 0, count) : 0)
    beaconRef.current?.action('present')
    const banner = createBanner(cfg.bannerPosition === 'top' ? 'top' : 'bottom', stageTokens, {
      play: t('play'), pause: t('pause'), prev: t('presentPrev'), next: t('presentNext'), exit: t('presentExit'), fullscreen: t('presentFullscreen'),
      grid: t('presentGrid'), spotlight: t('presentSpotlight'), presenter: t('presentPresenter'), gridTitle: t('presentGridTitle'),
      ink: t('presentInk'), blackout: t('presentBlackout'), nextIn: t('presentNextIn'), regionLabel: t('presentRegion'),
      back: t('stepBack'), step: t('stepForward'), clearInk: t('presentClearInk'), progress: t('presentProgressLabel'), speed: t('speed')
    }, {
      onToggle: () => { if (cfg.allowPlay !== false) presentRefs.current.togglePlay() },
      onPrev: () => { presentRefs.current.command('prev') },
      onNext: () => { presentRefs.current.command('next') },
      onExit: () => { presentRefs.current.exit() },
      onFullscreen: toggleFullscreen,
      onGoto: (i) => { presentRefs.current.command({ goto: i }) },
      onSpotlight: () => { presentRefs.current.spotlight() },
      onPresenter: () => { presentRefs.current.presenter() },
      onInk: () => { presentRefs.current.ink() },
      onBlackout: () => { presentRefs.current.blackout() },
      onBack: () => { presentRefs.current.command('back') },
      onStep: () => { presentRefs.current.command('step') },
      onClearInk: () => { presentRefs.current.clearInk() },
      onSpeed: () => { presentRefs.current.cycleSpeed(1) }
    }, { showProgress: cfg.presentProgress !== false, grid: cfg.chapterGrid !== false && chapters.length > 0, spotlight: cfg.allowSpotlight !== false, presenter: cfg.allowPresenterWindow !== false, ink: cfg.allowInk !== false, font: brand.font, dateSize: brand.dateSize, logo: brand.logo, logoHeight: brand.logoHeight, logoAlt: cfg.deckCredit || '' })
    try { jmv.view.ui.add(banner.el, 'manual') } catch (e) { banner.destroy(); return }
    banner.setChapters(chapters.map(x => ({ index: x.index, date: formatDate(x.ms, g), title: String(x.chapter.title || '') })))
    bannerRef.current = banner
    setTimeout(() => { banner.focus() }, 50)
    presentStartRef.current = Date.now()
    presentingRef.current = true
    endReachedRef.current = false
    dwellRef.current = {}
    // a clean stage: the map's own buttons leave while the banner is up
    if (cfg.presentCleanStage !== false) { try { uiComponentsRef.current = jmv.view.ui.components; jmv.view.ui.components = ['attribution'] } catch (e) { uiComponentsRef.current = null } }
    thumbsRef.current = new Map()
    setPresenting(true)
    announce(t('statusPresentOn'))
  }

  // the banner's DOM handlers are created once; they call through refs so they see fresh state
  const presentRefs = useRef({ togglePlay: () => {}, exit: () => {}, command: (_c: PresenterCommand) => {}, spotlight: () => {}, presenter: () => {}, ink: () => {}, blackout: () => {}, clearInk: () => {}, cycleSpeed: (_d: 1 | -1) => {} })
  presentRefs.current.togglePlay = () => { togglePlay() }
  presentRefs.current.exit = exitPresent
  exitPresentRef.current = exitPresent
  changeModeRef.current = changeMode
  refitRangeRef.current = refitRange
  useEffect(() => { if (pendingCompare.current && mode === 'compare' && domain) { pendingCompare.current = false; void beginCompare() } }, [mode, domain, a, b]) // eslint-disable-line react-hooks/exhaustive-deps
  presentRefs.current.command = onPresenterCommand
  presentRefs.current.spotlight = toggleSpotlight
  presentRefs.current.presenter = togglePresenter
  presentRefs.current.ink = toggleInk
  presentRefs.current.blackout = toggleBlackout
  presentRefs.current.clearInk = clearInk
  presentRefs.current.cycleSpeed = cycleSpeed
  const playingRef = useRef(playing); playingRef.current = playing

  /* the presenter window follows every change; its clock ticks once a second */
  useEffect(() => {
    if (!presenting || !presenterRef.current) return
    presenterRef.current.send(presenterState())
    if (!presenterRef.current.isOpen()) { presenterRef.current = null; setPresenterOpen(false) }
  }, [presenting, dateA, playing, chapters, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!presenting || !presenterOpen) return
    const id = setInterval(() => { setTick(x => x + 1) }, 1000)
    return () => clearInterval(id)
  }, [presenting, presenterOpen])

  /* kiosk: ?tmp=1 opens the presentation, ?tmp=play opens it playing */
  useEffect(() => {
    if (!jmv || !domain || kioskApplied.current || cfg.allowShareLink === false || cfg.allowPresent === false) return
    const v = readUrlParam(window.location.search, (cfg.urlParam || 'tm') + 'p')
    if (v !== '1' && v !== 'play') return
    kioskApplied.current = true
    const timer = setTimeout(() => { startPresentRef.current(); if (v === 'play' && cfg.allowPlay !== false) setTimeout(() => { presentRefs.current.togglePlay() }, 400) }, 800)
    return () => clearTimeout(timer)
  }, [jmv, domain]) // eslint-disable-line react-hooks/exhaustive-deps
  const startPresentRef = useRef(() => {})
  startPresentRef.current = () => { startPresent() }

  /* ---------------------------------------------------------------- story draft (chapters made from the map) */

  const saveDraft = (list: Chapter[]): void => { setDraft(list); if (!writeDraft(props.id, list)) announce(t('storySaveFail')) }
  const addChapterFromMap = (): void => {
    if (!jmv) return
    const c = captureView(jmv.view, jmv.view.map, dateA, t('storyNewTitle', { n: String(draft.length + 1) }))
    saveDraft([...draft, c])
    beaconRef.current?.action('story-add')
    announce(t('storyAdded', { date: formatDate(dateA, g) }))
    setStoryOpen(true)
  }
  const updateDraft = (i: number, part: Partial<Chapter>): void => { saveDraft(draft.map((c, j) => (j === i ? { ...c, ...part } : c))) }
  /** After a rehearsal, the time spent on each chapter becomes its hold time. */
  const useRehearsed = (): void => {
    let n = 0
    const next = draft.map(c => {
      const hit = chapters.find(x => x.chapter === c)
      const ms = hit ? dwellRef.current[hit.index] : 0
      if (!ms || ms < 500) return c
      n++
      return { ...c, holdMs: Math.round(ms / 500) * 500 }
    })
    saveDraft(next)
    beaconRef.current?.action('story-rehearsed')
    announce(t('storyRehearsedDone', { n: String(n) }))
  }
  const storyXmlText = (): string => storyXml(cfg as Config, mergeChapters(cfg.chapters, draft))
  const copyStory = (): void => {
    beaconRef.current?.action('story-copy')
    try { void navigator.clipboard.writeText(storyXmlText()).then(() => { announce(t('storyCopied')) }, () => { announce(t('storyCopyFail')) }) } catch (e) { announce(t('storyCopyFail')) }
  }
  const downloadBlob = (data: BlobPart, type: string, name: string): boolean => {
    try {
      const blob = new Blob([data], { type })
      const url = URL.createObjectURL(blob)
      const el = document.createElement('a'); el.href = url; el.download = name
      document.body.appendChild(el); el.click(); document.body.removeChild(el)
      setTimeout(() => { URL.revokeObjectURL(url) }, 4000)
      return true
    } catch (e) { return false }
  }
  const downloadStory = (): void => {
    beaconRef.current?.action('story-download')
    announce(t(downloadBlob(storyXmlText(), 'application/xml', 'time-machine-story.xml') ? 'storyDownloaded' : 'storyCopyFail'))
  }

  /* ---------------------------------------------------------------- slides from the story */

  const [deckBusy, setDeckBusy] = useState<string>('')
  const deckCancel = useRef(false)

  /**
   * Waits for the view to finish drawing: first for it to start (a basemap swap or a new
   * filter takes a moment to begin), then for it to stop, then a beat for tiles to paint.
   * Gives up after maxMs so a slow service cannot hang the export.
   */
  const settled = (view: any, maxMs: number): Promise<void> => new Promise(resolve => {
    let done = false
    const ac = typeof AbortController === 'function' ? new AbortController() : null
    const finish = (): void => { if (!done) { done = true; try { if (ac) ac.abort() } catch (e) { /* ignore */ } resolve() } }
    const timer = setTimeout(finish, maxMs)
    const signal = ac ? ac.signal : undefined
    const waitIdle = (): void => {
      try { reactiveUtils.whenOnce(() => !view.updating, signal).then(() => { clearTimeout(timer); setTimeout(finish, 500) }, () => { /* aborted */ }) } catch (e) { /* timer */ }
    }
    try {
      if (view.updating) waitIdle()
      else {
        let started = false
        const startTimer = setTimeout(() => { if (!started) { started = true; waitIdle() } }, 900)
        reactiveUtils.whenOnce(() => !!view.updating, signal).then(() => { if (!started) { started = true; clearTimeout(startTimer); waitIdle() } }, () => { /* aborted */ })
      }
    } catch (e) { /* fall back to the timer */ }
  })

  /** A picture of the map at the view's own aspect ratio, so nothing is stretched or cropped. */
  const shootView = async (view: any, width: number, quality: number): Promise<{ dataUrl: string, w: number, h: number }> => {
    try {
      const vw = Number(view.width) || 1600; const vh = Number(view.height) || 900
      const w = Math.min(width, Math.round(vw * (window.devicePixelRatio || 1))); const h = Math.round(w * vh / vw)
      const shot = await view.takeScreenshot({ width: w, height: h, format: 'jpg', quality, ignoreBackground: false, ignorePadding: true })
      return { dataUrl: shot && shot.dataUrl ? shot.dataUrl : '', w: shot && shot.data ? shot.data.width : w, h: shot && shot.data ? shot.data.height : h }
    } catch (e) { return { dataUrl: '', w: 0, h: 0 } }
  }

  /**
   * Walks every chapter: sets the date, applies the chapter's map state, waits for the
   * map to draw, takes a picture. Then builds the deck and downloads it. The map is put
   * back where it was.
   */
  const exportDeck = async (kind: 'html'): Promise<void> => {
    if (!jmv || !domain || deckBusy || !chapters.length) return
    beaconRef.current?.action('deck', kind)
    deckCancel.current = false
    const view = jmv.view
    const wasA = aRef.current; const wasMode = modeRef.current
    if (wasMode !== 'single') changeMode('single')
    stopPlay()
    const undo: LayerUndo[] = []
    let prevBasemap: any = null
    const slides: DeckSlide[] = []
    try {
      for (const c of chapters) {
        if (deckCancel.current) break
        deckBusyRef.current = 'deck'; setDeckBusy(t('deckProgress', { i: String(c.index + 1), n: String(chapters.length) }))
        const ch = c.chapter
        setA(clamp(dateToIndex(domain.start, c.ms, g), 0, count))
        undo.push(...applyChapterLayers(view.map, ch))
        if (ch.basemap) {
          let Basemap: any = null
          if (/^[0-9a-f]{32}$/i.test(ch.basemap)) { try { [Basemap] = await loadArcGISJSAPIModules(['esri/Basemap']) } catch (e) { Basemap = null } }
          const prev = applyChapterBasemap(view.map, ch.basemap, Basemap)
          if (prev && !prevBasemap) prevBasemap = prev
        }
        const target = chapterTarget(ch)
        if (target) { try { await view.goTo({ center: target.center, scale: target.scale, rotation: target.rotation }, { animate: false }) } catch (e) { /* keep going */ } }
        await new Promise(r => setTimeout(r, 250)) // the date filter is applied on a short debounce
        await settled(view, 12000)
        const shot = await shootView(view, 1920, 85)
        const bar = activity ? activity.bars.find(b => c.ms >= indexToDate(domain.start, b.from, g) && c.ms < indexToDate(domain.start, b.to, g)) : null
        slides.push({ index: c.index, date: formatDate(c.ms, g), title: String(ch.title || ''), text: String(ch.text || ''), notes: String(ch.notes || ''), image: shot.dataUrl, imageW: shot.w, imageH: shot.h, caption: bar && bar.n ? t('deckCaption', { n: bar.n.toLocaleString(), unit: t(activity!.unit === 'year' ? 'unitYear' : 'unitMonth') }) : undefined })
      }
    } finally {
      restoreLayers(undo)
      if (prevBasemap) { try { view.map.basemap = prevBasemap } catch (e) { /* ignore */ } }
      setA(wasA)
      setDeckBusy(''); setTimeout(() => { deckBusyRef.current = '' }, 0)
      if (wasMode !== 'single') setTimeout(() => { changeModeRef.current(wasMode) }, 0)
    }
    if (!slides.length) { announce(t('deckNone')); return }
    const model: DeckModel = {
      title: cfg.deckTitle || t('_widgetLabel'),
      subtitle: `${formatDate(domain.start, g)} ${t('toWord')} ${formatDate(domain.end, g)}`,
      credit: cfg.deckCredit || '',
      lang: document.documentElement.lang || 'en',
      slides,
      font: brand.font, logo: brand.logo, logoHeight: brand.logoHeight,
      colors: { background: brand.background, text: brand.text, muted: brand.muted, accent: brand.accent, surface: brand.background }
    }
    const stamp = toIsoDate(Date.now())
    const ok = downloadBlob(htmlDeck(model), 'text/html', `time-machine-${stamp}.html`)
    announce(t(ok ? 'deckDone' : 'deckFail', { n: String(slides.length) }))
  }

  /**
   * Video: plays the whole timeline from the start, one picture per step (thinned to a
   * few hundred steps at most), each held for a share of the target length, with the date
   * and the chapter title on a caption strip. WebM through MediaRecorder.
   */
  const exportVideo = async (): Promise<void> => {
    if (!jmv || !domain || deckBusy) return
    if (!videoSupported()) { announce(t('videoNone')); return }
    beaconRef.current?.action('video')
    deckCancel.current = false
    const view = jmv.view
    const wasA = aRef.current; const wasMode = modeRef.current
    if (wasMode !== 'single') changeMode('single')
    stopPlay()
    const seconds = Math.max(5, Math.min(600, Number(cfg.videoSeconds) || 30))
    const fps = 10
    const maxSteps = 300
    const stride = Math.max(stepN, Math.ceil(count / maxSteps / stepN) * stepN)
    const indexes: number[] = []
    for (let i = 0; i <= count; i += stride) indexes.push(i)
    if (indexes[indexes.length - 1] !== count) indexes.push(count)
    const per = framesPerStep(indexes.length, seconds, fps)
    const vw = Number(view.width) || 1280; const vh = Number(view.height) || 720
    const width = 1280; const height = Math.round(width * vh / vw) + Math.round(width * vh / vw * 0.12)
    const rec = createRecorder(width, height, fps, { background: brand.background, text: brand.text, muted: brand.muted, accent: brand.accent, credit: cfg.deckCredit || '', font: brand.font })
    if (!rec) { announce(t('videoNone')); return }
    let frames = 0
    try {
      for (let k = 0; k < indexes.length; k++) {
        if (deckCancel.current) break
        deckBusyRef.current = 'video'; setDeckBusy(t('videoProgress', { i: String(k + 1), n: String(indexes.length) }))
        setA(indexes[k])
        await new Promise(r => setTimeout(r, 200))
        await settled(view, 4000)
        const ms = indexToDate(domain.start, indexes[k], g)
        const shot = await shootView(view, 1280, 80)
        const c = chapterInEffect(chapters, ms, g)
        for (let f = 0; f < per; f++) { await rec.frame(shot.dataUrl, formatDate(ms, g), c ? String(c.chapter.title || '') : ''); frames++; await new Promise(r => setTimeout(r, 1000 / fps)) }
      }
    } finally {
      setA(wasA)
      setDeckBusy(''); setTimeout(() => { deckBusyRef.current = '' }, 0)
      if (wasMode !== 'single') setTimeout(() => { changeModeRef.current(wasMode) }, 0)
    }
    if (deckCancel.current || !frames) { rec.cancel(); announce(t('videoCancelled')); return }
    const blob = await rec.stop()
    const ext = rec.mimeType.indexOf('mp4') >= 0 ? 'mp4' : 'webm'
    announce(t(downloadBlob(blob, blob.type || 'video/webm', `time-machine-${toIsoDate(Date.now())}.${ext}`) ? 'videoDone' : 'deckFail', { n: String(indexes.length) }))
  }

  /** Chapters written from the activity bars: the busiest periods, or one every N periods. */
  const [autoMode, setAutoMode] = useState<'busiest' | 'every'>('busiest')
  const [autoN, setAutoN] = useState(6)
  const generateChapters = (): void => {
    if (!domain || !activity) return
    const picks = autoChapterKeys(activity.bars, autoMode, autoN)
    if (!picks.length) { announce(t('autoNone')); return }
    const unit = t(activity.unit === 'year' ? 'unitYear' : 'unitMonth')
    const made: Chapter[] = picks.map(p => {
      const ms = indexToDate(domain.start, p.from, g)
      const per = activity.perLayer.filter(l => l.counts.size).map(l => {
        let n = 0
        for (const b of activity.bars) if (b.from >= p.from && b.to <= p.to) n += l.counts.get(b.key) || 0
        return n ? `${l.title}: ${n.toLocaleString()}` : ''
      }).filter(Boolean)
      return { date: toIsoDate(ms), title: p.key, text: t('autoText', { n: p.n.toLocaleString(), period: p.key }), notes: per.join('\n') }
    })
    // one chapter per period, replacing earlier generated ones with the same title
    const keep = draft.filter(c => !made.some(m => m.title === c.title))
    saveDraft([...keep, ...made])
    beaconRef.current?.action('story-auto', autoMode)
    announce(t('autoDone', { n: String(made.length), unit }))
    setStoryOpen(true)
  }

  useEffect(() => {
    if (!presenting || !bannerRef.current || !domain) return
    const m = bannerModel({ chapters, start: domain.start, end: domain.end, ms: dateA, g, chapterLabel: (i, n) => t('presentChapterLabel', { i: String(i), n: String(n) }) })
    // a title card before the first chapter and a closing card at the end, as a deck would have
    if (chapters.length && m.index < 0) { m.title = cfg.deckTitle || t('_widgetLabel'); m.text = t('presentTitleCard', { from: formatDate(domain.start, g), to: formatDate(domain.end, g) }); m.chapterLabel = cfg.deckCredit || '' }
    else if (chapters.length && !playing && a >= count && endReachedRef.current) { m.title = t('presentEndCard'); m.text = cfg.deckCredit || cfg.deckTitle || ''; m.chapterLabel = '' }
    bannerRef.current.update(m, playing)
  }, [presenting, dateA, playing, domain, chapters, tokens, g, t, a, count])

  useEffect(() => {
    if (!presenting) return
    const onKey = (e: KeyboardEvent): void => {
      // shortcuts never swallow browser shortcuts, typing, or a focused control's own keys
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const el = e.target as any
      const tag = el && String(el.tagName || '').toLowerCase()
      const inControl = tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || tag.indexOf('calcite-') === 0 || (el && el.isContentEditable) || !!(el && typeof el.closest === 'function' && el.closest('button, [role="button"], [role="textbox"], calcite-slider'))
      // a focused banner button keeps only its own activation keys; every other key is a shortcut
      const inBanner = !!(el && typeof el.closest === 'function' && el.closest('.tm-present, .tm-blackout'))
      if (inBanner) { if (e.key === ' ' || e.key === 'Enter' || e.key === 'Tab') return } else if (inControl && e.key !== 'Escape') return
      // PowerPoint habit: type a chapter number and press Enter to jump there
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); typedRef.current += e.key; clearTimeout(typedTimer.current); typedTimer.current = setTimeout(() => { typedRef.current = '' }, 2500); announce(t('typedChapter', { n: typedRef.current })); return }
      if (e.key === 'Enter' && typedRef.current) { e.preventDefault(); const n = parseInt(typedRef.current, 10); typedRef.current = ''; const c = chapters[n - 1]; if (c) gotoChapter(c); else announce(t('typedChapterNone', { n: String(n) })); return }
      const act = presentKey(e.key, e.shiftKey)
      if (!act) return
      e.preventDefault()
      const d = domainRef.current
      switch (act) {
        case 'toggle': togglePlay(); break
        case 'step': setA(v => clamp(v + stepN, 0, count)); break
        case 'back': setA(v => clamp(v - stepN, 0, count)); break
        case 'next': if (d) gotoChapter(nextChapter(chapters, indexToDate(d.start, aRef.current, g), g, false)); break
        case 'prev': if (d) gotoChapter(prevChapter(chapters, indexToDate(d.start, aRef.current, g), g)); break
        case 'start': setA(0); break
        case 'end': setA(count); break
        case 'fullscreen': toggleFullscreen(); break
        case 'grid': if (bannerRef.current) bannerRef.current.toggleGrid(); break
        case 'spotlight': toggleSpotlight(); break
        case 'presenter': togglePresenter(); break
        case 'ink': toggleInk(); break
        case 'clearInk': clearInk(); break
        case 'blackout': toggleBlackout('black'); break
        case 'whiteout': toggleBlackout('white'); break
        case 'undoInk': if (inkRef.current) { inkRef.current.undo(); announce(t('inkUndone')) } break
        case 'faster': cycleSpeed(1); break
        case 'slower': cycleSpeed(-1); break
        case 'voice': toggleVoice(); break
        case 'exit': if (bannerRef.current && bannerRef.current.isGridOpen()) { bannerRef.current.toggleGrid(); break } exitPresent(); break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [presenting, count, chapters, g]) // eslint-disable-line react-hooks/exhaustive-deps


  /* ---------------------------------------------------------------- share link */

  const copyLink = (): void => {
    let url = withUrlParam(window.location.href, cfg.urlParam || 'tm', formatUrlDate(mode, mode === 'range' ? Math.min(dateA, dateB) : dateA, mode === 'range' ? Math.max(dateA, dateB) : dateB))
    // while presenting the link opens the presentation too, playing if it is playing now
    url = withUrlParam(url, (cfg.urlParam || 'tm') + 'p', presenting ? (playing ? 'play' : '1') : null)
    beaconRef.current?.action('copy-link', presenting ? 'present' : mode)
    try { void navigator.clipboard.writeText(url).then(() => { announce(t('linkCopied')) }, () => { announce(t('linkCopyFail')) }) } catch (e) { announce(t('linkCopyFail')) }
  }

  /* ---------------------------------------------------------------- help flags */

  const helpFeatures: HelpFeatures = {
    range: cfg.allowRange !== false,
    compare: cfg.allowCompare !== false,
    play: cfg.allowPlay !== false,
    dateInputs: cfg.showDateInputs !== false,
    layerList: cfg.showLayerList !== false,
    yearSets: yearSets.length > 0,
    sublayers: targets.some(x => x.kind === 'sublayer'),
    restoreOnClose: cfg.restoreOnClose !== false,
    counts: cfg.showCounts !== false && cfg.showLayerList !== false,
    shareLink: cfg.allowShareLink !== false,
    messageAction: true,
    rememberDate: !!cfg.rememberDate,
    present: cfg.allowPresent !== false,
    chapters: chapters.length > 0,
    chapterJump: cfg.presentStep === 'chapters',
    loop: !!cfg.presentLoop,
    activity: cfg.showActivity !== false,
    step: cfg.allowStepChange !== false,
    grid: cfg.chapterGrid !== false,
    spotlight: cfg.allowSpotlight !== false,
    presenter: cfg.allowPresenterWindow !== false,
    story: cfg.allowStoryDraft !== false,
    deck: cfg.allowDeck !== false,
    video: cfg.allowVideo !== false,
    highlight: cfg.highlightNew !== false,
    cleanStage: cfg.presentCleanStage !== false,
    stamp: cfg.showMapStamp !== false,
    client: cfg.clientSide !== false,
    stage: cfg.allowInk !== false,
    pace: !!cfg.presentMinutes
  }

  /* ---------------------------------------------------------------- render */

  const style = css`
    display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden;
    background: ${tokens.surface}; color: ${tokens.text}; font-size: 13px;
    .tm-top { display: flex; align-items: center; gap: 6px; padding: 8px 10px 4px 12px; flex-shrink: 0; }
    .tm-title { font-weight: 600; font-size: 14px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tm-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px 12px 12px; }
    .tm-modes { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px 0; }
    .tm-chip { display: inline-flex; align-items: center; gap: 5px; min-height: 28px; padding: 4px 10px; border-radius: 999px; border: 1px solid ${tokens.divider}; background: ${tokens.surface}; color: ${tokens.text}; cursor: pointer; font: inherit; font-size: 12px; }
    .tm-chip[aria-pressed="true"] { background: ${tokens.primary}; color: ${tokens.primaryText}; border-color: ${tokens.primary}; }
    .tm-chip:focus-visible { outline: 2px solid ${tokens.primary}; outline-offset: 2px; }
    .tm-readout { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin: 4px 0 2px 0; }
    .tm-date { font-size: 20px; font-weight: 600; line-height: 1.2; }
    .tm-dim { color: ${tokens.textSecondary}; font-size: 12px; }
    .tm-plot { position: relative; margin: 4px 0 0 0; }
    .tm-plot-y { padding-left: 38px; }
    .tm-chart { position: relative; height: 44px; margin: 2px 8px 2px 8px; border-bottom: 1px solid ${tokens.textSecondary}; border-left: 1px solid ${tokens.textSecondary}; }
    .tm-chart .tm-bars { position: absolute; inset: 0; overflow: hidden; }
    .tm-chart .tm-bars > i { position: absolute; bottom: 0; background: ${tokens.primary}; opacity: 0.75; border-radius: 2px 2px 0 0; min-width: 2px; box-sizing: border-box; border-right: 1px solid ${tokens.surface}; }
    .tm-chart .tm-bars > i.tm-here { opacity: 1; }
    .tm-chart .tm-y { position: absolute; right: 100%; margin-right: 4px; transform: translateY(-50%); font-size: 9px; line-height: 1; color: ${tokens.textSecondary}; white-space: nowrap; }
    .tm-chart .tm-grid-h { position: absolute; left: 0; right: 0; border-top: 1px dashed ${tokens.divider}; }
    .tm-chart .tm-grid-v { position: absolute; top: 0; bottom: 0; border-left: 1px dashed ${tokens.divider}; }
    .tm-ylabel { font-size: 10px; color: ${tokens.textSecondary}; margin: 0 8px; }
    .tm-ticks { position: relative; height: 14px; font-size: 10px; color: ${tokens.textSecondary}; margin: -4px 8px 8px 8px; }
    .tm-ticks > span { position: absolute; top: 0; white-space: nowrap; }
    .tm-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0; }
    .tm-inputs { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 4px 0; }
    .tm-inputs > label { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: ${tokens.textSecondary}; flex: 1; min-width: 120px; }
    .tm-section { margin-top: 12px; border-top: 1px solid ${tokens.divider}; padding-top: 8px; }
    .tm-sechead { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; background: transparent; border: none; padding: 4px 0; color: ${tokens.text}; font: inherit; font-weight: 600; cursor: pointer; }
    .tm-sechead:focus-visible { outline: 2px solid ${tokens.primary}; outline-offset: 2px; }
    .tm-layer { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; border-bottom: 1px dashed ${tokens.divider}; }
    .tm-layer:last-child { border-bottom: none; }
    .tm-layer label { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; flex: 1; min-width: 0; }
    .tm-layer .tm-lt { flex: 1; min-width: 0; }
    .tm-layer .tm-ln { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tm-skipped { margin: 4px 0 6px 0; }
    .tm-skipped summary { cursor: pointer; font-size: 12px; color: ${tokens.text}; }
    .tm-skipped summary:focus-visible { outline: 2px solid ${tokens.primary}; outline-offset: 2px; }
    .tm-adv { flex-basis: 100%; display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid ${tokens.divider}; border-radius: 6px; }
    .tm-story { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; border-bottom: 1px dashed ${tokens.divider}; }
    .tm-story:last-of-type { border-bottom: none; }
    .tm-link { background: none; border: none; padding: 0; color: ${tokens.primary}; text-decoration: underline; cursor: pointer; font: inherit; font-size: 12px; }
    .tm-link:focus-visible { outline: 2px solid ${tokens.primary}; outline-offset: 2px; }
    .tm-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    calcite-slider { width: 100%; }
  `

  if (!props.useMapWidgetIds || props.useMapWidgetIds.length === 0) {
    return <WidgetPlaceholder icon={widgetIcon} message={t('selectMapHint')} widgetId={props.id} />
  }

  const showRange = cfg.allowRange !== false
  const showCompare = cfg.allowCompare !== false
  const showModes = showRange || showCompare
  const two = mode !== 'single'
  const ticks = domain ? tickIndexes(count, 5) : []
  const totalCount = (() => {
    if (cfg.showCounts === false || cfg.showLayerList === false) return null
    let sum = 0; let any = false
    for (const x of targets) if (x.enabled && x.on && typeof counts[x.key] === 'number') { sum += counts[x.key] as number; any = true }
    return any ? sum : null
  })()
  const shown = targets.filter(x => x.on && (!layerFilter || x.title.toLowerCase().indexOf(layerFilter.toLowerCase()) >= 0))
  const onCount = shown.filter(x => x.enabled).length

  return (
    <div css={style}>
      <JimuMapViewComponent useMapWidgetId={props.useMapWidgetIds[0]} onActiveViewChange={onActiveViewChange} />

      <HelpPopup
        open={helpOpen}
        onClose={() => { setHelpOpen(false) }}
        sections={buildHelpSections(t, helpFeatures)}
        title={t('helpTitle')}
        intro={t('helpIntro')}
        searchPlaceholder={t('helpSearchPlaceholder')}
        noMatches={t('helpNoMatches')}
        closeLabel={t('close')}
      />

      <div className='tm-top'>
        <span style={{ color: tokens.primary, display: 'flex' }} aria-hidden='true'><CalciteIcon icon='clock' scale='s' /></span>
        <span className='tm-title'>{t('_widgetLabel')}</span>
        {cfg.showHelp !== false && (
          <Button size='sm' type='tertiary' icon onClick={openHelp} title={t('helpTitle')} aria-label={t('helpTitle')} style={{ flexShrink: 0 }}>
            <CalciteIcon icon='question' scale='s' />
          </Button>
        )}
      </div>

      <div className='tm-scroll' aria-busy={loading}>
        {cfg.showHelp !== false && !hintDismissed && !loading && (
          <FirstRunHint
            title={t('firstRunTitle')} body={t('firstRunBody')} linkLabel={t('firstRunHelpLink')} dismissLabel={t('firstRunDismiss')}
            onOpenHelp={openHelp} onDismiss={dismissHint}
          />
        )}

        <div className='tm-sr-only' role='status' aria-live='polite' aria-atomic='true'>{status}</div>

        {loading && <div role='status' aria-live='polite' style={{ padding: '10px 0' }}><Loading type={LoadingType.Secondary} /><div className='tm-dim' style={{ marginTop: 6 }}>{t('loading')}</div></div>}
        {!!error && <Alert type='warning' text={error} withIcon className='w-100' style={{ marginBottom: 8 }} />}

        {domain && (
          <React.Fragment>
            {cfg.allowStepChange !== false && (
              <div className='tm-modes' role='group' aria-label={t('stepGroupLabel')} style={{ marginBottom: 6 }}>
                <span className='tm-dim' style={{ alignSelf: 'center' }}>{t('stepLabel')}</span>
                {(['day', 'month', 'year'] as Granularity[]).map(x => (
                  <button key={x} type='button' className='tm-chip' aria-pressed={g === x} onClick={() => { changeStep(x) }} title={t(x === 'day' ? 'stepDayHint' : x === 'month' ? 'stepMonthHint' : 'stepYearHint')}>
                    {t(x === 'day' ? 'stepDay' : x === 'month' ? 'stepMonth' : 'stepYear')}
                  </button>
                ))}
                <button type='button' className='tm-chip' aria-expanded={advOpen} aria-controls={`${props.id}-adv`} onClick={() => { setAdvOpen(o => !o) }} title={t('advancedHint')} style={{ marginLeft: 'auto' }}>
                  <CalciteIcon icon='gear' scale='s' />{t('advanced')}{stepN > 1 ? ` · ${t('everyN', { n: String(stepN), unit: t(g === 'day' ? 'unitDays' : g === 'month' ? 'unitMonths' : 'unitYears') })}` : ''}
                </button>
                {advOpen && (
                  <div id={`${props.id}-adv`} className='tm-adv' role='group' aria-label={t('advanced')}>
                    <label className='tm-row' style={{ margin: 0 }}>
                      <span>{t('everyLabel')}</span>
                      <NumericInput size='sm' min={1} max={1000} step={1} value={stepN} aria-label={t('everyLabelA11y')} style={{ width: 80 }} showArrowButtons
                        onChange={(v: number) => { const n = Math.max(1, Math.min(1000, Math.round(Number(v) || 1))); setStepN(n); setA(x => clamp(Math.round(x / n) * n, 0, count)); beaconRef.current?.action('step-size', String(n)) }} />
                      <span>{t(g === 'day' ? 'unitDays' : g === 'month' ? 'unitMonths' : 'unitYears')}</span>
                    </label>
                    <span className='tm-dim'>{t('everyHint')}</span>
                    <label className='tm-row' style={{ margin: 0 }}>
                      <Checkbox checked={loop} onChange={(_e: any, checked: boolean) => { setLoop(!!checked) }} aria-label={t('loopPlay')} />
                      <span>{t('loopPlay')}</span>
                    </label>
                  </div>
                )}
              </div>
            )}
            {showModes && (
              <div className='tm-modes' role='group' aria-label={t('modeGroupLabel')}>
                <button type='button' className='tm-chip' aria-pressed={mode === 'single'} onClick={() => { changeMode('single') }} title={t('modeSingleHint')}>
                  <CalciteIcon icon='calendar' scale='s' />{t('modeSingle')}
                </button>
                {showRange && (
                  <button type='button' className='tm-chip' aria-pressed={mode === 'range'} onClick={() => { changeMode('range') }} title={t('modeRangeHint')}>
                    <CalciteIcon icon='date-time' scale='s' />{t('modeRange')}
                  </button>
                )}
                {showCompare && (
                  <button type='button' className='tm-chip' aria-pressed={mode === 'compare'} onClick={() => { changeMode('compare') }} title={t('modeCompareHint')}>
                    <CalciteIcon icon='compare' scale='s' />{t('modeCompare')}
                  </button>
                )}
              </div>
            )}

            <div className='tm-dim' style={{ margin: '0 0 2px 0' }}>{mode === 'single' ? t('explainSingle') : mode === 'range' ? t('explainRange') : t('explainCompare')}</div>
            <div className='tm-readout'>
              {mode === 'single' && (
                <React.Fragment>
                  <span className='tm-dim'>{t('asOf')}{totalCount !== null ? <span> · {t('totalCount', { n: totalCount.toLocaleString() })}</span> : null}</span>
                  <span className='tm-date'>{formatDate(dateA, g)}</span>
                </React.Fragment>
              )}
              {mode === 'range' && (
                <React.Fragment>
                  <span><span className='tm-dim'>{t('fromLabel')} </span><span className='tm-date' style={{ fontSize: 15 }}>{formatDate(Math.min(dateA, dateB), g)}</span></span>
                  <span><span className='tm-dim'>{t('toLabel')} </span><span className='tm-date' style={{ fontSize: 15 }}>{formatDate(Math.max(dateA, dateB), g)}</span></span>
                </React.Fragment>
              )}
              {mode === 'compare' && (
                <React.Fragment>
                  <span><span className='tm-dim'>{t('leftLabel')} </span><span className='tm-date' style={{ fontSize: 15 }}>{formatDate(dateA, g)}</span></span>
                  <span><span className='tm-dim'>{t('rightLabel')} </span><span className='tm-date' style={{ fontSize: 15 }}>{formatDate(dateB, g)}</span></span>
                </React.Fragment>
              )}
            </div>

            {(() => {
              const hasChart = !!activity && activity.bars.length > 0
              const max = hasChart ? Math.max(1, ...activity!.bars.map(x => x.n)) : 1
              const busiest = hasChart ? busiestBar(activity!.bars) : null
              const pct = (i: number): number => clamp((i / Math.max(1, count)) * 100, 0, 100)
              const unitName = hasChart ? t(activity!.unit === 'year' ? 'unitYear' : 'unitMonth') : ''
              return (
                <div className={'tm-plot' + (hasChart ? ' tm-plot-y' : '')}>
                  {hasChart && (
                    <React.Fragment>
                      <div className='tm-ylabel' aria-hidden='true'>{t('activityAxis', { unit: unitName })}</div>
                      <div className='tm-chart' aria-hidden='true' title={t('activityHint', { unit: unitName })}>
                        <span className='tm-y' style={{ top: 0 }}>{max.toLocaleString()}</span>
                        <span className='tm-y' style={{ top: '50%' }}>{(max / 2 >= 10 ? Math.round(max / 2) : Math.round(max / 2 * 10) / 10).toLocaleString()}</span>
                        <span className='tm-y' style={{ top: '100%' }}>0</span>
                        <div className='tm-grid-h' style={{ top: '50%' }} />
                        {ticks.map(i => <div className='tm-grid-v' key={i} style={{ left: `${pct(i)}%` }} />)}
                        <div className='tm-bars'>
                          {activity!.bars.filter(x => x.n > 0).map(x => (
                            <i key={x.key} className={a >= x.from && a < x.to ? 'tm-here' : ''} title={`${x.key}: ${x.n.toLocaleString()}`}
                              style={{ left: `${pct(x.from)}%`, width: `${pct(x.to) - pct(x.from)}%`, height: `${Math.max(3, (x.n / max) * 100)}%` }} />
                          ))}
                        </div>
                      </div>
                      <span className='tm-sr-only'>{busiest ? t('activitySummary', { unit: unitName, key: busiest.key, n: String(busiest.n) }) : t('activityNone')}</span>
                    </React.Fragment>
                  )}
                  {two
              ? (
                <CalciteSlider
                  min={0} max={count} step={stepN} scale='m' ref={sliderRef as any}
                  minValue={Math.min(a, b)} maxValue={Math.max(a, b)}
                  minLabel={t('fromLabel')} maxLabel={t('toLabel')}
                  label={t('sliderRangeLabel')}
                  onCalciteSliderInput={onSlider} onCalciteSliderChange={onSlider}
                />
                )
              : (
                <CalciteSlider
                  min={0} max={count} step={stepN} scale='m' value={a} ref={sliderRef as any}
                  label={t('sliderLabel')}
                  onCalciteSliderInput={onSlider} onCalciteSliderChange={onSlider}
                />
                )}
                  <div className='tm-ticks' aria-hidden='true'>
                    {ticks.map((i, k) => (
                      <span key={i} style={{ left: `${pct(i)}%`, transform: k === 0 ? 'none' : k === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>
                        {formatDate(indexToDate(domain.start, i, g), g === 'day' && count > 400 ? 'month' : g)}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })()}
            <div className='tm-dim' style={{ margin: '-4px 0 6px 0' }} role={rangeSource === 'failed' ? 'alert' : undefined} title={rangeSource === 'data' ? t('rangeSourceData', { from: formatDate(domain.start, g), to: formatDate(domain.end, g) }) : undefined}>
              {rangeSource === 'data' ? t('rangeSourceData', { from: formatDate(domain.start, g), to: formatDate(domain.end, g) }) : rangeSource === 'failed' ? t('rangeSourceFailed') : rangeSource === 'settings' ? t('rangeSourceSettings') : t('rangeSourceReading')}
              {rangeSource === 'failed' && rangeNote && <div style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-word' }}>{rangeNote}</div>}
            </div>

            {cfg.showDateInputs !== false && (
              <div className='tm-inputs'>
                <label>
                  <span>{mode === 'single' ? t('dateInputLabel') : mode === 'range' ? t('fromInputLabel') : t('leftLabel')}</span>
                  <TextInput size='sm' type='date' value={dateText.a} aria-label={mode === 'single' ? t('dateInputLabel') : mode === 'range' ? t('fromInputLabel') : t('leftLabel')}
                    onChange={(e: any) => { setDateText(d => ({ ...d, a: e.target.value })) }}
                    onBlur={(e: any) => { commitDate('a', e.target.value) }}
                    onKeyDown={(e: any) => { if (e.key === 'Enter') commitDate('a', e.target.value) }} />
                </label>
                {two && (
                  <label>
                    <span>{mode === 'range' ? t('toInputLabel') : t('rightLabel')}</span>
                    <TextInput size='sm' type='date' value={dateText.b} aria-label={mode === 'range' ? t('toInputLabel') : t('rightLabel')}
                      onChange={(e: any) => { setDateText(d => ({ ...d, b: e.target.value })) }}
                      onBlur={(e: any) => { commitDate('b', e.target.value) }}
                      onKeyDown={(e: any) => { if (e.key === 'Enter') commitDate('b', e.target.value) }} />
                  </label>
                )}
              </div>
            )}

            <div className='tm-row' role='group' aria-label={t('playbackGroupLabel')}>
              {cfg.allowPlay !== false && mode !== 'compare' && (
                <React.Fragment>
                  <Button size='sm' type='tertiary' icon onClick={() => { setA(0) }} title={t('toStart')} aria-label={t('toStart')}><CalciteIcon icon='beginning' scale='s' /></Button>
                  <Button size='sm' type='tertiary' icon onClick={() => { setA(v => clamp(v - stepN, 0, count)) }} title={t('stepBack')} aria-label={t('stepBack')}><CalciteIcon icon='chevron-left' scale='s' /></Button>
                  <Button size='sm' type={playing ? 'primary' : 'default'} icon onClick={togglePlay} title={playing ? t('pause') : t('play')} aria-label={playing ? t('pause') : t('play')}>
                    <CalciteIcon icon={playing ? 'pause' : 'play'} scale='s' />
                  </Button>
                  <Button size='sm' type='tertiary' icon onClick={() => { setA(v => clamp(v + stepN, 0, count)) }} title={t('stepForward')} aria-label={t('stepForward')}><CalciteIcon icon='chevron-right' scale='s' /></Button>
                  <Button size='sm' type='tertiary' icon onClick={() => { setA(mode === 'range' ? b : count) }} title={t('toEnd')} aria-label={t('toEnd')}><CalciteIcon icon='end' scale='s' /></Button>
                  <Select size='sm' value={String(speed)} aria-label={t('speed')} title={t('speed')} style={{ width: 104 }} onChange={(e: any) => { setSpeed(Number(e.target.value)) }}>
                    {SPEEDS.map(s => <Option key={s.key} value={String(s.factor)}>{t(s.key)}</Option>)}
                  </Select>
                </React.Fragment>
              )}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <Button size='sm' type='default' onClick={jumpToday}>{mode === 'single' ? t('today') : t('resetRange')}</Button>
                <Button size='sm' type='tertiary' onClick={resetAll} title={t('resetHint')}><CalciteIcon icon='reset' scale='s' />&nbsp;{t('reset')}</Button>
              </span>
            </div>
            {activity && mode !== 'compare' && (
              <div className='tm-row'>
                <Button size='sm' type='tertiary' onClick={() => { jumpChange(-1) }} title={t('prevChangeHint')}><CalciteIcon icon='beginning' scale='s' />&nbsp;{t('prevChange')}</Button>
                <Button size='sm' type='tertiary' onClick={() => { jumpChange(1) }} title={t('nextChangeHint')}>{t('nextChange')}&nbsp;<CalciteIcon icon='end' scale='s' /></Button>
              </div>
            )}
            {(cfg.allowPresent !== false || cfg.allowShareLink !== false) && (
              <div className='tm-row'>
                {cfg.allowPresent !== false && (
                  presenting
                    ? <Button size='sm' type='primary' onClick={exitPresent} title={t('presentExit')}><CalciteIcon icon='presentation' scale='s' />&nbsp;{t('presentExit')}</Button>
                    : <Button size='sm' type='default' onClick={startPresent} title={t('presentHint')} ref={presentBtnRef as any}><CalciteIcon icon='presentation' scale='s' />&nbsp;{t('present')}</Button>
                )}
                {cfg.allowShareLink !== false && (
                  <Button size='sm' type='tertiary' onClick={copyLink} title={t('copyLinkHint')}><CalciteIcon icon='link' scale='s' />&nbsp;{t('copyLink')}</Button>
                )}
                {presenting && <span className='tm-dim' style={{ flexBasis: '100%' }}>{t('presentKeys')} {cfg.showHelp !== false && <button type='button' className='tm-link' onClick={openHelp}>{t('presentKeysMore')}</button>}</span>}
              </div>
            )}

            {cfg.allowPresent !== false && cfg.allowStoryDraft !== false && (
              <div className='tm-section'>
                <button type='button' className='tm-sechead' aria-expanded={storyOpen} onClick={() => { setStoryOpen(o => !o) }}>
                  <CalciteIcon icon={storyOpen ? 'chevron-down' : 'chevron-right'} scale='s' />
                  <span style={{ flex: 1 }}>{t('storyTitle')}</span>
                  <span className='tm-dim'>{draft.length ? t('storyCount', { n: String(draft.length) }) : ''}</span>
                </button>
                {storyOpen && (
                  <section aria-label={t('storyTitle')}>
                    <div className='tm-dim' style={{ margin: '0 0 6px 0' }}>{t('storyIntro')}</div>
                    <div className='tm-row'>
                      <Button size='sm' type='primary' onClick={addChapterFromMap} title={t('storyAddHint')}><CalciteIcon icon='plus' scale='s' />&nbsp;{t('storyAdd')}</Button>
                    </div>
                    {draft.map((c, i) => (
                      <div className='tm-story' key={i}>
                        <div className='tm-row' style={{ margin: 0 }}>
                          <span className='tm-dim' style={{ width: 18 }}>{i + 1}.</span>
                          <TextInput size='sm' value={c.title || ''} placeholder={t('storyTitlePlaceholder')} aria-label={t('storyChapterTitle', { n: String(i + 1) })} style={{ flex: 1, minWidth: 120 }}
                            onChange={(e: any) => { updateDraft(i, { title: e.target.value }) }} />
                          <span className='tm-dim'>{formatDate(parseIsoDate(c.date), g)}</span>
                        </div>
                        <TextArea height={48} className='w-100' value={c.text || ''} placeholder={t('storyTextPlaceholder')} aria-label={t('storyChapterText', { n: String(i + 1) })}
                          onChange={(e: any) => { updateDraft(i, { text: e.target.value }) }} />
                        <TextArea height={40} className='w-100' value={c.notes || ''} placeholder={t('storyNotesPlaceholder')} aria-label={t('storyChapterNotes', { n: String(i + 1) })}
                          onChange={(e: any) => { updateDraft(i, { notes: e.target.value }) }} />
                        <div className='tm-row' style={{ margin: 0 }}>
                          <Button size='sm' type='tertiary' icon onClick={() => { saveDraft(moveChapter(draft, i, -1)) }} disabled={i === 0} title={t('storyUp')} aria-label={t('storyUp')}><CalciteIcon icon='chevron-up' scale='s' /></Button>
                          <Button size='sm' type='tertiary' icon onClick={() => { saveDraft(moveChapter(draft, i, 1)) }} disabled={i === draft.length - 1} title={t('storyDown')} aria-label={t('storyDown')}><CalciteIcon icon='chevron-down' scale='s' /></Button>
                          <Button size='sm' type='tertiary' onClick={() => { updateDraft(i, { date: toIsoDate(dateA) }) }} title={t('storySetDateHint')}>{t('storySetDate')}</Button>
                          <Button size='sm' type='tertiary' onClick={() => { const d = domainRef.current; if (d) setA(clamp(dateToIndex(d.start, parseIsoDate(c.date), g), 0, count)) }} title={t('storyGoHint')}>{t('storyGo')}</Button>
                          <Button size='sm' type='tertiary' onClick={() => { updateDraft(i, { hidden: !c.hidden }) }} title={t('storyHideHint')} aria-pressed={!!c.hidden}><CalciteIcon icon={c.hidden ? 'view-hide' : 'view-visible'} scale='s' />&nbsp;{c.hidden ? t('storyHidden') : t('storyShown')}</Button>
                          <Button size='sm' type='tertiary' onClick={() => { saveDraft(draft.filter((_x, j) => j !== i)) }} title={t('storyRemove')} aria-label={t('storyRemove')} style={{ marginLeft: 'auto' }}><CalciteIcon icon='trash' scale='s' /></Button>
                        </div>
                      </div>
                    ))}
                    {draft.length > 0 && (
                      <div className='tm-row'>
                        <Button size='sm' type='default' onClick={copyStory} title={t('storyCopyHint')}><CalciteIcon icon='copy-to-clipboard' scale='s' />&nbsp;{t('storyCopy')}</Button>
                        <Button size='sm' type='tertiary' onClick={downloadStory} title={t('storyDownloadHint')}><CalciteIcon icon='download' scale='s' />&nbsp;{t('storyDownload')}</Button>
                        <Button size='sm' type='tertiary' onClick={() => { if (window.confirm(t('storyClearConfirm', { n: String(draft.length) }))) saveDraft([]) }} style={{ marginLeft: 'auto' }}>{t('storyClear')}</Button>
                      </div>
                    )}
                    {draft.length > 0 && Object.keys(dwellRef.current).length > 0 && (
                      <div className='tm-row'>
                        <Button size='sm' type='default' onClick={useRehearsed} title={t('storyRehearsedHint')}><CalciteIcon icon='clock' scale='s' />&nbsp;{t('storyRehearsed')}</Button>
                      </div>
                    )}
                    {draft.length > 0 && <div className='tm-dim'>{t('storyKeep')}</div>}
                    {activity && activity.bars.some(b => b.n > 0) && (
                      <div className='tm-adv' style={{ marginTop: 8 }}>
                        <div style={{ fontWeight: 600 }}>{t('autoTitle')}</div>
                        <div className='tm-dim'>{t('autoIntro')}</div>
                        <div className='tm-row' style={{ margin: 0 }}>
                          <Select size='sm' value={autoMode} aria-label={t('autoMode')} style={{ width: 170 }} onChange={(e: any) => { setAutoMode(e.target.value === 'every' ? 'every' : 'busiest') }}>
                            <Option value='busiest'>{t('autoBusiest')}</Option>
                            <Option value='every'>{t('autoEvery')}</Option>
                          </Select>
                          <NumericInput size='sm' min={1} max={100} step={1} value={autoN} aria-label={t('autoCount')} style={{ width: 80 }} showArrowButtons onChange={(v: number) => { setAutoN(Math.max(1, Math.min(100, Math.round(Number(v) || 1)))) }} />
                          <span className='tm-dim'>{autoMode === 'busiest' ? t('autoBusiestUnit', { unit: t(activity.unit === 'year' ? 'unitYears' : 'unitMonths') }) : t('autoEveryUnit', { unit: t(activity.unit === 'year' ? 'unitYears' : 'unitMonths') })}</span>
                          <Button size='sm' type='default' onClick={generateChapters}><CalciteIcon icon='magic-wand' scale='s' />&nbsp;{t('autoGo')}</Button>
                        </div>
                      </div>
                    )}
                    {chapters.length > 0 && cfg.allowDeck !== false && (
                      <div className='tm-adv' style={{ marginTop: 8 }}>
                        <div style={{ fontWeight: 600 }}>{t('deckTitle')}</div>
                        <div className='tm-dim'>{t('deckIntro', { n: String(chapters.length) })}</div>
                        <div className='tm-row' style={{ margin: 0 }}>
                          <Button size='sm' type='primary' disabled={!!deckBusy || presenting} onClick={() => { void exportDeck('html') }} title={t('deckHtmlHint')}><CalciteIcon icon='web' scale='s' />&nbsp;{t('deckHtml')}</Button>
                          {cfg.allowVideo !== false && <Button size='sm' type='default' disabled={!!deckBusy || presenting} onClick={() => { void exportVideo() }} title={t('videoHint', { s: String(Number(cfg.videoSeconds) || 30) })}><CalciteIcon icon='video' scale='s' />&nbsp;{t('video')}</Button>}
                          {deckBusy && <Button size='sm' type='tertiary' onClick={() => { deckCancel.current = true }}>{t('deckCancel')}</Button>}
                          {deckBusy && <span className='tm-dim' role='status'>{deckBusy}</span>}
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}

            {mode === 'compare' && (
              <div className='tm-row'>
                <label style={{ flex: 1 }}>
                  <span className='tm-dim'>{t('dividerLabel')}</span>
                  <CalciteSlider min={0} max={100} step={1} scale='s' value={position} label={t('dividerLabel')}
                    onCalciteSliderInput={(e: any) => { const v = Number(e.target.value); if (isFinite(v)) setPosition(Math.round(v)) }}
                    onCalciteSliderChange={(e: any) => { const v = Number(e.target.value); if (isFinite(v)) setPosition(Math.round(v)) }} />
                </label>
              </div>
            )}

            {cfg.showLayerList !== false && (targets.length > 0 || yearSets.length > 0) && (
              <div className='tm-section'>
                <button type='button' className='tm-sechead' aria-expanded={listOpen} onClick={() => { setListOpen(o => !o) }}>
                  <CalciteIcon icon={listOpen ? 'chevron-down' : 'chevron-right'} scale='s' />
                  <span style={{ flex: 1 }}>{t('layersTitle')}</span>
                  <span className='tm-dim'>{t('layersCount', { n: String(onCount), total: String(shown.length) })}</span>
                </button>
                {listOpen && (
                  <section aria-label={t('layersTitle')}>
                    <div className='tm-dim' style={{ margin: '0 0 6px 0' }}>{t('layersIntro')}</div>
                    {shown.length === 0 && <div className='tm-dim'>{t('layersNoneOn')}</div>}
                    {targets.length > shown.length && <div className='tm-dim'>{t('layersOffCount', { n: String(targets.length - shown.length) })}</div>}
                    {(shown.length > 1 || layerFilter) && (
                      <div className='tm-row' style={{ margin: '2px 0 6px 0' }}>
                        <Button size='sm' type='tertiary' onClick={() => { setAllTargets(true) }}>{t('allOn')}</Button>
                        <Button size='sm' type='tertiary' onClick={() => { setAllTargets(false) }}>{t('allOff')}</Button>
                        {targets.filter(x => x.on).length > 6 && (
                          <TextInput size='sm' value={layerFilter} placeholder={t('layerFilter')} aria-label={t('layerFilter')} style={{ marginLeft: 'auto', width: 140 }} onChange={(e: any) => { setLayerFilter(e.target.value) }} allowClear />
                        )}
                      </div>
                    )}
                    {shown.map(x => {
                      const choice = !x.fixed && !x.pick.end && x.dateFields.length > 1
                      const alias = (n: string): string => { const f = x.dateFields.find(d => d.name === n); return (f && f.alias) || n }
                      return (
                        <div className='tm-layer' key={x.key}>
                          <label>
                            <Checkbox checked={x.enabled} onChange={(_e: any, checked: boolean) => { toggleTarget(x.key, !!checked) }} aria-label={x.title} />
                            <span className='tm-lt'>
                              <span className='tm-ln' title={x.title}>{x.title}{cfg.showCounts !== false && x.enabled && x.kind === 'layer' && typeof counts[x.key] === 'number' ? <span className='tm-dim'> ({t('countLabel', { n: String(counts[x.key]) })})</span> : null}</span>
                              <span className='tm-dim' title={String((x.target && x.target.definitionExpression) || '')}>{x.pick.end ? t('layerSpanPlain', { start: alias(x.pick.start), end: alias(x.pick.end) }) : t('layerUses', { field: alias(x.pick.start) })}{x.pick.startDateOnly ? ' (date only)' : ''}</span>
                            </span>
                          </label>
                          {choice && (
                            <Select size='sm' value={x.pick.start} aria-label={t('layerFieldChoice', { layer: x.title })} title={t('layerFieldChoice', { layer: x.title })} style={{ width: 150, flexShrink: 0 }}
                              onChange={(e: any) => { setTargetField(x.key, String(e.target.value)) }}>
                              {x.dateFields.map(f => <Option key={f.name} value={f.name}>{f.alias || f.name}</Option>)}
                            </Select>
                          )}
                        </div>
                      )
                    })}
                    {yearSets.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div className='tm-dim' style={{ fontWeight: 600, marginBottom: 2 }}>{t('yearSetsTitle')}</div>
                        {yearSets.map(s => {
                          const shown = s.children.find(c => c.year != null && c.layer && c.layer.visible)
                          return (
                            <div className='tm-layer' key={s.key}>
                              <span className='tm-lt'>
                                <span className='tm-ln' title={s.title}>{s.title}</span>
                                <span className='tm-dim'>{shown ? t('yearSetShowing', { year: String(shown.year) }) : t('yearSetNone')}</span>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {skipped.length > 0 && (
                      <details className='tm-skipped'>
                        <summary>{t('layersSkipped', { n: String(skipped.length) })}</summary>
                        {skipped.map((s, i) => <div className='tm-dim' key={i}>{s.title}: {t(s.reason === 'no-date-field' ? 'skipNoDate' : s.reason === 'no-fields' ? 'skipNoFields' : s.reason === 'rule-off' ? 'skipRuleOff' : 'skipNotInRules')}</div>)}
                      </details>
                    )}
                  </section>
                )}
              </div>
            )}
          </React.Fragment>
        )}
      </div>
    </div>
  )
}

/**
 * A render error inside the panel must not take the app down or show a blank widget:
 * the boundary shows the message so it can be reported, and Try again re-mounts.
 */
class Boundary extends React.Component<{ children: any }, { error: string | null }> {
  declare props: { children: any }
  declare state: { error: string | null }
  declare setState: (s: any) => void
  constructor (p: { children: any }) { super(p); this.state = { error: null } }
  static getDerivedStateFromError (e: any): { error: string } { return { error: String((e && e.message) || e) } }
  componentDidCatch (e: any): void { try { console.error('[time-machine]', e) } catch (err) { /* ignore */ } }
  render (): any {
    if (this.state.error) {
      return (
        <div style={{ padding: 12, fontSize: 13 }} role='alert'>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Time Machine hit an error</div>
          <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 8 }}>{this.state.error}</div>
          <Button size='sm' type='primary' onClick={() => { this.setState({ error: null }) }}>Try again</Button>
        </div>
      )
    }
    return this.props.children
  }
}

const Guarded: React.FC<Props> = (props) => <Boundary><Widget {...props} /></Boundary>

export default Guarded
