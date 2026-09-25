/**
 * Time Machine - slide decks from a story.
 *
 * One slide per chapter: a map picture taken at that chapter, the date, the title, the
 * text, and the speaker notes, as a self contained web slideshow (.html) with keyboard
 * navigation and a notes view, which prints one slide per page for a PDF. No library.
 * Pure: strings in, text out. widget.tsx takes the pictures and downloads the file.
 */

export interface DeckSlide {
  index: number
  date: string
  title: string
  text: string
  notes: string
  /** JPEG data URL of the map at this chapter, or empty when none could be taken. */
  image: string
  /** Pixel size of the picture, so it is fitted and not stretched. */
  imageW?: number
  imageH?: number
  /** Optional counts line, for example "142 annexations". */
  caption?: string
}

export interface DeckModel {
  title: string
  subtitle: string
  /** Footer credit, for example the organization name. */
  credit: string
  slides: DeckSlide[]
  /** Page language, from the app. */
  lang?: string
  /** CSS font-family; empty for the system font. */
  font?: string
  /** https logo for the title slide and the header of every slide. */
  logo?: string
  logoHeight?: number
  /** Colors the deck uses; theme tokens from the widget. */
  colors: { background: string, text: string, muted: string, accent: string, surface: string }
}

const esc = (s: string): string => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
/* ------------------------------------------------------------------ web slideshow */

export function htmlDeck (m: DeckModel): string {
  const c = m.colors
  const slides = m.slides.map(s => `
<section class="slide" data-n="${s.index + 1}">
  <header><span class="date">${esc(s.date)}</span><span style="display:flex;align-items:center;gap:12px">${m.logo ? `<img class="logo" src="${esc(m.logo)}" alt="">` : ''}<span class="n">${s.index + 1} / ${m.slides.length}</span></span></header>
  ${s.image ? `<figure><img src="${s.image}" alt="${esc(`Map on ${s.date}${s.title ? ': ' + s.title : ''}`)}"></figure>` : '<figure class="empty"></figure>'}
  <div class="copy"><h2>${esc(s.title || s.date)}</h2>${s.caption ? `<p class="cap">${esc(s.caption)}</p>` : ''}${s.text ? `<p>${esc(s.text).replace(/\n/g, '<br>')}</p>` : ''}</div>
  <aside class="notes">${esc(s.notes).replace(/\n/g, '<br>') || '<em>No notes.</em>'}</aside>
</section>`).join('\n')
  return `<!doctype html>
<html lang="${esc(m.lang || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.title)}</title>
<style>
  :root{--bg:${c.background};--fg:${c.text};--muted:${c.muted};--accent:${c.accent};--surface:${c.surface}}
  html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font:16px/1.5 ${m.font ? m.font + ',' : ''} -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .logo{height:${m.logoHeight || 32}px;max-width:200px;object-fit:contain}
  .deck{position:relative;height:100%;overflow:hidden}
  .slide{position:absolute;inset:0;display:none;flex-direction:column;padding:28px 40px;box-sizing:border-box;gap:12px}
  .slide.on{display:flex}
  header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid var(--accent);padding-bottom:6px}
  .date{font-size:34px;font-weight:700}.n{color:var(--muted)}
  figure{margin:0;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:var(--surface);border-radius:10px;overflow:hidden}
  figure img{max-width:100%;max-height:100%;object-fit:contain}
  .copy h2{margin:0 0 4px 0;font-size:26px}.copy p{margin:0;font-size:18px;max-height:7.5em;overflow:auto}.cap{color:var(--muted);font-size:15px!important}
  .notes{display:none;position:absolute;right:20px;bottom:20px;max-width:40%;max-height:45%;overflow:auto;background:var(--surface);color:var(--fg);border-left:5px solid var(--accent);border-radius:8px;padding:12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.25);font-size:15px}
  body.notes .notes{display:block}
  .title{justify-content:center;align-items:center;text-align:center}.title h1{font-size:54px;margin:0}.title p{color:var(--muted);font-size:22px}
  .bar{position:absolute;left:0;bottom:0;height:5px;background:var(--accent);width:0;transition:width .2s}
  .help{position:absolute;left:14px;bottom:12px;color:var(--muted);font-size:12px}
  .credit{position:absolute;right:14px;bottom:12px;color:var(--muted);font-size:12px}
  @media (prefers-reduced-motion:reduce){.bar{transition:none}}
  @media print{.deck{overflow:visible}.slide{display:flex!important;position:relative;height:100vh;page-break-after:always}.notes{display:block;position:static;max-width:none;box-shadow:none;margin-top:8px}.bar,.help{display:none}}
</style></head><body>
<div class="deck">
<section class="slide title on" data-n="0">${m.logo ? `<img class="logo" src="${esc(m.logo)}" alt="" style="height:${(m.logoHeight || 32) * 2}px;margin-bottom:16px">` : ''}<h1>${esc(m.title)}</h1><p>${esc(m.subtitle)}</p><p class="cap">${m.slides.length} slides</p></section>
${slides}
<div class="bar" id="bar"></div>
<div class="help">Arrows or Space: next and back. S: speaker notes. Home and End. P: print to PDF.</div>
<div class="credit">${esc(m.credit)}</div>
</div>
<script>
(function(){
  var slides=[].slice.call(document.querySelectorAll('.slide')), i=0, bar=document.getElementById('bar');
  function show(n){ i=Math.max(0,Math.min(slides.length-1,n)); slides.forEach(function(s,k){ s.classList.toggle('on',k===i) }); bar.style.width=(i/(slides.length-1)*100)+'%'; location.hash='#'+i }
  document.addEventListener('keydown',function(e){ var k=e.key;
    if(k==='ArrowRight'||k===' '||k==='PageDown'||k==='Enter'){ e.preventDefault(); show(i+1) }
    else if(k==='ArrowLeft'||k==='PageUp'||k==='Backspace'){ e.preventDefault(); show(i-1) }
    else if(k==='Home'){ show(0) } else if(k==='End'){ show(slides.length-1) }
    else if(k==='s'||k==='S'){ document.body.classList.toggle('notes') } else if(k==='p'||k==='P'){ window.print() } });
  document.addEventListener('click',function(e){ if(e.clientX>window.innerWidth*0.6) show(i+1); else if(e.clientX<window.innerWidth*0.2) show(i-1) });
  var h=parseInt(location.hash.slice(1),10); show(isFinite(h)?h:0);
})();
</script></body></html>`
}

/* ------------------------------------------------------------------ chapters from the data */

export interface AutoChapterInput { key: string, from: number, to: number, n: number }

/**
 * Story points made from the activity bars: either the busiest N periods, or one every
 * N buckets. Returns bucket keys in slider order with the count, for the widget to turn
 * into chapters with dates and captions.
 */
export function autoChapterKeys (bars: AutoChapterInput[], mode: 'busiest' | 'every', n: number): AutoChapterInput[] {
  const live = bars.filter(b => b.n > 0)
  if (!live.length) return []
  const k = Math.max(1, Math.round(n))
  if (mode === 'busiest') {
    const top = live.slice().sort((a, b) => b.n - a.n || a.from - b.from).slice(0, k)
    return top.sort((a, b) => a.from - b.from)
  }
  const out: AutoChapterInput[] = []
  for (let i = 0; i < bars.length; i += k) {
    const group = bars.slice(i, i + k)
    const sum = group.reduce((s, b) => s + b.n, 0)
    if (!sum) continue
    out.push({ key: group.length > 1 ? `${group[0].key} to ${group[group.length - 1].key}` : group[0].key, from: group[0].from, to: group[group.length - 1].to, n: sum })
  }
  return out
}
