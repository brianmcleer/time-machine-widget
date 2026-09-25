/**
 * Time Machine - the presenter window.
 *
 * A second browser window for the person speaking: the date and chapter the audience
 * sees, the speaker notes (never shown on the map), what comes next, a running clock,
 * and the same controls as the banner. It talks to the widget over a BroadcastChannel
 * (same origin), falling back to postMessage on the opener.
 *
 * Plain DOM written into a blank window; no React, no SDK, theme tokens passed in.
 */
import type { Tokens } from '../theme'
import type { PresenterState, PresenterCommand } from './story'
import { parseCommand, formatElapsed } from './story'

export interface PresenterStrings {
  title: string
  notes: string
  next: string
  elapsed: string
  play: string
  pause: string
  prev: string
  nextChapter: string
  step: string
  back: string
  exit: string
  chapters: string
  noNotes: string
  end: string
  ahead: string
  behind: string
  onPace: string
  remaining: string
}

export interface PresenterHandle {
  send: (s: PresenterState) => void
  close: () => void
  isOpen: () => boolean
}

const esc = (s: string): string => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

let sessionToken = ''
/** One channel per widget and per page load, so two tabs of the same app do not drive each other. */
export function channelName (widgetId: string): string {
  if (!sessionToken) sessionToken = Math.random().toString(36).slice(2, 10)
  return `time-machine-presenter-${widgetId}-${sessionToken}`
}

/** Opens the window and wires the channel. `onCommand` receives what the presenter clicks. */
export interface PresenterLook { font?: string, logo?: string, logoHeight?: number }

