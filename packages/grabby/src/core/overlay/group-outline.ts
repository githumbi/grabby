import { Z_INDEX_OVERLAY } from '../constants';
import { addStyles, hasStyles, removeStyles, getUiRoot } from '../ui/root';
import type { AreaBox } from '../types';
import { areaToBox, unionBox, type Box } from '../picker/region';

const LAYER_ID = '__grabby-group__';
const STYLE_ID = '__grabby-group-styles__';
const GREEN = '#16a34a';

export type GroupSpec = { elements: Element[] } | { element: Element; area: AreaBox };

export interface GroupOutline {
  /** The rectangle being dragged; null removes it. */
  marquee(box: Box | null): void;
  /** Outline several elements, or one area, with a short label. Follows them until hidden. */
  show(spec: GroupSpec, label?: string): void;
  hide(): void;
  isVisible(): boolean;
  dispose(): void;
}

/**
 * Green outlines for a multi-element or area comment: while dragging (a live
 * preview of what will be selected), while its comment is written, and when
 * its marker is hovered. Green tells it apart from the blue single-element
 * highlight.
 */
export function createGroupOutline(): GroupOutline {
  let layer: HTMLDivElement | null = null;
  let marqueeEl: HTMLDivElement | null = null;
  let labelEl: HTMLDivElement | null = null;
  let boxes: HTMLDivElement[] = [];
  let spec: GroupSpec | null = null;
  let rafId: number | null = null;

  function ensureLayer(): HTMLDivElement {
    if (layer) return layer;
    if (!hasStyles(STYLE_ID)) {
      addStyles(STYLE_ID, `
        #${LAYER_ID} { position: fixed; inset: 0; pointer-events: none; z-index: ${Z_INDEX_OVERLAY}; }
        #${LAYER_ID} .grabby-group-box {
          position: absolute; left: 0; top: 0; box-sizing: border-box;
          border: 2px dashed ${GREEN}; border-radius: 4px; background: rgba(22, 163, 74, 0.08);
        }
        #${LAYER_ID} .grabby-group-marquee {
          position: absolute; left: 0; top: 0; box-sizing: border-box;
          border: 1px solid var(--grabby-accent, #2563eb); border-radius: 2px;
          background: color-mix(in srgb, var(--grabby-accent, #2563eb) 8%, transparent);
        }
        #${LAYER_ID} .grabby-group-label {
          position: absolute; left: 0; top: 0; padding: 2px 6px; border-radius: 3px;
          background: ${GREEN}; color: #fff; white-space: nowrap;
          font: 600 11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #${LAYER_ID} [hidden] { display: none; }
      `);
    }
    layer = document.createElement('div');
    layer.id = LAYER_ID;
    getUiRoot().appendChild(layer);
    return layer;
  }

  function place(el: HTMLElement, b: Box): void {
    el.style.transform = `translate(${Math.round(b.left)}px, ${Math.round(b.top)}px)`;
    el.style.width = `${Math.max(0, Math.round(b.right - b.left))}px`;
    el.style.height = `${Math.max(0, Math.round(b.bottom - b.top))}px`;
  }

  function currentBoxes(): Box[] {
    if (!spec) return [];
    if ('area' in spec) return spec.element.isConnected ? [areaToBox(spec.element, spec.area)] : [];
    return spec.elements.flatMap((el) => {
      if (!el.isConnected) return [];
      const r = el.getBoundingClientRect();
      return r.width === 0 && r.height === 0 ? [] : [{ left: r.left, top: r.top, right: r.right, bottom: r.bottom }];
    });
  }

  function render(): void {
    const host = ensureLayer();
    const list = currentBoxes();
    while (boxes.length < list.length) {
      const b = document.createElement('div');
      b.className = 'grabby-group-box';
      host.insertBefore(b, labelEl);
      boxes.push(b);
    }
    boxes.forEach((b, i) => {
      b.hidden = i >= list.length;
      if (i < list.length) place(b, list[i]);
    });
    if (labelEl && !labelEl.hidden) {
      const u = spec && 'elements' in spec ? unionBox(spec.elements) : list[0] ?? null;
      if (u) labelEl.style.transform = `translate(${Math.round(u.left)}px, ${Math.round(Math.max(0, u.top - 20))}px)`;
    }
  }

  function track(): void {
    rafId = null;
    if (!spec) return;
    render();
    rafId = requestAnimationFrame(track);
  }

  function stop(): void {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  return {
    marquee(box: Box | null): void {
      if (!box) {
        if (marqueeEl) marqueeEl.hidden = true;
        return;
      }
      const host = ensureLayer();
      if (!marqueeEl) {
        marqueeEl = document.createElement('div');
        marqueeEl.className = 'grabby-group-marquee';
        host.appendChild(marqueeEl);
      }
      marqueeEl.hidden = false;
      place(marqueeEl, box);
    },

    show(next: GroupSpec, label?: string): void {
      spec = next;
      const host = ensureLayer();
      if (!labelEl) {
        labelEl = document.createElement('div');
        labelEl.className = 'grabby-group-label';
        host.appendChild(labelEl);
      }
      labelEl.hidden = !label;
      labelEl.textContent = label ?? '';
      stop();
      track();
    },

    hide(): void {
      spec = null;
      stop();
      for (const b of boxes) b.hidden = true;
      if (labelEl) labelEl.hidden = true;
    },

    isVisible(): boolean {
      return spec !== null;
    },

    dispose(): void {
      stop();
      layer?.remove();
      layer = null;
      marqueeEl = null;
      labelEl = null;
      boxes = [];
      spec = null;
      removeStyles(STYLE_ID);
    },
  };
}
