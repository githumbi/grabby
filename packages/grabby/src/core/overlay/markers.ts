import { Z_INDEX_CROSSHAIR } from '../constants';
import { addStyles, hasStyles, removeStyles, getUiRoot } from '../ui/root';
import { svgIcon, paths, type IconSpec } from '../ui/dom';
import type { GrabbyComment } from '../types';

const LAYER_ID = '__grabby-markers__';
const TIP_ID = '__grabby-marker-tip__';
const STYLE_ID = '__grabby-marker-styles__';
const SIZE = 22;
/** How often the page's route is re-checked, for client-side navigation. */
const ROUTE_CHECK_MS = 250;
/** How often a comment whose element is missing (not rendered yet) is looked for again. */
const LOOKUP_RETRY_MS = 500;
const STAGGER_MS = 30;
const TIP_MAX = 140;

const ICON_EDIT: IconSpec = {
  size: 12,
  shapes: paths('M10.5 2.5l3 3L6 13H3v-3z', 'M9 4l3 3'),
};

export interface MarkersDeps {
  /** Every comment in this browser, newest first. */
  getComments(): GrabbyComment[];
  /** The current page, in the same form as `comment.page.route`. */
  currentRoute(): string;
  /** The element a comment was left on, if it's on the page now. */
  findElement(comment: GrabbyComment): Element | null;
  /** Hovering (or focusing) a marker; null when it ends. */
  onHover(comment: GrabbyComment | null, element: Element | null): void;
  /** A marker was clicked: open its comment for editing. */
  onOpen(comment: GrabbyComment, element: Element | null, marker: HTMLElement): void;
}

export interface Markers {
  setVisible(visible: boolean): void;
  /** Comments were added, edited or removed. */
  refresh(): void;
  isMarkerElement(el: Element): boolean;
  dispose(): void;
}

interface Entry {
  comment: GrabbyComment;
  button: HTMLButtonElement;
  number: HTMLSpanElement;
  element: Element | null;
  lastLookup: number;
}

/**
 * Numbered pins on the elements that have comments, like the numbers on a
 * marked-up printout. Only the current page's comments are shown: moving to
 * another page (including client-side routes) hides them, and coming back
 * shows them again. Each pin sits where the reviewer clicked, follows its
 * element through scrolling and layout changes, and opens the comment for
 * editing when clicked.
 */
