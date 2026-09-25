/** @jsx jsx */
/**
 * Time Machine - builder settings.
 * Nothing under src/setting may import esri/* (handoff Section 12, item 1).
 * Author: Brian McLeer, City of Grand Junction
 */
import { React, jsx, css, Immutable } from 'jimu-core'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { Button, Select, Option, TextInput, TextArea, NumericInput, Switch, Alert, Tooltip, Checkbox } from 'jimu-ui'
import { type IMConfig, type Config, type LayerRule, type YearSet, type Chapter, CONFIG_DEFAULTS } from '../config'
import { configToXml, xmlToConfig } from '../configXml'
import { FONT_CHOICES, cleanColor, contrastRatio, contrastText, fontStack } from '../runtime/lib/brand'
import defaultMessages from './translations/default'

// Local structural type instead of AllWidgetSettingProps from jimu-for-builder, which the
// master editor shim declares shorthand (TS2709 in Visual Studio). Same shape at runtime.
interface SettingProps {
  id: string
  config: IMConfig
  onSettingChange: (settings: any, ...rest: any[]) => void
  useMapWidgetIds?: any
  [key: string]: any
}

/** A dated layer read from the map in the builder, for the layer picker. */
interface MapLayerInfo { key: string, title: string, group: string, dateFields: Array<{ name: string, alias: string }> }
/** Every layer of the map, dated or not, for the chapter layer picker. */
interface MapAnyLayer { key: string, title: string, group: string }

interface State {
  importXml: string
  ieError: string | null
  ieSuccess: string | null
  dateErrors: Record<string, boolean>
  mapLayers: MapLayerInfo[] | null
  allLayers: MapAnyLayer[]
  pickerFor: number | null
  mapLayersBusy: boolean
  mapLayersError: string | null
  pickSearch: string
  closedGroups: Record<string, boolean>
}

/**
 * Reads the dated layers of the selected map through the data source manager (no esri/*
 * import). Keys match the runtime: web map layer id, or "<layer id>::<sublayer id>".
 */
async function readMapLayers (mapWidgetId: string, all?: MapAnyLayer[]): Promise<MapLayerInfo[]> {
  const core: any = require('jimu-core')
  const state: any = core.getAppStore().getState()
  const appConfig: any = state.appStateInBuilder?.appConfig || state.appConfig
  const mapWidget = appConfig?.widgets?.[mapWidgetId]
  const uses: any[] = (mapWidget?.useDataSources && typeof mapWidget.useDataSources.asMutable === 'function' ? mapWidget.useDataSources.asMutable({ deep: true }) : mapWidget?.useDataSources) || []
  const dsm = core.DataSourceManager.getInstance()
  const out: MapLayerInfo[] = []
  const seen = new Set<string>()
  const label = (ds: any): string => (ds && typeof ds.getLabel === 'function' && ds.getLabel()) || (ds && ds.id) || ''
  const readSchema = async (ds: any): Promise<Array<{ name: string, alias: string }>> => {
    let schema = typeof ds.getSchema === 'function' ? ds.getSchema() : null
    if ((!schema || !schema.fields || Object.keys(schema.fields).length === 0) && typeof ds.fetchSchema === 'function') {
      try { schema = await ds.fetchSchema() } catch (e) { schema = null }
    }
    const fields: any = schema?.fields || {}
    const list: Array<{ name: string, alias: string }> = []
    for (const k of Object.keys(fields)) {
      const f = fields[k]
      if (f && f.esriType === 'esriFieldTypeDate') list.push({ name: f.name || f.jimuName || k, alias: f.alias || f.name || k })
    }
    return list
  }
  /** Group path of a layer from the SDK layer objects (the map in the builder is rendered, so `layer.parent` is there). */
  const sdkPath = (ds: any): string[] => {
    const path: string[] = []
    let lyr: any = ds && ds.layer
    for (let guard = 0; lyr && lyr.parent && guard < 10; guard++) {
      const p = lyr.parent
      if (p.type === 'group' || p.type === 'map-image' || p.type === 'tile') path.unshift(String(p.title || p.id || ''))
      lyr = p
    }
    return path
  }
  /** Direct children of a data source, created if the builder has not made them yet. */
  const childrenOf = async (ds: any): Promise<any[]> => {
    let kids: any[] = typeof ds.getChildDataSources === 'function' ? (ds.getChildDataSources() || []) : []
    if (!kids.length && typeof ds.childDataSourcesReady === 'function') {
      try { await ds.childDataSourcesReady(); kids = ds.getChildDataSources() || [] } catch (e) { kids = [] }
    }
    return kids
  }
  const isGroupType = (ds: any): boolean => ds && (ds.type === 'GROUP_LAYER' || ds.type === 'MAP_SERVICE' || ds.type === 'FEATURE_SERVICE' || ds.type === 'SUBTYPE_GROUP_LAYER')
  let baseLen = 0
  const walk = async (ds: any, path: string[], mapDs: any, serviceParent: any): Promise<void> => {
    if (!ds) return
    const kids = await childrenOf(ds)
    if (kids.length && (isGroupType(ds) || ds !== mapDs)) {
      // a group layer, a map service with sublayers, or a feature service with layers: a heading
      const here = ds === mapDs ? path : path.concat(label(ds))
      for (const k of kids) await walk(k, here, mapDs, ds.type === 'MAP_SERVICE' ? ds : serviceParent)
      return
    }
    if (ds === mapDs) { for (const k of kids) await walk(k, path, mapDs, null); return }
    if (typeof ds.getSchema !== 'function') return
    const parent = typeof ds.getParentDataSource === 'function' ? ds.getParentDataSource() : null
    const sub = serviceParent || (parent && parent !== mapDs && parent.type === 'MAP_SERVICE' ? parent : null)
    const key = sub ? `${sub.jimuChildId || sub.id}::${ds.jimuChildId || ds.id}` : String(ds.jimuChildId || ds.id)
    if (seen.has(key)) return
    seen.add(key)
    const title = label(ds)
    const fromSdk = path.length <= baseLen ? sdkPath(ds) : []
    const group = path.concat(fromSdk).join(' / ')
    if (all) all.push({ key, title, group })
    try { if (typeof ds.ready === 'function') await ds.ready() } catch (e) { /* schema may still be there */ }
    const dateFields = await readSchema(ds)
    if (!dateFields.length) return
    out.push({ key, title, group, dateFields })
  }
  for (const u of uses) {
    let mapDs: any
    try { mapDs = await dsm.createDataSourceByUseDataSource(u) } catch (e) { continue }
    if (!mapDs) continue
    try { if (typeof mapDs.ready === 'function') await mapDs.ready() } catch (e) { /* keep going */ }
    // a map widget with more than one map: the map name heads the list, so layers are picked for the right map
    const base = uses.length > 1 ? [label(mapDs)] : []
    baseLen = base.length
    await walk(mapDs, base, mapDs, null)
    // anything the tree walk missed (children the builder created flat): take it with the SDK path
    const flat: any[] = typeof mapDs.getAllChildDataSources === 'function' ? mapDs.getAllChildDataSources() : []
    for (const c of flat) { if (c && typeof c.getSchema === 'function') await walk(c, base, mapDs, null) }
  }
  return out
}

