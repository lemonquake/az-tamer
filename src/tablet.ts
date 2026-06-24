// ============================================================
// AZ Tamer — the Digivice Tablet shell.
// Wraps any set of "pages" (the hotkey panels) in a sleek
// obsidian-glass device: left icon rail, filtered glass screen,
// click-hold drag to swap screens, ripple feedback, and a glowing
// power button on the right that drops the device on close / lifts
// it on open. Page bodies are produced by the caller (ui.ts) so no
// game mechanics live here — this is pure chrome + interaction.
// ============================================================
import { icon } from './icons';
import { sfx } from './audio';

export interface TabletTab {
  key: string;
  /** icon name from icons.ts */
  icon: string;
  /** display title (shown in the screen header) */
  label: string;
  /** hotkey letter shown on the rail button, e.g. 'P' */
  hotkey: string;
  /** show an attention dot on the rail tab */
  flashNew?: boolean;
}

export interface TabletSysButton {
  id: string;
  icon: string;
  title: string;
  onClick: () => void;
}

export interface TabletOpts {
  tabs: TabletTab[];
  initial: string;
  /** HTML for a tab's screen body */
  renderPage: (key: string) => string;
  /** wire the freshly-rendered screen body element */
  wirePage: (key: string, page: HTMLElement) => void;
  /** called after the active tab changes (sync side-state) */
  onTab?: (key: string) => void;
  /** extra buttons at the foot of the rail (e.g. Save) */
  sysButtons?: TabletSysButton[];
  /** invoked once the close animation has finished */
  onClose: () => void;
  /** skip the boot sound + lift animation (used for silent re-mounts) */
  noBoot?: boolean;
}

export interface TabletHandle {
  setTab(key: string): void;
  current(): string;
  rerender(): void;
  close(): void;
  /** update the rail attention dots without a full rebuild */
  refreshTabs(tabs: TabletTab[]): void;
  el: HTMLElement;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Nearest vertically-scrollable element at/above `start`, bounded by `boundary`. */
function nearestScrollable(start: HTMLElement | null, boundary: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = start;
  while (el) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') return el;
    }
    if (el === boundary) break;
    el = el.parentElement;
  }
  return boundary.scrollHeight > boundary.clientHeight + 1 ? boundary : null;
}

/** Spawn a quick cyan ripple at a screen point. */
function ripple(x: number, y: number, size = 88): void {
  const r = document.createElement('div');
  r.className = 'tap-ripple';
  r.style.left = x + 'px';
  r.style.top = y + 'px';
  r.style.setProperty('--rsize', size + 'px');
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 520);
}

/**
 * Make any scroll container respond to click-hold vertical dragging (touch-style),
 * so non-touch users can grab and pull the content. Skips the Tablet screen (which
 * runs its own swipe/scroll), 3D-preview canvases, and form controls; clicks survive
 * via an 8px movement threshold; no-ops on content that doesn't overflow.
 */
export function enableDragScroll(el: HTMLElement): void {
  let sy = 0, lastY = 0, active: number | null = null, decided = false, skip = false;
  let target: HTMLElement | null = null;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || active !== null) return;
    skip = !!(e.target as HTMLElement).closest('.tablet-screen, canvas, input, select, textarea, [data-no-dragscroll]');
    sy = e.clientY; lastY = e.clientY; active = e.pointerId; target = null; decided = false;
  });
  el.addEventListener('pointermove', e => {
    if (active !== e.pointerId || skip) return;
    if (!decided) {
      if (Math.abs(e.clientY - sy) < 8) return;
      target = nearestScrollable(e.target as HTMLElement, el); // scroll whatever's under the cursor
      if (!target) { skip = true; return; }
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      decided = true;
    }
    if (target) { e.preventDefault(); target.scrollTop -= (e.clientY - lastY); lastY = e.clientY; }
  });
  const end = (e: PointerEvent) => { if (active === e.pointerId) { active = null; target = null; decided = false; } };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/** Build + wire a Tablet into `container`, returning a control handle. */
