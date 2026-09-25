/**
 * Time Machine - typed XML import/export of the widget configuration.
 * Copied from Print Advanced (same element scheme: t = s|n|b|o|a|null) so an XML
 * file from one widget family member looks and behaves like every other.
 * No esri or jimu imports: this file is shared by the settings bundle.
 */
import type { Config } from './config'

export const XML_ROOT = 'TimeMachineConfig'

function xmlEsc (s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function valueToXml (value: any, tag: string, indent: string): string {
  const pad = indent
  if (value === null || value === undefined) return `${pad}<${tag} t="null"/>`
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}<${tag} t="a"/>`
    return `${pad}<${tag} t="a">\n${value.map(v => valueToXml(v, 'item', indent + '  ')).join('\n')}\n${pad}</${tag}>`
  }
  const type = typeof value
  if (type === 'object') {
    const keys = Object.keys(value)
    if (!keys.length) return `${pad}<${tag} t="o"/>`
    return `${pad}<${tag} t="o">\n${keys.map(k => valueToXml(value[k], k, indent + '  ')).join('\n')}\n${pad}</${tag}>`
  }
  if (type === 'number') return `${pad}<${tag} t="n">${value}</${tag}>`
  if (type === 'boolean') return `${pad}<${tag} t="b">${value ? 'true' : 'false'}</${tag}>`
  return `${pad}<${tag} t="s">${xmlEsc(value)}</${tag}>`
}

export function configToXml (config: any): string {
  const body = valueToXml(config || {}, XML_ROOT, '')
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + body.replace(`<${XML_ROOT} t="o"`, `<${XML_ROOT} version="1" t="o"`) + '\n'
}

interface CfgNode { tag: string, attrs: { [k: string]: string }, children: CfgNode[], text: string }

function unescapeXml (s: string): string {
  return s.replace(/&(?:lt|gt|quot|apos|amp|#x[0-9a-fA-F]+|#\d+);/g, (ent) => {
    switch (ent) {
      case '&lt;': return '<'
      case '&gt;': return '>'
      case '&quot;': return '"'
      case '&apos;': return "'"
      case '&amp;': return '&'
      default:
        return ent.charAt(2) === 'x' || ent.charAt(2) === 'X'
          ? String.fromCodePoint(parseInt(ent.slice(3, -1), 16))
          : String.fromCodePoint(Number(ent.slice(2, -1)))
    }
  })
}

/** Parse the typed XML without DOMParser; patterns are delimiter-bounded. */
function parseConfigXml (xml: string): CfgNode {
  const tokenRe = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<(\/?)([A-Za-z_$][\w.$-]*)([^>]*?)(\/?)>/g
  const attrRe = /([\w.$-]+)\s*=\s*"([^"]*)"/g
  const stack: CfgNode[] = []
  let root: CfgNode | null = null
  let last = 0
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(xml)) !== null) {
    if (stack.length) {
      const between = xml.slice(last, m.index)
      if (between) stack[stack.length - 1].text += unescapeXml(between)
    }
    last = tokenRe.lastIndex
    const name = m[2]
    if (name === undefined) continue
    if (m[1] === '/') {
      const node = stack.pop()
      if (!node || node.tag !== name) throw new Error('The file is not valid XML.')
      if (!stack.length) root = node
      continue
    }
    const attrs: { [k: string]: string } = {}
    let a: RegExpExecArray | null
    attrRe.lastIndex = 0
    while ((a = attrRe.exec(m[3] || '')) !== null) attrs[a[1]] = unescapeXml(a[2])
    const node: CfgNode = { tag: name, attrs, children: [], text: '' }
    if (stack.length) stack[stack.length - 1].children.push(node)
    if (m[4] === '/') { if (!stack.length) root = node } else stack.push(node)
  }
  if (stack.length || !root) throw new Error('The file is not valid XML.')
  return root
}

function nodeToValue (node: CfgNode): any {
  const t = node.attrs.t
  if (t === 'null') return null
  if (t === 'a') return node.children.map(nodeToValue)
  if (t === 'o') { const o: any = {}; node.children.forEach(c => { o[c.tag] = nodeToValue(c) }); return o }
  const text = node.text
  if (t === 'n') return text === '' ? 0 : Number(text)
  if (t === 'b') return text === 'true'
  return text
}

const BOOL_KEYS = ['fitRangeToData', 'allowStepChange', 'allowRange', 'allowCompare', 'allowPlay', 'autoDiscover', 'restoreOnClose', 'showLayerList', 'showDateInputs', 'showHelp', 'showCounts', 'showActivity', 'allowShareLink', 'rememberDate', 'allowPresent', 'presentLoop', 'presentProgress', 'allowStoryDraft', 'allowPresenterWindow', 'allowSpotlight', 'chapterGrid', 'allowDeck', 'allowInk', 'narrate', 'presentCleanStage', 'showMapStamp', 'highlightNew', 'allowVideo', 'clientSide', 'telemetry']
const NUM_KEYS = ['playIntervalMs', 'chapterHoldMs', 'minYear', 'maxYear', 'flyMs', 'stepSize', 'presentMinutes', 'videoSeconds', 'clientMaxFeatures', 'brandDateSize', 'brandRadius', 'brandLogoHeight']

/** Parse, check the root, and coerce hand-edited strings back to their real types. */
export function xmlToConfig (xmlString: string): Config {
  const root = parseConfigXml(xmlString)
  if (root.tag !== XML_ROOT) throw new Error('ROOT')
  const c: any = nodeToValue(root) || {}
  for (const k of BOOL_KEYS) { if (c[k] === 'true') c[k] = true; else if (c[k] === 'false') c[k] = false }
  for (const k of NUM_KEYS) {
    if (typeof c[k] === 'string' && c[k].trim() !== '' && isFinite(Number(c[k]))) c[k] = Number(c[k])
    else if (c[k] !== undefined && typeof c[k] !== 'number') delete c[k]
  }
  if (typeof c.preferredFields === 'string') c.preferredFields = c.preferredFields.split(/[\n,;]+/).map((s: string) => s.trim()).filter(Boolean)
  if (!Array.isArray(c.rules)) delete c.rules
  if (!Array.isArray(c.yearSets)) delete c.yearSets
  if (Array.isArray(c.rules)) c.rules = c.rules.filter((r: any) => r && typeof r === 'object').map((r: any) => ({ layerId: String(r.layerId || ''), title: String(r.title || ''), mode: ['auto', 'field', 'span', 'off'].indexOf(r.mode) >= 0 ? r.mode : 'auto', startField: String(r.startField || ''), endField: String(r.endField || '') }))
  if (!Array.isArray(c.chapters)) delete c.chapters
  if (Array.isArray(c.chapters)) {
    const num = (v: any): number | undefined => { const n = Number(v); return v === '' || v == null || !isFinite(n) ? undefined : n }
    c.chapters = c.chapters.filter((r: any) => r && typeof r === 'object').map((r: any) => {
      const o: any = { date: String(r.date || ''), title: String(r.title || ''), text: String(r.text || '') }
      for (const k of ['lon', 'lat', 'scale', 'rotation', 'holdMs']) { const v = num(r[k]); if (v !== undefined) o[k] = v }
      for (const k of ['notes', 'basemap', 'featureLayerId', 'featureWhere', 'image']) { if (r[k] != null && String(r[k]).trim() !== '') o[k] = String(r[k]) }
      if (r.transition === 'jump' || r.transition === 'fly') o.transition = r.transition
      if (r.motion === 'zoomIn' || r.motion === 'zoomOut' || r.motion === 'none') o.motion = r.motion
      if (r.hidden === true || r.hidden === 'true') o.hidden = true
      for (const k of ['layersOn', 'layersOff']) {
        const v = r[k]
        const list = Array.isArray(v) ? v.map((x: any) => String(x)).filter(Boolean) : typeof v === 'string' ? v.split(/[\n,;]+/).map((x: string) => x.trim()).filter(Boolean) : []
        if (list.length) o[k] = list
      }
      return o
    })
  }
  if (Array.isArray(c.yearSets)) c.yearSets = c.yearSets.filter((r: any) => r && typeof r === 'object').map((r: any) => ({ groupLayerId: String(r.groupLayerId || ''), title: String(r.title || '') }))
  return c as Config
}