export function openPresenter (widgetId: string, tokens: Tokens, s: PresenterStrings, onCommand: (c: PresenterCommand) => void, look: PresenterLook = {}): PresenterHandle | null {
  let win: Window | null = null
  try { win = window.open('', `tm-presenter-${widgetId}`, 'width=620,height=760,resizable=yes,scrollbars=yes') } catch (e) { win = null }
  if (!win) return null
  const name = channelName(widgetId)
  const lang = (typeof document !== 'undefined' && document.documentElement.lang) || 'en'
  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><title>${esc(s.title)}</title>
<style>
  html,body{margin:0;height:100%;background:${tokens.background};color:${tokens.text};font:14px/1.5 ${look.font ? look.font + ',' : ''} -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .wrap{display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding:16px 18px;gap:12px}
  .top{display:flex;justify-content:space-between;align-items:baseline}
  .date{font-size:40px;font-weight:700;line-height:1.1}
  .clock{font-variant-numeric:tabular-nums;font-size:22px;color:${tokens.textSecondary}}
  .chap{color:${tokens.textSecondary};font-size:12px}
  .card{background:${tokens.surface};border-left:5px solid ${tokens.primary};border-radius:${tokens.radiusLg};padding:12px 14px;box-shadow:${tokens.shadowHover}}
  .card h2{margin:0 0 4px 0;font-size:18px}
  .card p{margin:0;white-space:pre-wrap}
  .notes{flex:1;min-height:0;overflow:auto;font-size:17px;line-height:1.6}
  .notes h3,.next h3{margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:${tokens.textSecondary}}
  .next .t{font-weight:600}
  .ctl{display:flex;gap:6px;flex-wrap:wrap}
  button{font:inherit;padding:8px 14px;border-radius:999px;border:1px solid ${tokens.divider};background:${tokens.surface};color:${tokens.text};cursor:pointer}
  button.primary{background:${tokens.primary};color:${tokens.primaryText};border-color:${tokens.primary}}
  button:focus-visible{outline:2px solid ${tokens.primary};outline-offset:2px}
  .list{display:flex;flex-wrap:wrap;gap:6px}
  .list button{padding:4px 10px;font-size:12px;min-height:28px}
  .list button[aria-current="true"]{background:${tokens.primary};color:${tokens.primaryText};border-color:${tokens.primary}}
</style></head><body><div class="wrap">
  <div class="top"><div><div class="date" id="date"></div><div class="chap" id="chap"></div></div><div style="text-align:right">${look.logo ? `<img src="${esc(look.logo)}" alt="" style="height:${look.logoHeight || 32}px;max-width:200px;object-fit:contain;display:block;margin:0 0 6px auto">` : ''}<div class="clock" id="clock" title="${esc(s.elapsed)}">0:00</div><div class="chap" id="pace"></div></div></div>
  <div class="card" style="display:flex;gap:12px;align-items:flex-start"><img id="thumb" alt="" style="display:none;width:160px;border-radius:6px;flex:0 0 auto"><div style="flex:1;min-width:0"><h2 id="title"></h2><p id="text"></p></div></div>
  <div class="notes"><h3>${esc(s.notes)}</h3><div id="notes"></div></div>
  <div class="next" style="display:flex;gap:12px;align-items:center"><img id="nthumb" alt="" style="display:none;width:120px;border-radius:6px;flex:0 0 auto"><div><h3>${esc(s.next)}</h3><div><span class="t" id="nt"></span> <span id="nd" class="chap"></span></div></div></div>
  <div class="ctl">
    <button data-c="prev" title="${esc(s.prev)}">&#9198; ${esc(s.prev)}</button>
    <button data-c="back" title="${esc(s.back)}" aria-label="${esc(s.back)}"><span aria-hidden="true">&#9664;</span></button>
    <button data-c="toggle" class="primary" id="play">${esc(s.play)}</button>
    <button data-c="step" title="${esc(s.step)}" aria-label="${esc(s.step)}"><span aria-hidden="true">&#9654;</span></button>
    <button data-c="next" title="${esc(s.nextChapter)}">${esc(s.nextChapter)} &#9197;</button>
    <button data-c="exit" style="margin-left:auto">${esc(s.exit)}</button>
  </div>
  <div><h3 class="chap" id="listh">${esc(s.chapters)}</h3><div class="list" id="list" role="group" aria-labelledby="listh"></div></div>
</div>
<script>
(function(){
  var NAME=${JSON.stringify(name)}; var PLAY=${JSON.stringify(s.play)}; var PAUSE=${JSON.stringify(s.pause)}; var NONE=${JSON.stringify(s.noNotes)}; var END=${JSON.stringify(s.end)};
  var AHEAD=${JSON.stringify(s.ahead)}, BEHIND=${JSON.stringify(s.behind)}, ONPACE=${JSON.stringify(s.onPace)}, REMAIN=${JSON.stringify(s.remaining)};
  var DANGER=${JSON.stringify(tokens.danger)}, PRIMARY=${JSON.stringify(tokens.primary)};
  function mmss(sec){ sec=Math.max(0,Math.round(sec)); var m=Math.floor(sec/60), r=sec%60; return m+':'+(r<10?'0':'')+r }
  var ch=null; try{ ch=new BroadcastChannel(NAME) }catch(e){ ch=null }
  function send(c){ if(ch){ ch.postMessage({cmd:c}) } else if(window.opener){ window.opener.postMessage({tm:NAME,cmd:c},'*') } }
  function $(id){ return document.getElementById(id) }
  function render(s){
    $('date').textContent=s.date; $('chap').textContent=s.total?((s.index+1)+' / '+s.total):'';
    $('title').textContent=s.title||''; $('text').textContent=s.text||'';
    $('notes').textContent=s.notes||NONE; $('nt').textContent=s.nextTitle||END; $('nd').textContent=s.nextDate||'';
    var th=$('thumb'); if(s.thumb){ if(th.getAttribute('src')!==s.thumb) th.setAttribute('src',s.thumb); th.style.display='' } else th.style.display='none';
    var nth=$('nthumb'); if(s.nextThumb){ if(nth.getAttribute('src')!==s.nextThumb) nth.setAttribute('src',s.nextThumb); nth.style.display='' } else nth.style.display='none';
    $('play').textContent=s.playing?PAUSE:PLAY; $('clock').textContent=s.elapsed;
    var p=$('pace'); if(s.paceLabel){ var d=Math.abs(s.paceDeltaSec||0); p.textContent=(s.paceLabel==='ahead'?AHEAD:s.paceLabel==='behind'?BEHIND:ONPACE).replace('{t}',mmss(d))+' · '+REMAIN.replace('{t}',mmss(s.remainingSec||0)); p.style.color=s.paceLabel==='behind'?DANGER:s.paceLabel==='ahead'?PRIMARY:''; } else { p.textContent='' }
    var list=$('list'); if(list.childElementCount!==s.chapters.length){ list.innerHTML=''; s.chapters.forEach(function(c){ var b=document.createElement('button'); b.title=c.date; b.setAttribute('data-c','goto:'+c.i); list.appendChild(b) }) }
    Array.prototype.forEach.call(list.children,function(b,i){ var c=s.chapters[i]; b.textContent=(c.i+1)+'. '+(c.title||c.date)+(c.dwellSec?' ('+mmss(c.dwellSec)+')':''); b.setAttribute('aria-current', i===s.index?'true':'false') })
  }
  document.addEventListener('click',function(e){ var b=e.target.closest('button[data-c]'); if(b){ send(b.getAttribute('data-c')) } });
  document.addEventListener('keydown',function(e){ if(e.ctrlKey||e.metaKey||e.altKey||e.repeat) return; if(e.target&&e.target.closest&&e.target.closest('button')&&e.key===' ') return; var k=e.key; var c=null;
    if(k===' '){c='toggle'} else if(k==='ArrowRight'){c=e.shiftKey?'next':'step'} else if(k==='ArrowLeft'){c=e.shiftKey?'prev':'back'} else if(k==='PageDown'||k==='n'){c='next'} else if(k==='PageUp'||k==='p'){c='prev'} else if(k==='Escape'){c='exit'}
    if(c){ e.preventDefault(); send(c) } });
  if(ch){ ch.onmessage=function(ev){ if(ev.data&&ev.data.state){ render(ev.data.state) } } }
  window.addEventListener('message',function(ev){ if(ev.data&&ev.data.tm===NAME&&ev.data.state){ render(ev.data.state) } });
  send('hello');
  setInterval(function(){ if(!window.opener||window.opener.closed){ window.close() } },2000);
})();
</script></body></html>`
  try { win.document.open(); win.document.write(html); win.document.close() } catch (e) { try { win.close() } catch (e2) { /* ignore */ } return null }

  let ch: BroadcastChannel | null = null
  try { ch = new BroadcastChannel(name) } catch (e) { ch = null }
  let last: PresenterState | null = null
  const onMsg = (data: any): void => {
    if (!data) return
    if (data.cmd === 'hello') { if (last) send(last); return }
    const c = parseCommand(data.cmd)
    if (c) onCommand(c)
  }
  if (ch) ch.onmessage = (ev: MessageEvent) => { onMsg(ev.data) }
  const onHide = (): void => { close() }
  window.addEventListener('pagehide', onHide)
  const onWindowMsg = (ev: MessageEvent): void => { if (ev.origin === window.location.origin && ev.data && ev.data.tm === name) onMsg(ev.data) }
  window.addEventListener('message', onWindowMsg)

  const send = (st: PresenterState): void => {
    last = st
    const payload = { ...st, elapsed: formatElapsed(st.elapsedMs) }
    try { if (ch) ch.postMessage({ state: payload }); else if (win && !win.closed) win.postMessage({ tm: name, state: payload }, '*') } catch (e) { /* window gone */ }
  }
  const close = (): void => {
    try { window.removeEventListener('message', onWindowMsg); window.removeEventListener('pagehide', onHide) } catch (e) { /* ignore */ }
    try { if (ch) ch.close() } catch (e) { /* ignore */ }
    try { if (win && !win.closed) win.close() } catch (e) { /* ignore */ }
    win = null
  }
  return { send, close, isOpen: () => !!win && !win.closed }
}