export function createMarkers(deps: MarkersDeps): Markers {
  let layer: HTMLDivElement | null = null;
  let tip: HTMLDivElement | null = null;
  let visible = false;
  let route = '';
  let rafId: number | null = null;
  let lastRouteCheck = 0;
  let hovered: Entry | null = null;
  const entries = new Map<string, Entry>();

  function injectStyles(): void {
    if (hasStyles(STYLE_ID)) return;
    addStyles(STYLE_ID, `
      #${LAYER_ID} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: ${Z_INDEX_CROSSHAIR};
      }
      #${LAYER_ID} .grabby-marker {
        position: absolute;
        left: 0;
        top: 0;
        width: ${SIZE}px;
        height: ${SIZE}px;
        margin: 0;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: var(--grabby-accent, #2563eb);
        color: #fff;
        box-shadow: 0 0 0 2px #fff, 0 2px 6px rgba(0, 0, 0, 0.25);
        font: 600 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        pointer-events: auto;
        transition: transform 0.12s ease, box-shadow 0.15s ease;
      }
      #${LAYER_ID} .grabby-marker[hidden] { display: none; }
      #${LAYER_ID} .grabby-marker:hover,
      #${LAYER_ID} .grabby-marker:focus-visible {
        z-index: 1;
        outline: none;
        box-shadow: 0 0 0 2px #fff, 0 0 0 5px color-mix(in srgb, var(--grabby-accent, #2563eb) 35%, transparent), 0 2px 6px rgba(0, 0, 0, 0.25);
      }
      #${LAYER_ID} .grabby-marker-edit { display: none; }
      #${LAYER_ID} .grabby-marker:hover .grabby-marker-num,
      #${LAYER_ID} .grabby-marker:focus-visible .grabby-marker-num { display: none; }
      #${LAYER_ID} .grabby-marker:hover .grabby-marker-edit,
      #${LAYER_ID} .grabby-marker:focus-visible .grabby-marker-edit { display: block; }
      #${LAYER_ID} .grabby-marker-in {
        animation: grabby-marker-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      #${LAYER_ID} .grabby-marker-out {
        animation: grabby-marker-out 0.2s ease-out both;
        pointer-events: none;
      }
      @keyframes grabby-marker-in {
        from { opacity: 0; scale: 0.3; }
        to { opacity: 1; scale: 1; }
      }
      @keyframes grabby-marker-out {
        from { opacity: 1; scale: 1; }
        to { opacity: 0; scale: 0.3; }
      }
      #${TIP_ID} {
        position: fixed;
        z-index: ${Z_INDEX_CROSSHAIR};
        max-width: 260px;
        padding: 8px 10px;
        border-radius: 10px;
        background: var(--grabby-label-bg, #1e293b);
        color: #fff;
        font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
        pointer-events: none;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        animation: grabby-marker-tip-in 0.12s ease both;
      }
      #${TIP_ID}[hidden] { display: none; }
      #${TIP_ID} .grabby-marker-tip-hint { display: block; margin-top: 4px; opacity: 0.6; font-size: 11px; }
      @keyframes grabby-marker-tip-in {
        from { opacity: 0; transform: translateY(-2px); }
        to { opacity: 1; transform: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        #${LAYER_ID} .grabby-marker-in, #${LAYER_ID} .grabby-marker-out, #${TIP_ID} { animation: none; }
      }
    `);
  }

  function ensureLayer(): HTMLDivElement {
    if (layer) return layer;
    injectStyles();
    layer = document.createElement('div');
    layer.id = LAYER_ID;
    tip = document.createElement('div');
    tip.id = TIP_ID;
    tip.hidden = true;
    tip.setAttribute('role', 'tooltip');
    getUiRoot().append(layer, tip);
    return layer;
  }

  /** This page's comments, oldest first, so the first comment is 1. */
  function pageComments(): GrabbyComment[] {
    return deps.getComments().filter((c) => c.page.route === route).reverse();
  }

  function preview(text: string): string {
    const flat = text.trim();
    return flat.length > TIP_MAX ? `${flat.slice(0, TIP_MAX - 1)}…` : flat;
  }

  function createEntry(comment: GrabbyComment): Entry {
    const number = document.createElement('span');
    number.className = 'grabby-marker-num';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'grabby-marker';
    button.dataset.grabbyMarker = comment.id;
    button.append(number, svgIcon(ICON_EDIT, 'grabby-marker-edit'));
    const entry: Entry = { comment, button, number, element: null, lastLookup: 0 };
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideTip();
      deps.onOpen(entry.comment, entry.element, button);
    });
    button.addEventListener('mouseenter', () => startHover(entry));
    button.addEventListener('focus', () => startHover(entry));
    button.addEventListener('mouseleave', () => endHover(entry));
    button.addEventListener('blur', () => endHover(entry));
    return entry;
  }

  function startHover(entry: Entry): void {
    hovered = entry;
    showTip(entry);
    deps.onHover(entry.comment, entry.element);
  }

  function endHover(entry: Entry): void {
    if (hovered !== entry) return;
    hovered = null;
    hideTip();
    deps.onHover(null, null);
  }

  function showTip(entry: Entry): void {
    if (!tip) return;
    const hint = document.createElement('span');
    hint.className = 'grabby-marker-tip-hint';
    hint.textContent = 'Click to edit';
    tip.replaceChildren(document.createTextNode(preview(entry.comment.comment)), hint);
    tip.hidden = false;
    placeTip(entry);
  }

  function placeTip(entry: Entry): void {
    if (!tip || tip.hidden) return;
    const m = entry.button.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const left = Math.max(8, Math.min(m.left + m.width / 2 - t.width / 2, window.innerWidth - t.width - 8));
    const below = m.bottom + 8;
    const top = below + t.height > window.innerHeight - 8 ? m.top - 8 - t.height : below;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }

  function hideTip(): void {
    if (tip) tip.hidden = true;
  }

  function animateIn(button: HTMLButtonElement, delay: number): void {
    button.classList.remove('grabby-marker-out', 'grabby-marker-in');
    button.style.animationDelay = `${delay}ms`;
    // Restart the animation even if the class was just removed.
    void button.offsetWidth;
    button.classList.add('grabby-marker-in');
  }

  function removeEntry(id: string, animate: boolean): void {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    if (hovered === entry) endHover(entry);
    if (!animate) {
      entry.button.remove();
      return;
    }
    entry.button.style.animationDelay = '0ms';
    entry.button.classList.remove('grabby-marker-in');
    entry.button.classList.add('grabby-marker-out');
    setTimeout(() => entry.button.remove(), 220);
  }

  /** Match the pins to this page's comments; `fresh` replays the entrance for all. */
  function sync(fresh: boolean): void {
    if (!visible) return;
    const host = ensureLayer();
    const list = pageComments();
    const ids = new Set(list.map((c) => c.id));
    for (const id of [...entries.keys()]) if (!ids.has(id)) removeEntry(id, !fresh);
    list.forEach((comment, i) => {
      let entry = entries.get(comment.id);
      const isNew = !entry;
      if (!entry) {
        entry = createEntry(comment);
        entries.set(comment.id, entry);
        host.appendChild(entry.button);
      }
      entry.comment = comment;
      const n = String(i + 1);
      entry.number.textContent = n;
      entry.button.setAttribute('aria-label', `Comment ${n}: ${preview(comment.comment)}. Click to edit.`);
      if (fresh || isNew) animateIn(entry.button, fresh ? i * STAGGER_MS : 0);
    });
    if (hovered && entries.get(hovered.comment.id) === hovered) showTip(hovered);
    position(performance.now());
    schedule();
  }

  function position(now: number): void {
    for (const entry of entries.values()) {
      if (!entry.element?.isConnected) {
        entry.element = null;
        if (now - entry.lastLookup >= LOOKUP_RETRY_MS) {
          entry.lastLookup = now;
          entry.element = deps.findElement(entry.comment);
        }
      }
      const rect = entry.element?.getBoundingClientRect();
      // Not on the page, or not rendered (display: none, a closed tab panel).
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        entry.button.hidden = true;
        continue;
      }
      const pin = entry.comment.pin ?? { x: 1, y: 0 };
      const x = rect.left + pin.x * rect.width - SIZE / 2;
      const y = rect.top + pin.y * rect.height - SIZE / 2;
      entry.button.hidden = false;
      entry.button.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    if (hovered) placeTip(hovered);
  }

  function frame(): void {
    rafId = null;
    // Not the frame's timestamp: its time origin isn't guaranteed to match performance.now().
    const now = performance.now();
    if (!visible) return;
    if (now - lastRouteCheck >= ROUTE_CHECK_MS) {
      lastRouteCheck = now;
      const next = deps.currentRoute();
      if (next !== route) {
        // Another page: clear this one's pins at once, then show the new page's.
        route = next;
        for (const id of [...entries.keys()]) removeEntry(id, false);
        sync(true);
        return;
      }
    }
    position(now);
    schedule();
  }

  /**
   * Pins follow their elements every frame while any are shown; with none,
   * only the cheap route check runs, so a new page's pins still appear.
   */
  function schedule(): void {
    if (rafId === null && visible) rafId = requestAnimationFrame(frame);
  }

  function stop(): void {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  return {
    setVisible(next: boolean): void {
      if (next === visible) return;
      visible = next;
      if (next) {
        route = deps.currentRoute();
        lastRouteCheck = performance.now();
        sync(true);
      } else {
        stop();
        hideTip();
        if (hovered) endHover(hovered);
        for (const id of [...entries.keys()]) removeEntry(id, true);
      }
    },

    refresh(): void {
      sync(false);
    },

    isMarkerElement(el: Element): boolean {
      return !!layer && (layer === el || layer.contains(el));
    },

    dispose(): void {
      stop();
      entries.clear();
      layer?.remove();
      tip?.remove();
      layer = null;
      tip = null;
      hovered = null;
      visible = false;
      removeStyles(STYLE_ID);
    },
  };
}