const ISO = /^\s*(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?\s*$/

export default class Setting extends React.PureComponent<SettingProps, State> {
  declare readonly props: SettingProps
  declare state: State
  declare setState: (partial: any, callback?: () => void) => void

  private xmlInputRef = React.createRef<HTMLInputElement>()

  constructor (props: SettingProps) {
    super(props)
    this.state = { importXml: '', ieError: null, ieSuccess: null, dateErrors: {}, mapLayers: null, allLayers: [], pickerFor: null, mapLayersBusy: false, mapLayersError: null, pickSearch: '', closedGroups: {} }
  }

  /* ---------------------------------------------------------------- helpers */

  private cfg = (): any => (this.props.config as any) || Immutable({})
  private get = <K extends keyof Config>(k: K): Config[K] => {
    const v = this.cfg()[k]
    return (v === undefined || v === null ? (CONFIG_DEFAULTS as any)[k] : v) as Config[K]
  }
  private plain = (): Config => {
    const c: any = this.cfg()
    return typeof c.asMutable === 'function' ? c.asMutable({ deep: true }) : { ...c }
  }

  private set = (key: keyof Config, value: any): void => {
    const base: any = this.cfg()
    this.props.onSettingChange({
      id: this.props.id,
      config: value === undefined || value === '' ? base.without(key) : base.set(key as any, value)
    })
  }

  private onMapSelected = (ids: string[]): void => {
    this.props.onSettingChange({ id: this.props.id, useMapWidgetIds: ids })
  }

  private setDate = (key: 'startDate' | 'endDate' | 'defaultDate', text: string): void => {
    const ok = text.trim() === '' || ISO.test(text)
    this.setState({ dateErrors: { ...this.state.dateErrors, [key]: !ok } })
    if (ok) this.set(key, text.trim())
  }

  private loadMapLayers = (): void => {
    const ids: any = this.props.useMapWidgetIds
    const mapId: string = ids && (typeof ids.asMutable === 'function' ? ids.asMutable()[0] : ids[0])
    const m = defaultMessages
    if (!mapId) { this.setState({ mapLayersError: m.pickNoMap }); return }
    this.setState({ mapLayersBusy: true, mapLayersError: null })
    const all: MapAnyLayer[] = []
    readMapLayers(mapId, all).then(list => {
      this.setState({ mapLayers: list, allLayers: all, mapLayersBusy: false, mapLayersError: list.length ? null : m.pickNone })
    }).catch(() => { this.setState({ mapLayersBusy: false, mapLayersError: m.pickFail }) })
  }

  /** Ticks a picked layer: one rule per layer, mode field, keyed by the runtime layer key. */
  private pickLayer = (layer: MapLayerInfo, on: boolean, field?: string): void => {
    const rules = this.rules().filter(r => r.layerId !== layer.key)
    if (on) rules.push({ layerId: layer.key, title: layer.title, mode: 'field', startField: field || layer.dateFields[0].name, endField: '' })
    this.setRules(rules)
  }

  /** Ticks or clears a whole group (or every layer) in one go; ticked layers keep their field. */
  private pickMany = (layers: MapLayerInfo[], on: boolean): void => {
    const keys = new Set(layers.map(l => l.key))
    const rules = this.rules()
    const kept = rules.filter(r => !keys.has(r.layerId))
    if (on) {
      for (const l of layers) {
        const old = rules.find(r => r.layerId === l.key && r.mode !== 'off')
        kept.push(old || { layerId: l.key, title: l.title, mode: 'field', startField: l.dateFields[0].name, endField: '' })
      }
    }
    this.setRules(kept)
  }

  /** Dated layers grouped by their group layer path, in map order; ungrouped layers first. */
  private groupedLayers = (): Array<{ group: string, layers: MapLayerInfo[] }> => {
    const q = this.state.pickSearch.trim().toLowerCase()
    const out: Array<{ group: string, layers: MapLayerInfo[] }> = []
    for (const l of this.state.mapLayers || []) {
      if (q && l.title.toLowerCase().indexOf(q) < 0 && l.group.toLowerCase().indexOf(q) < 0) continue
      let g = out.find(x => x.group === l.group)
      if (!g) { g = { group: l.group, layers: [] }; out.push(g) }
      g.layers.push(l)
    }
    return out.sort((a, b) => (a.group ? 1 : 0) - (b.group ? 1 : 0))
  }

  /** One row of the layer picker: checkbox, title, and the date field when more than one. */
  private layerRow (l: MapLayerInfo, rules: LayerRule[], indent: boolean): any {
    const m = defaultMessages
    const rule = rules.find(r => r.layerId === l.key)
    const on = !!rule && rule.mode !== 'off'
    const field = rule && rule.startField && l.dateFields.some(f => f.name === rule.startField) ? rule.startField : l.dateFields[0].name
    return (
      <div className={'tm-pickrow' + (indent ? ' tm-pickrow-in' : '')} key={l.key}>
        <label className='tm-picklabel'>
          <Checkbox checked={on} aria-label={l.title} onChange={(_e: any, checked: boolean) => { this.pickLayer(l, !!checked, field) }} />
          <span className='tm-picktitle' title={l.key}>{l.title}</span>
        </label>
        {on && l.dateFields.length > 1 && (
          <Select size='sm' value={field} aria-label={m.pickField + ': ' + l.title} className='tm-pickfield' onChange={(e: any) => { this.pickLayer(l, true, String(e.target.value)) }}>
            {l.dateFields.map(f => <Option key={f.name} value={f.name}>{f.alias}</Option>)}
          </Select>
        )}
        {on && l.dateFields.length === 1 && <span className='tm-hint tm-pickfield' style={{ margin: 0 }}>{l.dateFields[0].alias}</span>}
      </div>
    )
  }

  /** One color row: native color picker, the text beside it, and a way back to the theme. */
  private colorRow (key: 'brandBackground' | 'brandText' | 'brandMuted' | 'brandAccent', label: string): any {
    const m = defaultMessages
    const v = String(this.get(key) || '')
    const clean = cleanColor(v)
    const forPicker = /^#[0-9a-f]{6}$/i.test(clean) ? clean : '#000000'
    return (
      <div className='tm-cardrow' key={key}>
        <label style={{ flex: '0 0 130px' }}><span className='tm-lbl'>{label}</span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type='color' value={forPicker} aria-label={label} aria-describedby={v && !/^#[0-9a-f]{6}$/i.test(clean) ? `${this.props.id}-${key}-note` : undefined} style={{ width: 34, height: 26, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
              onChange={(e: any) => { this.set(key, e.target.value) }} />
            <TextInput size='sm' value={v} placeholder={m.brandTheme} aria-label={`${label} ${m.brandHex}`} onChange={(e: any) => { this.set(key, e.target.value) }} style={{ width: 96 }} />
          </span>
        </label>
        {v && !clean && <span className='tm-hint' style={{ margin: 0, flex: '0 0 auto' }}>{m.brandBadColor}</span>}
        {v && clean && !/^#[0-9a-f]{6}$/i.test(clean) && <span id={`${this.props.id}-${key}-note`} className='tm-hint' style={{ margin: 0, flex: '0 0 auto' }}>{m.brandPickerHex}</span>}
        {v && <Button size='sm' type='tertiary' onClick={() => { this.set(key, undefined) }} style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>{m.brandTheme}</Button>}
      </div>
    )
  }

  private renderBrand (): any {
    const m = defaultMessages
    const bg = cleanColor(String(this.get('brandBackground') || '')) || '#ffffff'
    const tx = cleanColor(String(this.get('brandText') || '')) || '#1f1f1f'
    const mu = cleanColor(String(this.get('brandMuted') || '')) || '#6b6b6b'
    const ac = cleanColor(String(this.get('brandAccent') || '')) || '#0079c1'
    const font = fontStack(String(this.get('brandFont') || ''))
    const dateSize = Number(this.get('brandDateSize')) || 30
    const radius = Number(this.get('brandRadius')); const rad = isFinite(radius) && radius >= 0 ? radius : 8
    const logo = String(this.get('brandLogo') || '')
    // the preview only shows a plain https address: no quotes, angle brackets, spaces or other markup characters
    const previewLogo = ((): string => { const clean = logo.replace(/[<>"'&\s]/g, ''); return /^https:\/\/[\w./%~:-]+$/i.test(clean) ? clean : '' })()
    const logoH = Number(this.get('brandLogoHeight')) || 32
    // warnings only when both sides are the builder's; against the theme they would mislead
    const bgSet = !!cleanColor(String(this.get('brandBackground') || '')); const txSet = !!cleanColor(String(this.get('brandText') || '')); const muSet = !!cleanColor(String(this.get('brandMuted') || '')); const acSet = !!cleanColor(String(this.get('brandAccent') || ''))
    const ratioText = bgSet && txSet ? contrastRatio(bg, tx) : null; const ratioMuted = bgSet && muSet ? contrastRatio(bg, mu) : null; const ratioAccent = bgSet && acSet ? contrastRatio(bg, ac) : null
    const fontKey = String(this.get('brandFont') || '')
    const known = !fontKey || FONT_CHOICES.some(f => f.key === fontKey)
    return (
      <div className='tm-card'>
        {this.colorRow('brandBackground', m.brandBackground)}
        {this.colorRow('brandText', m.brandText)}
        {this.colorRow('brandMuted', m.brandMuted)}
        {this.colorRow('brandAccent', m.brandAccent)}
        {(ratioText !== null && ratioText < 4.5) && <Alert type='warning' text={m.brandLowContrast.replace('{r}', String(ratioText))} />}
        {(ratioMuted !== null && ratioMuted < 4.5 && !(ratioText !== null && ratioText < 4.5)) && <Alert type='warning' text={m.brandLowContrastMuted.replace('{r}', String(ratioMuted))} />}
        {(ratioAccent !== null && ratioAccent < 3) && <Alert type='warning' text={m.brandLowContrastAccent.replace('{r}', String(ratioAccent))} />}
        <div className='tm-cardrow'>
          <label><span className='tm-lbl'>{m.brandFont}</span>
            <Select size='sm' value={known ? (fontKey || 'system') : 'custom'} aria-label={m.brandFont} onChange={(e: any) => { const v = e.target.value; this.set('brandFont', v === 'system' ? undefined : v === 'custom' ? 'Custom font' : v) }}>
              {FONT_CHOICES.map(f => <Option key={f.key} value={f.key}>{f.label}</Option>)}
              <Option value='custom'>{m.brandFontCustom}</Option>
            </Select>
          </label>
          {!known && <label><span className='tm-lbl'>{m.brandFontName}</span><TextInput size='sm' value={fontKey} aria-label={m.brandFontName} onChange={(e: any) => { this.set('brandFont', e.target.value) }} /></label>}
        </div>
        <div className='tm-cardrow'>
          <label><span className='tm-lbl'>{m.brandDateSize}</span><NumericInput size='sm' min={14} max={96} step={2} value={dateSize} aria-label={m.brandDateSize} onChange={(v: number) => { if (isFinite(v)) this.set('brandDateSize', Math.round(v)) }} /></label>
          <label><span className='tm-lbl'>{m.brandRadius}</span><NumericInput size='sm' min={0} max={40} step={1} value={rad} aria-label={m.brandRadius} onChange={(v: number) => { if (isFinite(v)) this.set('brandRadius', Math.round(v)) }} /></label>
        </div>
        <div className='tm-cardrow'>
          <label style={{ flex: 2 }}><span className='tm-lbl'>{m.brandLogo}</span><TextInput size='sm' value={logo} placeholder='https://' aria-label={m.brandLogo} onChange={(e: any) => { this.set('brandLogo', e.target.value) }} /></label>
          <label><span className='tm-lbl'>{m.brandLogoHeight}</span><NumericInput size='sm' min={12} max={120} step={4} value={logoH} aria-label={m.brandLogoHeight} onChange={(v: number) => { if (isFinite(v)) this.set('brandLogoHeight', Math.round(v)) }} /></label>
        </div>
        <span className='tm-hint'>{m.brandLogoHint}</span>
        <div aria-hidden='true' style={{ background: bg, color: tx, borderRadius: rad, borderLeft: `5px solid ${ac}`, padding: '10px 12px', fontFamily: font || 'inherit', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: Math.min(dateSize, 40), fontWeight: 700 }}>1994</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: mu, fontSize: 12 }}>{m.brandPreviewChapter}</span>
              {previewLogo && <img src={previewLogo} alt='' style={{ height: Math.min(logoH, 40), maxWidth: 120, objectFit: 'contain' }} />}
            </span>
          </div>
          <div style={{ fontWeight: 600, marginTop: 4 }}>{m.brandPreviewTitle}</div>
          <div style={{ fontSize: 13 }}>{m.brandPreviewText}</div>
          <div style={{ height: 6, background: mu, opacity: 0.3, borderRadius: 3, margin: '8px 0' }}><div style={{ width: '40%', height: '100%', background: ac, borderRadius: 3, opacity: 1 }} /></div>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 999, background: ac, color: contrastText(ac), fontSize: 12 }}>{m.brandPreviewButton}</span>
            <span style={{ color: ac, fontSize: 18, lineHeight: 1 }} title={m.brandPreviewIcons}>&#9664; &#9654; &#10005;</span>
          </span>
        </div>
        <Button size='sm' type='tertiary' onClick={() => { for (const k of ['brandBackground', 'brandText', 'brandMuted', 'brandAccent', 'brandFont', 'brandDateSize', 'brandRadius', 'brandLogo', 'brandLogoHeight'] as Array<keyof Config>) this.set(k, undefined) }}>{m.brandReset}</Button>
      </div>
    )
  }

  private rules = (): LayerRule[] => (this.get('rules') as any[] || []).map(r => ({ ...r }))
  private setRules = (rules: LayerRule[]): void => { this.set('rules', rules.length ? rules : undefined) }
  private yearSets = (): YearSet[] => (this.get('yearSets') as any[] || []).map(r => ({ ...r }))
  private setYearSets = (sets: YearSet[]): void => { this.set('yearSets', sets.length ? sets : undefined) }
  private chapters = (): Chapter[] => (this.get('chapters') as any[] || []).map(r => ({ ...r }))
  private setChapters = (list: Chapter[]): void => { this.set('chapters', list.length ? list : undefined) }
  private numOrUndef = (v: string): number | undefined => { const n = Number(v); return v.trim() === '' || !isFinite(n) ? undefined : n }

  /* ---------------------------------------------------------------- import / export */

  private exportable = (): any => {
    const c: any = this.plain()
    delete c.useMapWidgetIds
    return c
  }

  copyConfig = (): void => {
    const m: any = defaultMessages
    const xml = configToXml(this.exportable())
    try { void navigator.clipboard.writeText(xml); this.setState({ ieSuccess: m.ieCopied, ieError: null }) } catch (e) { this.setState({ ieError: m.ieCopyFail, ieSuccess: null }) }
  }

  downloadConfig = (): void => {
    const xml = configToXml(this.exportable())
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'time-machine-config.xml'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  onXmlFileChosen = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const m: any = defaultMessages
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { this.setState({ importXml: String(ev.target?.result || ''), ieError: null, ieSuccess: null }) }
    reader.onerror = () => { this.setState({ ieError: m.ieReadFail }) }
    reader.readAsText(file)
  }

  importConfig = (): void => {
    const m: any = defaultMessages
    const text = (this.state.importXml || '').trim()
    if (!text) { this.setState({ ieError: m.ieEmpty, ieSuccess: null }); return }
    try {
      const parsed: any = xmlToConfig(text)
      const next: any = Immutable(parsed)
      this.props.onSettingChange({ id: this.props.id, config: next })
      this.setState({ importXml: '', ieError: null, ieSuccess: m.ieImported })
    } catch (e: any) {
      this.setState({ ieError: e && e.message === 'ROOT' ? m.ieBad : ((e && e.message) || m.ieBad), ieSuccess: null })
    }
  }

  /* ---------------------------------------------------------------- render */

  render (): React.ReactNode {
    const m: any = defaultMessages
    const rules = this.rules()
    const sets = this.yearSets()
    const chapters = this.chapters()
    const style = css`
      .tm-hint { font-size: 12px; color: var(--sys-color-surface-paper-hint, inherit); margin-top: 2px; line-height: 1.4; }
      .tm-card { border: 1px solid var(--sys-color-divider-secondary, rgba(0,0,0,0.15)); border-radius: 4px; padding: 8px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 6px; }
      .tm-card .tm-cardrow { display: flex; gap: 6px; align-items: center; }
      .tm-card .tm-cardrow > * { flex: 1; min-width: 0; }
      .tm-lbl { font-size: 12px; display: block; margin-bottom: 2px; }
      .tm-pick { width: 100%; border: 1px solid var(--sys-color-divider-secondary, rgba(0,0,0,0.15)); border-radius: 4px; max-height: 360px; overflow: auto; }
      .tm-pickbar { display: flex; gap: 6px; align-items: center; width: 100%; margin: 6px 0; flex-wrap: wrap; }
      .tm-pickbar .tm-picksearch { flex: 1 1 140px; min-width: 0; }
      .tm-pickrow { display: flex; gap: 6px; align-items: center; padding: 4px 8px; min-height: 30px; border-top: 1px solid var(--sys-color-divider-secondary, rgba(0,0,0,0.1)); }
      .tm-pickrow:first-child { border-top: 0; }
      .tm-pickrow-in { padding-left: 26px; }
      .tm-pickgroup { background: var(--sys-color-surface-background, rgba(0,0,0,0.05)); font-weight: 600; }
      .tm-pickgroup .tm-picktoggle { flex: 0 0 auto; width: 22px; height: 22px; padding: 0; line-height: 1; }
      .tm-picklabel { display: flex; gap: 6px; align-items: center; flex: 1; min-width: 0; margin: 0; cursor: pointer; }
      .tm-picktitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tm-pickcount { font-size: 11px; font-weight: 400; color: var(--sys-color-surface-paper-hint, inherit); flex: 0 0 auto; }
      .tm-pickfield { flex: 0 0 auto; max-width: 45%; }
    `
    const ruleModes: Array<[string, string]> = [['auto', m.ruleModeAuto], ['field', m.ruleModeField], ['span', m.ruleModeSpan], ['off', m.ruleModeOff]]

    return (
      <div css={style}>
        <SettingSection title={m.selectMap}>
          <SettingRow>
            <MapWidgetSelector useMapWidgetIds={this.props.useMapWidgetIds} onSelect={this.onMapSelected} />
          </SettingRow>
          <div className='tm-hint'>{m.selectMapHint}</div>
        </SettingSection>

        <SettingSection title={m.secRange}>
          <SettingRow label={m.granularity} flow='wrap'>
            <Select size='sm' value={this.get('granularity')} aria-label={m.granularity} onChange={(e: any) => { this.set('granularity', e.target.value) }}>
              <Option value='day'>{m.granDay}</Option>
              <Option value='month'>{m.granMonth}</Option>
              <Option value='year'>{m.granYear}</Option>
            </Select>
            <div className='tm-hint'>{m.granularityHint}</div>
          </SettingRow>
          {(['startDate', 'endDate', 'defaultDate'] as const).map(k => (
            <SettingRow key={k} label={m[k]} flow='wrap'>
              <TextInput size='sm' placeholder='yyyy-mm-dd' aria-label={m[k]} value={String(this.get(k) || '')}
                onChange={(e: any) => { this.set(k, e.target.value) }} onBlur={(e: any) => { this.setDate(k, e.target.value) }} />
              <div className='tm-hint'>{this.state.dateErrors[k] ? m.badDate : m[k + 'Hint']}</div>
            </SettingRow>
          ))}
          <SettingRow label={m.stepSize} flow='wrap'>
            <NumericInput size='sm' min={1} max={1000} step={1} value={Number(this.get('stepSize')) || 1} aria-label={m.stepSize}
              onChange={(v: number) => { if (isFinite(v)) this.set('stepSize', Math.max(1, Math.round(v))) }} />
            <div className='tm-hint'>{m.stepSizeHint}</div>
          </SettingRow>
          <SettingRow label={m.allowStepChange}>
            <Switch checked={this.get('allowStepChange') !== false} aria-label={m.allowStepChange} onChange={(e: any) => { this.set('allowStepChange', !!e.target.checked) }} />
          </SettingRow>
          <div className='tm-hint'>{m.allowStepChangeHint}</div>
          <SettingRow label={m.fitRange}>
            <Switch checked={this.get('fitRangeToData') !== false} aria-label={m.fitRange} onChange={(e: any) => { this.set('fitRangeToData', !!e.target.checked) }} />
          </SettingRow>
          <div className='tm-hint'>{m.fitRangeHint}</div>
          <SettingRow label={m.yearWindow} flow='wrap'>
            <div className='tm-row'>
              <label><span className='tm-lbl'>{m.minYear}</span><NumericInput aria-label={m.minYear} size='sm' showArrowButtons={false} placeholder='1800' value={this.get('minYear') as number} onChange={(v: number) => { this.set('minYear', typeof v === 'number' && isFinite(v) ? Math.round(v) : undefined) }} /></label>
              <label><span className='tm-lbl'>{m.maxYear}</span><NumericInput aria-label={m.maxYear} size='sm' showArrowButtons={false} placeholder={String(new Date().getUTCFullYear() + 1)} value={this.get('maxYear') as number} onChange={(v: number) => { this.set('maxYear', typeof v === 'number' && isFinite(v) ? Math.round(v) : undefined) }} /></label>
            </div>
          </SettingRow>
          <div className='tm-hint'>{m.yearWindowHint}</div>
        </SettingSection>

        <SettingSection title={m.secPerformance}>
          <SettingRow label={m.clientSide}>
            <Switch checked={this.get('clientSide') !== false} aria-label={m.clientSide} aria-describedby={`${this.props.id}-clientSide-h`} onChange={(e: any) => { this.set('clientSide', !!e.target.checked) }} />
          </SettingRow>
          <div className='tm-hint' id={`${this.props.id}-clientSide-h`}>{m.clientSideHint}</div>
          {this.get('clientSide') !== false && (
            <SettingRow label={m.clientMaxFeatures} flow='wrap'>
              <NumericInput size='sm' min={1000} max={500000} step={1000} value={Number(this.get('clientMaxFeatures')) || 50000} aria-label={m.clientMaxFeatures}
                onChange={(v: number) => { if (isFinite(v)) this.set('clientMaxFeatures', Math.max(1000, Math.round(v))) }} />
              <div className='tm-hint'>{m.clientMaxFeaturesHint}</div>
            </SettingRow>
          )}
        </SettingSection>

        <SettingSection title={m.secModes}>
          <SettingRow label={m.defaultMode} flow='wrap'>
            <Select size='sm' value={this.get('defaultMode')} aria-label={m.defaultMode} onChange={(e: any) => { this.set('defaultMode', e.target.value) }}>
              <Option value='single'>{m.modeSingle}</Option>
              {this.get('allowRange') !== false && <Option value='range'>{m.modeRange}</Option>}
              {this.get('allowCompare') !== false && <Option value='compare'>{m.modeCompare}</Option>}
            </Select>
          </SettingRow>
          <SettingRow label={m.allowRange}>
            <Switch checked={this.get('allowRange') !== false} aria-label={m.allowRange} onChange={(e: any) => { this.set('allowRange', !!e.target.checked); if (!e.target.checked && this.get('defaultMode') === 'range') this.set('defaultMode', 'single') }} />
          </SettingRow>
          <div className='tm-hint'>{m.allowRangeHint}</div>
          <SettingRow label={m.allowCompare}>
            <Switch checked={this.get('allowCompare') !== false} aria-label={m.allowCompare} onChange={(e: any) => { this.set('allowCompare', !!e.target.checked); if (!e.target.checked && this.get('defaultMode') === 'compare') this.set('defaultMode', 'single') }} />
          </SettingRow>
          <div className='tm-hint'>{m.allowCompareHint}</div>
          <SettingRow label={m.allowPlay}>
            <Switch checked={this.get('allowPlay') !== false} aria-label={m.allowPlay} onChange={(e: any) => { this.set('allowPlay', !!e.target.checked) }} />
          </SettingRow>
          {this.get('allowPlay') !== false && (
            <SettingRow label={m.playInterval} flow='wrap'>
              <NumericInput size='sm' min={100} max={10000} step={100} value={Number(this.get('playIntervalMs'))} aria-label={m.playInterval}
                onChange={(v: number) => { if (isFinite(v)) this.set('playIntervalMs', Math.round(v)) }} />
            </SettingRow>
          )}
        </SettingSection>

        <SettingSection title={m.secLayers}>
          <SettingRow label={m.layerChoice} flow='wrap'>
            <Select size='sm' value={this.get('autoDiscover') !== false ? 'all' : 'pick'} aria-label={m.layerChoice} onChange={(e: any) => { this.set('autoDiscover', e.target.value === 'all') }}>
              <Option value='all'>{m.layerChoiceAll}</Option>
              <Option value='pick'>{m.layerChoicePick}</Option>
            </Select>
          </SettingRow>
          <div className='tm-hint'>{this.get('autoDiscover') !== false ? m.layerChoiceAllHint : m.layerChoicePickHint}</div>
          <SettingRow flow='wrap' label={m.pickTitle}>
            <div className='tm-hint' style={{ marginBottom: 6, width: '100%' }}>{m.pickHint}</div>
            <div className='tm-pickbar'>
              <Button size='sm' onClick={this.loadMapLayers} disabled={this.state.mapLayersBusy}>{this.state.mapLayersBusy ? m.pickLoading : (this.state.mapLayers ? m.pickReload : m.pickLoad)}</Button>
              {this.state.mapLayers && this.state.mapLayers.length > 0 && (
                <span className='tm-hint' style={{ margin: 0 }}>{m.pickSummary.replace('{on}', String(this.state.mapLayers.filter(l => rules.some(r => r.layerId === l.key && r.mode !== 'off')).length)).replace('{total}', String(this.state.mapLayers.length))}</span>
              )}
            </div>
            {this.state.mapLayersError && <Alert type='warning' text={this.state.mapLayersError} style={{ marginTop: 6, width: '100%' }} />}
            {this.state.mapLayers && this.state.mapLayers.length > 0 && (() => {
              const groups = this.groupedLayers()
              const shown = groups.reduce((n, g) => n + g.layers.length, 0)
              return (
                <React.Fragment>
                  <div className='tm-pickbar'>
                    <TextInput size='sm' className='tm-picksearch' placeholder={m.pickSearch} aria-label={m.pickSearch} value={this.state.pickSearch} onChange={(e: any) => { this.setState({ pickSearch: String(e.target.value) }) }} />
                    <Button size='sm' type='tertiary' onClick={() => { this.pickMany(groups.reduce((a: MapLayerInfo[], g) => a.concat(g.layers), []), true) }} disabled={!shown}>{m.pickAll}</Button>
                    <Button size='sm' type='tertiary' onClick={() => { this.pickMany(groups.reduce((a: MapLayerInfo[], g) => a.concat(g.layers), []), false) }} disabled={!shown}>{m.pickClear}</Button>
                  </div>
                  <div className='tm-pick' role='group' aria-label={m.pickTitle}>
                    {!shown && <div className='tm-pickrow tm-hint'>{m.pickNoMatch}</div>}
                    {groups.map(g => {
                      if (!g.group) return g.layers.map(l => this.layerRow(l, rules, false))
                      const onCount = g.layers.filter(l => rules.some(r => r.layerId === l.key && r.mode !== 'off')).length
                      const all = onCount === g.layers.length
                      const closed = !!this.state.closedGroups[g.group]
                      return (
                        <React.Fragment key={'g:' + g.group}>
                          <div className='tm-pickrow tm-pickgroup'>
                            <Button size='sm' type='tertiary' className='tm-picktoggle' aria-expanded={!closed} aria-label={(closed ? m.pickOpenGroup : m.pickCloseGroup) + ': ' + g.group}
                              onClick={() => { this.setState({ closedGroups: { ...this.state.closedGroups, [g.group]: !closed } }) }}>{closed ? '+' : '-'}</Button>
                            <label className='tm-picklabel'>
                              <Checkbox checked={all} indeterminate={onCount > 0 && !all} aria-label={m.pickGroupAll + ': ' + g.group} onChange={(_e: any, checked: boolean) => { this.pickMany(g.layers, !!checked) }} />
                              <span className='tm-picktitle' title={g.group}>{g.group}</span>
                            </label>
                            <span className='tm-pickcount'>{onCount} / {g.layers.length}</span>
                          </div>
                          {!closed && g.layers.map(l => this.layerRow(l, rules, true))}
                        </React.Fragment>
                      )
                    })}
                  </div>
                  <div className='tm-hint' style={{ width: '100%' }}>{m.pickGroupHint}</div>
                </React.Fragment>
              )
            })()}
          </SettingRow>
          <SettingRow label={m.preferredFields} flow='wrap'>
            <TextArea height={110} className='w-100' aria-label={m.preferredFields}
              value={((this.get('preferredFields') as string[]) || []).join('\n')}
              onChange={(e: any) => { const list = String(e.target.value).split(/[\n,;]+/).map(s => s.trim()).filter(Boolean); this.set('preferredFields', list.length ? list : undefined) }} />
            <div className='tm-hint'>{m.preferredFieldsHint}</div>
          </SettingRow>

          <SettingRow flow='wrap' label={m.rules}>
            <div className='tm-hint' style={{ marginBottom: 6 }}>{m.rulesHint} {m.rulesPickNote}</div>
            {rules.map((r, i) => (
              <div className='tm-card' key={i}>
                <div className='tm-cardrow'>
                  <label><span className='tm-lbl'>{m.ruleLayerId}</span><TextInput aria-label={m.ruleLayerId} size='sm' value={r.layerId || ''} onChange={(e: any) => { rules[i].layerId = e.target.value; this.setRules(rules) }} /></label>
                  <label><span className='tm-lbl'>{m.ruleTitle}</span><TextInput aria-label={m.ruleTitle} size='sm' value={r.title || ''} onChange={(e: any) => { rules[i].title = e.target.value; this.setRules(rules) }} /></label>
                </div>
                <div className='tm-cardrow'>
                  <label><span className='tm-lbl'>{m.ruleMode}</span>
                    <Select size='sm' value={r.mode || 'auto'} onChange={(e: any) => { rules[i].mode = e.target.value; this.setRules(rules) }}>
                      {ruleModes.map(([v, l]) => <Option key={v} value={v}>{l}</Option>)}
                    </Select>
                  </label>
                  <Button size='sm' type='tertiary' onClick={() => { rules.splice(i, 1); this.setRules(rules) }} style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>{m.ruleRemove}</Button>
                </div>
                {(r.mode === 'field' || r.mode === 'span') && (
                  <div className='tm-cardrow'>
                    <label><span className='tm-lbl'>{r.mode === 'span' ? m.ruleStartSpan : m.ruleStart}</span><TextInput size='sm' value={r.startField || ''} onChange={(e: any) => { rules[i].startField = e.target.value; this.setRules(rules) }} /></label>
                    {r.mode === 'span' && <label><span className='tm-lbl'>{m.ruleEnd}</span><TextInput aria-label={m.ruleEnd} size='sm' value={r.endField || ''} onChange={(e: any) => { rules[i].endField = e.target.value; this.setRules(rules) }} /></label>}
                  </div>
                )}
              </div>
            ))}
            <Button size='sm' onClick={() => { rules.push({ layerId: '', title: '', mode: 'auto', startField: '', endField: '' }); this.setRules(rules) }}>{m.ruleAdd}</Button>
          </SettingRow>

          <SettingRow flow='wrap' label={m.yearSets}>
            <div className='tm-hint' style={{ marginBottom: 6 }}>{m.yearSetsHint}</div>
            {sets.map((s, i) => (
              <div className='tm-card' key={i}>
                <div className='tm-cardrow'>
                  <label><span className='tm-lbl'>{m.yearSetId}</span><TextInput aria-label={m.yearSetId} size='sm' value={s.groupLayerId || ''} onChange={(e: any) => { sets[i].groupLayerId = e.target.value; this.setYearSets(sets) }} /></label>
                  <label><span className='tm-lbl'>{m.yearSetTitle}</span><TextInput aria-label={m.yearSetTitle} size='sm' value={s.title || ''} onChange={(e: any) => { sets[i].title = e.target.value; this.setYearSets(sets) }} /></label>
                  <Button size='sm' type='tertiary' onClick={() => { sets.splice(i, 1); this.setYearSets(sets) }} style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>{m.yearSetRemove}</Button>
                </div>
              </div>
            ))}
            <Button size='sm' onClick={() => { sets.push({ groupLayerId: '', title: '' }); this.setYearSets(sets) }}>{m.yearSetAdd}</Button>
          </SettingRow>

          <SettingRow label={m.restoreOnClose}>
            <Switch checked={this.get('restoreOnClose') !== false} aria-label={m.restoreOnClose} onChange={(e: any) => { this.set('restoreOnClose', !!e.target.checked) }} />
          </SettingRow>
          <div className='tm-hint'>{m.restoreOnCloseHint}</div>
        </SettingSection>

        <SettingSection title={m.secPresent}>
          <SettingRow label={m.allowPresent}>
            <Switch checked={this.get('allowPresent') !== false} aria-label={m.allowPresent} onChange={(e: any) => { this.set('allowPresent', !!e.target.checked) }} />
          </SettingRow>
          <div className='tm-hint'>{m.allowPresentHint}</div>
          {this.get('allowPresent') !== false && (
            <React.Fragment>
              <SettingRow label={m.presentStep} flow='wrap'>
                <Select size='sm' value={this.get('presentStep') || 'unit'} aria-label={m.presentStep} onChange={(e: any) => { this.set('presentStep', e.target.value) }}>
                  <Option value='unit'>{m.presentStepUnit}</Option>
                  <Option value='chapters'>{m.presentStepChapters}</Option>
                </Select>
              </SettingRow>
              <SettingRow label={m.chapterHold} flow='wrap'>
                <NumericInput size='sm' min={500} max={60000} step={500} value={Number(this.get('chapterHoldMs'))} aria-label={m.chapterHold}
                  onChange={(v: number) => { if (isFinite(v)) this.set('chapterHoldMs', Math.round(v)) }} />
                <div className='tm-hint'>{m.chapterHoldHint}</div>
              </SettingRow>
              <SettingRow label={m.presentLoop}>
                <Switch checked={!!this.get('presentLoop')} aria-label={m.presentLoop} onChange={(e: any) => { this.set('presentLoop', !!e.target.checked) }} />
              </SettingRow>
              <SettingRow label={m.presentProgress}>
                <Switch checked={this.get('presentProgress') !== false} aria-label={m.presentProgress} onChange={(e: any) => { this.set('presentProgress', !!e.target.checked) }} />
              </SettingRow>
              <SettingRow label={m.bannerPosition} flow='wrap'>
                <Select size='sm' value={this.get('bannerPosition') || 'bottom'} aria-label={m.bannerPosition} onChange={(e: any) => { this.set('bannerPosition', e.target.value) }}>
                  <Option value='bottom'>{m.bannerBottom}</Option>
                  <Option value='top'>{m.bannerTop}</Option>
                </Select>
              </SettingRow>
              <SettingRow label={m.flyMs} flow='wrap'>
                <NumericInput size='sm' min={0} max={10000} step={100} value={Number(this.get('flyMs'))} aria-label={m.flyMs}
                  onChange={(v: number) => { if (isFinite(v)) this.set('flyMs', Math.round(v)) }} />
                <div className='tm-hint'>{m.flyMsHint}</div>
              </SettingRow>
              {([['chapterGrid', 'chapterGridHint'], ['allowSpotlight', 'allowSpotlightHint'], ['allowPresenterWindow', 'allowPresenterWindowHint'], ['allowStoryDraft', 'allowStoryDraftHint'], ['allowDeck', 'allowDeckHint'], ['allowInk', 'allowInkHint'], ['narrate', 'narrateHint'], ['presentCleanStage', 'presentCleanStageHint'], ['allowVideo', 'allowVideoHint']] as Array<[keyof Config, string]>).map(([k, hint]) => (
                <React.Fragment key={String(k)}>
                  <SettingRow label={m[k as string]}>
                    <Switch checked={this.get(k) !== false} aria-label={m[k as string]} aria-describedby={`${this.props.id}-${String(k)}-h`} onChange={(e: any) => { this.set(k, !!e.target.checked) }} />
                  </SettingRow>
                  <div className='tm-hint' id={`${this.props.id}-${String(k)}-h`}>{m[hint]}</div>
                </React.Fragment>
              ))}
              <SettingRow label={m.chapterMotion} flow='wrap'>
                <Select size='sm' value={this.get('chapterMotion') || 'none'} aria-label={m.chapterMotion} onChange={(e: any) => { this.set('chapterMotion', e.target.value === 'none' ? undefined : e.target.value) }}>
                  <Option value='none'>{m.motionNone}</Option>
                  <Option value='zoomIn'>{m.motionZoomIn}</Option>
                  <Option value='zoomOut'>{m.motionZoomOut}</Option>
                </Select>
                <div className='tm-hint'>{m.chapterMotionHint}</div>
              </SettingRow>
              {this.get('allowVideo') !== false && (
                <SettingRow label={m.videoSeconds} flow='wrap'>
                  <NumericInput size='sm' min={5} max={600} step={5} value={Number(this.get('videoSeconds')) || 30} aria-label={m.videoSeconds}
                    onChange={(v: number) => { if (isFinite(v)) this.set('videoSeconds', Math.max(5, Math.round(v))) }} />
                  <div className='tm-hint'>{m.videoSecondsHint}</div>
                </SettingRow>
              )}
              <SettingRow label={m.presentMinutes} flow='wrap'>
                <NumericInput size='sm' min={0} max={600} step={1} value={Number(this.get('presentMinutes')) || 0} aria-label={m.presentMinutes}
                  onChange={(v: number) => { if (isFinite(v)) this.set('presentMinutes', Math.max(0, Math.round(v)) || undefined) }} />
                <div className='tm-hint'>{m.presentMinutesHint}</div>
              </SettingRow>
              <SettingRow flow='wrap' label={m.brandTitle}>
                <div className='tm-hint' style={{ marginBottom: 6 }}>{m.brandHint}</div>
                {this.renderBrand()}
              </SettingRow>
              {this.get('allowDeck') !== false && (
                <SettingRow flow='wrap' label={m.deckTitle}>
                  <TextInput size='sm' className='w-100' value={String(this.get('deckTitle') || '')} aria-label={m.deckTitle} placeholder={m.deckTitlePlaceholder} onChange={(e: any) => { this.set('deckTitle', e.target.value) }} />
                  <span className='tm-lbl' style={{ marginTop: 6 }}>{m.deckCredit}</span>
                  <TextInput size='sm' className='w-100' value={String(this.get('deckCredit') || '')} aria-label={m.deckCredit} placeholder={m.deckCreditPlaceholder} onChange={(e: any) => { this.set('deckCredit', e.target.value) }} />
                </SettingRow>
              )}
              <SettingRow flow='wrap' label={m.chapters}>
                <div className='tm-hint' style={{ marginBottom: 6 }}>{m.chaptersHint}</div>
                {chapters.map((c, i) => (
                  <div className='tm-card' key={i}>
                    <div className='tm-cardrow'>
                      <label><span className='tm-lbl'>{m.chapterDate}</span><TextInput aria-label={m.chapterDate} size='sm' placeholder='yyyy-mm-dd' value={c.date || ''} onChange={(e: any) => { chapters[i].date = e.target.value; this.setChapters(chapters) }} /></label>
                      <label><span className='tm-lbl'>{m.chapterTitle}</span><TextInput aria-label={m.chapterTitle} size='sm' value={c.title || ''} onChange={(e: any) => { chapters[i].title = e.target.value; this.setChapters(chapters) }} /></label>
                    </div>
                    <label><span className='tm-lbl'>{m.chapterText}</span><TextArea aria-label={m.chapterText} height={60} className='w-100' value={c.text || ''} onChange={(e: any) => { chapters[i].text = e.target.value; this.setChapters(chapters) }} /></label>
                    <div className='tm-cardrow'>
                      <label><span className='tm-lbl'>{m.chapterLon}</span><TextInput aria-label={m.chapterLon} size='sm' value={c.lon == null ? '' : String(c.lon)} onChange={(e: any) => { chapters[i].lon = this.numOrUndef(e.target.value); this.setChapters(chapters) }} /></label>
                      <label><span className='tm-lbl'>{m.chapterLat}</span><TextInput aria-label={m.chapterLat} size='sm' value={c.lat == null ? '' : String(c.lat)} onChange={(e: any) => { chapters[i].lat = this.numOrUndef(e.target.value); this.setChapters(chapters) }} /></label>
                      <label><span className='tm-lbl'>{m.chapterScale}</span><TextInput aria-label={m.chapterScale} size='sm' value={c.scale == null ? '' : String(c.scale)} onChange={(e: any) => { chapters[i].scale = this.numOrUndef(e.target.value); this.setChapters(chapters) }} /></label>
                    </div>
                    <div className='tm-cardrow'>
                      <label><span className='tm-lbl'>{m.chapterRotation}</span><TextInput aria-label={m.chapterRotation} size='sm' value={c.rotation == null ? '' : String(c.rotation)} onChange={(e: any) => { chapters[i].rotation = this.numOrUndef(e.target.value); this.setChapters(chapters) }} /></label>
                      <label><span className='tm-lbl'>{m.chapterTransition}</span>
                        <Select size='sm' value={c.transition || 'fly'} onChange={(e: any) => { chapters[i].transition = e.target.value === 'jump' ? 'jump' : undefined; this.setChapters(chapters) }}>
                          <Option value='fly'>{m.chapterFly}</Option>
                          <Option value='jump'>{m.chapterJump}</Option>
                        </Select>
                      </label>
                      <label><span className='tm-lbl'>{m.chapterHoldMs}</span><TextInput aria-label={m.chapterHoldMs} size='sm' value={c.holdMs == null ? '' : String(c.holdMs)} onChange={(e: any) => { chapters[i].holdMs = this.numOrUndef(e.target.value); this.setChapters(chapters) }} /></label>
                      <label><span className='tm-lbl'>{m.chapterMotionOne}</span>
                        <Select size='sm' value={c.motion || ''} onChange={(e: any) => { const v = e.target.value; chapters[i].motion = v === 'zoomIn' || v === 'zoomOut' || v === 'none' ? v : undefined; this.setChapters(chapters) }}>
                          <Option value=''>{m.motionDefault}</Option>
                          <Option value='none'>{m.motionNone}</Option>
                          <Option value='zoomIn'>{m.motionZoomIn}</Option>
                          <Option value='zoomOut'>{m.motionZoomOut}</Option>
                        </Select>
                      </label>
                    </div>
                    <span className='tm-hint'>{m.chapterPlaceHint}</span>
                    <label className='tm-row' style={{ margin: 0 }}><Checkbox checked={!!c.hidden} aria-label={m.chapterHidden} onChange={(_e: any, checked: boolean) => { chapters[i].hidden = checked || undefined; this.setChapters(chapters) }} /><span>{m.chapterHidden}</span></label>
                    <label><span className='tm-lbl'>{m.chapterNotes}</span><TextArea aria-label={m.chapterNotes} height={48} className='w-100' value={c.notes || ''} onChange={(e: any) => { chapters[i].notes = e.target.value || undefined; this.setChapters(chapters) }} /></label>
                    <div className='tm-cardrow'>
                      <Button size='sm' type='tertiary' onClick={() => { if (!this.state.allLayers.length) this.loadMapLayers(); this.setState({ pickerFor: this.state.pickerFor === i ? null : i }) }} aria-expanded={this.state.pickerFor === i}>{m.chapterPickLayers}</Button>
                      <span className='tm-hint' style={{ margin: 0 }}>{m.chapterPickLayersHint}</span>
                    </div>
                    {this.state.pickerFor === i && (
                      <div className='tm-card' style={{ maxHeight: 220, overflow: 'auto' }}>
                        {this.state.mapLayersBusy && <span className='tm-hint'>{m.pickLoading}</span>}
                        {!this.state.mapLayersBusy && !this.state.allLayers.length && <span className='tm-hint'>{this.state.mapLayersError || m.pickNoMap}</span>}
                        {this.state.allLayers.map(l => {
                          const state = (c.layersOn || []).indexOf(l.key) >= 0 ? 'on' : (c.layersOff || []).indexOf(l.key) >= 0 ? 'off' : ''
                          return (
                            <div className='tm-cardrow' key={l.key}>
                              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title={l.key}>{l.group ? <span className='tm-hint' style={{ margin: 0 }}>{l.group} / </span> : null}{l.title}</span>
                              <Select size='sm' value={state} aria-label={(l.group ? l.group + ' / ' : '') + l.title} style={{ flex: '0 0 130px' }} onChange={(e: any) => {
                                const v = e.target.value
                                const on = (c.layersOn || []).filter(k => k !== l.key); const off = (c.layersOff || []).filter(k => k !== l.key)
                                if (v === 'on') on.push(l.key); if (v === 'off') off.push(l.key)
                                chapters[i].layersOn = on.length ? on : undefined; chapters[i].layersOff = off.length ? off : undefined
                                this.setChapters(chapters)
                              }}>
                                <Option value=''>{m.layerLeave}</Option>
                                <Option value='on'>{m.layerTurnOn}</Option>
                                <Option value='off'>{m.layerTurnOff}</Option>
                              </Select>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div className='tm-cardrow'>
                      <label><span className='tm-lbl'>{m.chapterLayersOn}</span><TextInput aria-label={m.chapterLayersOn} size='sm' value={(c.layersOn || []).join(', ')} onChange={(e: any) => { const l = String(e.target.value).split(/[\n,;]+/).map(s => s.trim()).filter(Boolean); chapters[i].layersOn = l.length ? l : undefined; this.setChapters(chapters) }} /></label>
                      <label><span className='tm-lbl'>{m.chapterLayersOff}</span><TextInput aria-label={m.chapterLayersOff} size='sm' value={(c.layersOff || []).join(', ')} onChange={(e: any) => { const l = String(e.target.value).split(/[\n,;]+/).map(s => s.trim()).filter(Boolean); chapters[i].layersOff = l.length ? l : undefined; this.setChapters(chapters) }} /></label>
                    </div>
                    <div className='tm-cardrow'>
                      <label><span className='tm-lbl'>{m.chapterBasemap}</span><TextInput aria-label={m.chapterBasemap} size='sm' value={c.basemap || ''} onChange={(e: any) => { chapters[i].basemap = e.target.value || undefined; this.setChapters(chapters) }} /></label>
                      <label><span className='tm-lbl'>{m.chapterImage}</span><TextInput aria-label={m.chapterImage} size='sm' value={c.image || ''} placeholder='https://' onChange={(e: any) => { chapters[i].image = e.target.value || undefined; this.setChapters(chapters) }} /></label>
                    </div>
                    <div className='tm-cardrow'>
                      <label><span className='tm-lbl'>{m.chapterFeatureLayer}</span><TextInput aria-label={m.chapterFeatureLayer} size='sm' value={c.featureLayerId || ''} onChange={(e: any) => { chapters[i].featureLayerId = e.target.value || undefined; this.setChapters(chapters) }} /></label>
                      <label><span className='tm-lbl'>{m.chapterFeatureWhere}</span><TextInput aria-label={m.chapterFeatureWhere} size='sm' value={c.featureWhere || ''} onChange={(e: any) => { chapters[i].featureWhere = e.target.value || undefined; this.setChapters(chapters) }} /></label>
                    </div>
                    <div className='tm-cardrow'>
                      <span className='tm-hint'>{m.chapterMapHint}</span>
                      <Button size='sm' type='tertiary' onClick={() => { chapters.splice(i, 1); this.setChapters(chapters) }} style={{ flex: '0 0 auto' }}>{m.chapterRemove}</Button>
                    </div>
                  </div>
                ))}
                <Button size='sm' onClick={() => { chapters.push({ date: '', title: '', text: '' }); this.setChapters(chapters) }}>{m.chapterAdd}</Button>
              </SettingRow>
            </React.Fragment>
          )}
        </SettingSection>

        <SettingSection title={m.secPanel}>
          <SettingRow label={m.showLayerList}>
            <Switch checked={this.get('showLayerList') !== false} aria-label={m.showLayerList} onChange={(e: any) => { this.set('showLayerList', !!e.target.checked) }} />
          </SettingRow>
          {this.get('showLayerList') !== false && (
            <SettingRow label={m.showCounts}>
              <Switch checked={this.get('showCounts') !== false} aria-label={m.showCounts} onChange={(e: any) => { this.set('showCounts', !!e.target.checked) }} />
            </SettingRow>
          )}
          {this.get('showLayerList') !== false && <div className='tm-hint'>{m.showCountsHint}</div>}
          <SettingRow label={m.showMapStamp}>
            <Switch checked={this.get('showMapStamp') !== false} aria-label={m.showMapStamp} onChange={(e: any) => { this.set('showMapStamp', !!e.target.checked) }} />
          </SettingRow>
          <div className='tm-hint'>{m.showMapStampHint}</div>
          {this.get('showMapStamp') !== false && (
            <SettingRow label={m.stampPosition} flow='wrap'>
              <Select size='sm' value={this.get('stampPosition') || 'top-right'} aria-label={m.stampPosition} onChange={(e: any) => { this.set('stampPosition', e.target.value) }}>
                <Option value='top-right'>{m.cornerTopRight}</Option>
                <Option value='top-left'>{m.cornerTopLeft}</Option>
                <Option value='bottom-left'>{m.cornerBottomLeft}</Option>
                <Option value='bottom-right'>{m.cornerBottomRight}</Option>
              </Select>
              <div className='tm-hint'>{m.stampPositionHint}</div>
            </SettingRow>
          )}
          <SettingRow label={m.highlightNew}>
            <Switch checked={this.get('highlightNew') !== false} aria-label={m.highlightNew} onChange={(e: any) => { this.set('highlightNew', !!e.target.checked) }} />
          </SettingRow>
          <div className='tm-hint'>{m.highlightNewHint}</div>
          <SettingRow label={m.showActivity}>
            <Switch checked={this.get('showActivity') !== false} aria-label={m.showActivity} onChange={(e: any) => { this.set('showActivity', !!e.target.checked) }} />
          </SettingRow>
          <div className='tm-hint'>{m.showActivityHint}</div>
          <SettingRow label={m.allowShareLink}>
            <Switch checked={this.get('allowShareLink') !== false} aria-label={m.allowShareLink} onChange={(e: any) => { this.set('allowShareLink', !!e.target.checked) }} />
          </SettingRow>
          {this.get('allowShareLink') !== false && (
            <SettingRow label={m.urlParam} flow='wrap'>
              <TextInput size='sm' value={String(this.get('urlParam') || 'tm')} aria-label={m.urlParam} onChange={(e: any) => { this.set('urlParam', String(e.target.value).replace(/[^A-Za-z0-9_]/g, '') || 'tm') }} />
            </SettingRow>
          )}
          <SettingRow label={m.rememberDate}>
            <Switch checked={!!this.get('rememberDate')} aria-label={m.rememberDate} onChange={(e: any) => { this.set('rememberDate', !!e.target.checked) }} />
          </SettingRow>
          <SettingRow label={m.messageDateField} flow='wrap'>
            <TextInput size='sm' value={String(this.get('messageDateField') || '')} aria-label={m.messageDateField} onChange={(e: any) => { this.set('messageDateField', e.target.value) }} />
            <div className='tm-hint'>{m.messageDateFieldHint}</div>
          </SettingRow>
          <SettingRow label={m.showDateInputs}>
            <Switch checked={this.get('showDateInputs') !== false} aria-label={m.showDateInputs} onChange={(e: any) => { this.set('showDateInputs', !!e.target.checked) }} />
          </SettingRow>
          <SettingRow label={m.showHelp}>
            <Switch checked={this.get('showHelp') !== false} aria-label={m.showHelp} onChange={(e: any) => { this.set('showHelp', !!e.target.checked) }} />
          </SettingRow>
          <div className='tm-hint'>{m.showHelpHint}</div>
        </SettingSection>

        <SettingSection title={m.secTelemetry}>
          <SettingRow label={m.telemetry}>
            <Switch checked={this.get('telemetry') !== false} aria-label={m.telemetry} onChange={(e: any) => { this.set('telemetry', !!e.target.checked) }} />
          </SettingRow>
          <div className='tm-hint'>{m.telemetryHint}</div>
        </SettingSection>

        <SettingSection title={m.secIe}>
          <div className='tm-hint' style={{ marginBottom: 6 }}>{m.ieHint}</div>
          <SettingRow>
            <Button size='sm' onClick={this.downloadConfig}>{m.ieExport}</Button>
            <Button size='sm' onClick={this.copyConfig} style={{ marginLeft: 6 }}>{m.ieCopy}</Button>
          </SettingRow>
          <input ref={this.xmlInputRef} type='file' accept='.xml,text/xml,application/xml' style={{ display: 'none' }} tabIndex={-1} aria-label={m.ieImportFile} onChange={this.onXmlFileChosen} />
          <SettingRow flow='wrap' label={m.ieImportLabel}>
            <TextArea aria-label={m.ieImportLabel} className='w-100' height={110} value={this.state.importXml}
              onChange={(e: any) => { this.setState({ importXml: e.target.value, ieError: null, ieSuccess: null }) }} />
            <div className='tm-hint'>{m.ieImportHint}</div>
          </SettingRow>
          <SettingRow>
            <Tooltip title={m.ieImportFile} placement='top'><Button size='sm' onClick={() => this.xmlInputRef.current?.click()}>{m.ieImportFile}</Button></Tooltip>
            <Button size='sm' type='primary' disabled={!this.state.importXml.trim()} onClick={this.importConfig} style={{ marginLeft: 6 }}>{m.ieImport}</Button>
          </SettingRow>
          {this.state.ieError && <Alert type='error' text={this.state.ieError} withIcon className='w-100' />}
          {this.state.ieSuccess && <Alert type='success' text={this.state.ieSuccess} withIcon className='w-100' />}
        </SettingSection>
      </div>
    )
  }
}
