/**
 * Time Machine - the spotlight pointer for presentations.
 *
 * A dark overlay over the map with a clear circle that follows the mouse, so an audience
 * sees where the speaker is pointing. Pointer events pass straight through to the map.
 * Plain DOM, no React, no SDK.
 */
export interface Spotlight {
  enable: () => void
  disable: () => void
  toggle: () => boolean
  isOn: () => boolean
  destroy: () => void
}

export function createSpotlight (container: HTMLElement, radius: number = 110): Spotlight {
  const el = document.createElement('div')
  el.className = 'tm-spotlight'
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;display:none;'
  let on = false
  let x = -9999; let y = -9999
  let addedTab = false
  const paint = (): void => {
    el.style.background = `radial-gradient(circle ${radius}px at ${x}px ${y}px, rgba(0,0,0,0) 0, rgba(0,0,0,0) ${radius - 18}px, rgba(0,0,0,0.55) ${radius}px)`
  }
  const move = (e: PointerEvent): void => {
    const r = container.getBoundingClientRect()
    x = e.clientX - r.left; y = e.clientY - r.top
    if (on) paint()
  }
  const leave = (): void => { x = -9999; y = -9999; if (on) paint() }
  // keyboard: the arrows nudge the circle, Shift moves it further
  const key = (e: KeyboardEvent): void => {
    if (!on || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return // Shift with an arrow is a chapter jump
    const d = e.shiftKey ? 100 : 25
    if (x < 0 || y < 0) { const r = container.getBoundingClientRect(); x = r.width / 2; y = r.height / 2 }
    if (e.key === 'ArrowLeft') x -= d; else if (e.key === 'ArrowRight') x += d; else if (e.key === 'ArrowUp') y -= d; else if (e.key === 'ArrowDown') y += d; else return
    e.preventDefault(); e.stopPropagation(); paint()
  }
  container.addEventListener('pointermove', move)
  container.addEventListener('pointerleave', leave)
  container.addEventListener('keydown', key, true)
  const enable = (): void => {
    on = true; el.style.display = ''
    if (x < 0 || y < 0) { const r = container.getBoundingClientRect(); x = r.width / 2; y = r.height / 2 }
    paint(); if (!el.parentNode) container.appendChild(el)
    if (!container.hasAttribute('tabindex')) { container.setAttribute('tabindex', '0'); addedTab = true }
  }
  const disable = (): void => { on = false; el.style.display = 'none' }
  return {
    enable,
    disable,
    toggle: () => { if (on) disable(); else enable(); return on },
    isOn: () => on,
    destroy: () => {
      container.removeEventListener('pointermove', move); container.removeEventListener('pointerleave', leave); container.removeEventListener('keydown', key, true)
      try { el.remove() } catch (e) { /* ignore */ }
      if (addedTab) container.removeAttribute('tabindex')
    }
  }
}