export function mountTablet(container: HTMLElement, opts: TabletOpts): TabletHandle {
  let current = opts.initial;
  let tabs = opts.tabs.slice();
  let closed = false;

  const railTabsHTML = () => tabs.map(t =>
    `<button class="trail-tab${t.key === current ? ' active' : ''}${t.flashNew ? ' flash-new' : ''}" data-tab="${t.key}" title="${t.label} (${t.hotkey})" aria-label="${t.label}">`
    + `${icon(t.icon, { size: 24 })}<span class="tab-key">${t.hotkey}</span></button>`
  ).join('');

  const sysHTML = () => (opts.sysButtons ?? []).map(b =>
    `<button class="trail-tab sys" id="${b.id}" title="${b.title}" aria-label="${b.title}">${icon(b.icon, { size: 20 })}</button>`
  ).join('');

  const dotsHTML = () => tabs.map(t => `<span class="tscreen-dot${t.key === current ? ' on' : ''}" data-dot="${t.key}"></span>`).join('');

  const titleHTML = (key: string) => {
    const t = tabs.find(x => x.key === key);
    return t ? `${icon(t.icon, { size: 18 })}<span>${t.label}</span>` : '';
  };

  container.classList.add('tablet-host');
  container.innerHTML = `
    <div class="tablet-wrap">
      <div class="tablet opening">
        <div class="tablet-body">
          <div class="tablet-rail">
            ${railTabsHTML()}
            ${opts.sysButtons && opts.sysButtons.length ? `<div class="trail-sep"></div>${sysHTML()}` : ''}
          </div>
          <div class="tablet-screen booting">
            <div class="tscreen-header">
              <div class="tscreen-title">${titleHTML(current)}</div>
              <div class="tscreen-grip" title="Hold &amp; drag to switch screens">${icon('grip', { size: 16 })}<div class="tscreen-dots">${dotsHTML()}</div></div>
            </div>
            <div class="tscreen-scroll">
              <div class="tscreen-track"><div class="tscreen-page"></div></div>
            </div>
            <div class="tscreen-fx"></div>
            <div class="tscreen-vig"></div>
          </div>
          <div class="tablet-side">
            <div class="tablet-led green"></div>
            <div class="tablet-led gold"></div>
            <button class="tablet-power" id="panel-close" title="Lock &amp; close (Esc)" aria-label="Lock and close">
              ${icon('power', { size: 22 })}<span class="pwr-label">LOCK</span>
            </button>
          </div>
        </div>
      </div>
    </div>`;

  const tabletEl = container.querySelector('.tablet') as HTMLElement;
  const screen = container.querySelector('.tablet-screen') as HTMLElement;
  const track = container.querySelector('.tscreen-track') as HTMLElement;
  const pageEl = container.querySelector('.tscreen-page') as HTMLElement;
  const rail = container.querySelector('.tablet-rail') as HTMLElement;
  const titleEl = container.querySelector('.tscreen-title') as HTMLElement;
  const dotsEl = container.querySelector('.tscreen-dots') as HTMLElement;
  const powerBtn = container.querySelector('.tablet-power') as HTMLElement;

  // boot: clear the one-shot open/boot classes once they have played
  if (opts.noBoot) {
    tabletEl.classList.remove('opening');
    screen.classList.remove('booting');
  } else {
    sfx('power');
    setTimeout(() => { tabletEl.classList.remove('opening'); screen.classList.remove('booting'); }, 680);
  }

  // ---- page rendering ----
  const drawPage = (slideDir: 0 | 1 | -1) => {
    pageEl.classList.remove('slide-r', 'slide-l');
    pageEl.innerHTML = opts.renderPage(current);
    // force reflow so the slide animation restarts
    if (slideDir) { void pageEl.offsetWidth; pageEl.classList.add(slideDir > 0 ? 'slide-r' : 'slide-l'); }
    opts.wirePage(current, pageEl);
  };

  const syncChrome = () => {
    rail.querySelectorAll<HTMLElement>('.trail-tab[data-tab]').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === current));
    titleEl.innerHTML = titleHTML(current);
    dotsEl.querySelectorAll<HTMLElement>('.tscreen-dot').forEach(d =>
      d.classList.toggle('on', d.dataset.dot === current));
  };

  const idxOf = (key: string) => Math.max(0, tabs.findIndex(t => t.key === key));

  const setTab = (key: string, fromDrag = false) => {
    if (closed || key === current) return;
    const dir: 1 | -1 = idxOf(key) > idxOf(current) ? 1 : -1;
    current = key;
    if (!fromDrag) sfx('swipe');
    syncChrome();
    drawPage(dir);
    opts.onTab?.(key);
    // keep the scroll at the top on a screen change
    const scroll = screen.querySelector('.tscreen-scroll') as HTMLElement;
    if (scroll) scroll.scrollTop = 0;
  };

  const step = (dir: 1 | -1) => {
    const i = idxOf(current);
    const ni = (i + dir + tabs.length) % tabs.length;
    setTab(tabs[ni].key, true);
    sfx('swipe');
  };

  // ---- rail wiring ----
  rail.querySelectorAll<HTMLElement>('.trail-tab[data-tab]').forEach(b => {
    b.onmouseenter = () => { if (b.dataset.tab !== current) sfx('tabHover'); };
    b.onclick = () => setTab(b.dataset.tab!);
  });
  (opts.sysButtons ?? []).forEach(sb => {
    const el = container.querySelector('#' + sb.id) as HTMLElement | null;
    if (el) el.onclick = sb.onClick;
  });

  // ---- power button: lift on open is automatic; press drops the device ----
  const doClose = () => {
    if (closed) return;
    closed = true;
    powerBtn.classList.add('pressed');
    sfx('lock');
    tabletEl.classList.remove('opening');
    tabletEl.classList.add('closing');
    setTimeout(() => opts.onClose(), 420);
  };
  powerBtn.onclick = doClose;

  // ---- ripple feedback on any device tap ----
  tabletEl.addEventListener('pointerdown', e => {
    const t = e.target as HTMLElement;
    ripple(e.clientX, e.clientY, t.closest('.tablet-power') ? 70 : 88);
  });

  // ---- click-hold drag: horizontal swaps screens, vertical scrolls the page ----
  const scroll = container.querySelector('.tscreen-scroll') as HTMLElement;
  let sx = 0, sy = 0, lastY = 0, activePtr: number | null = null;
  let mode: '' | 'swipe' | 'scroll' = '', decided = false, skip = false;
  let scrollTarget: HTMLElement | null = null;
  screen.addEventListener('pointerdown', e => {
    if (e.button !== 0 || activePtr !== null) return;
    // leave 3D previews (canvas) and form controls to their own pointer handlers
    skip = !!(e.target as HTMLElement).closest('canvas, input, select, textarea, [data-no-dragscroll]');
    sx = e.clientX; sy = e.clientY; lastY = e.clientY; activePtr = e.pointerId; mode = ''; decided = false;
  });
  screen.addEventListener('pointermove', e => {
    if (activePtr !== e.pointerId || skip) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // horizontal-dominant → swipe between tabs; otherwise → drag-scroll the page
      mode = Math.abs(dx) > Math.abs(dy) * 1.25 ? 'swipe' : 'scroll';
      if (mode === 'swipe') screen.classList.add('dragging');
      else scrollTarget = nearestScrollable(e.target as HTMLElement, scroll);
      try { screen.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      decided = true;
    }
    if (mode === 'swipe') {
      e.preventDefault();
      const damp = clamp(dx * 0.55, -130, 130);
      track.style.transform = `translateX(${damp}px)`;
      track.style.opacity = String(1 - Math.min(0.4, Math.abs(dx) / 650));
    } else if (mode === 'scroll' && scrollTarget) {
      e.preventDefault();
      scrollTarget.scrollTop -= (e.clientY - lastY);
      lastY = e.clientY;
    }
  });
  const endDrag = (e: PointerEvent) => {
    if (activePtr !== e.pointerId) return;
    const dx = e.clientX - sx;
    activePtr = null;
    if (mode === 'swipe') {
      screen.classList.remove('dragging');
      track.style.transition = 'transform .25s ease, opacity .25s ease';
      track.style.transform = '';
      track.style.opacity = '';
      setTimeout(() => { track.style.transition = ''; }, 270);
      const COMMIT = 72;
      if (dx <= -COMMIT) step(1);
      else if (dx >= COMMIT) step(-1);
    }
    mode = ''; decided = false;
  };
  screen.addEventListener('pointerup', endDrag);
  screen.addEventListener('pointercancel', endDrag);

  // initial paint
  drawPage(0);
  syncChrome();

  return {
    el: tabletEl,
    current: () => current,
    setTab: (k: string) => setTab(k),
    rerender: () => { drawPage(0); },
    close: doClose,
    refreshTabs: (next: TabletTab[]) => {
      tabs = next.slice();
      // refresh just the attention dots / labels in place
      next.forEach(t => {
        const b = rail.querySelector<HTMLElement>(`.trail-tab[data-tab="${t.key}"]`);
        if (b) b.classList.toggle('flash-new', !!t.flashNew);
      });
    },
  };
}
