import type { AreaBox } from '../types';
import { detectKind } from '../capture/kind';
import { IGNORE_ATTR } from '../capture/preview';

/** A rectangle in viewport coordinates. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** At most this many elements go into one multi-element comment. */
export const MAX_MEMBERS = 20;
/** Share of an element's area that must be inside the drag box for it to count. */
const INSIDE_RATIO = 0.85;
/** Smaller than this (either side) is decoration, not something to comment on. */
const MIN_SIDE = 4;
/** Stop walking a huge page after this many elements, so a drag never stalls. */
const MAX_VISITS = 4000;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'BR', 'WBR']);

export function boxFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
}

function overlapArea(r: DOMRect, box: Box): number {
  const w = Math.min(r.right, box.right) - Math.max(r.left, box.left);
  const h = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
  return w > 0 && h > 0 ? w * h : 0;
}

function contains(r: DOMRect, box: Box): boolean {
  return r.left <= box.left && r.top <= box.top && r.right >= box.right && r.bottom >= box.bottom;
}

function isHidden(el: Element): boolean {
  const style = getComputedStyle(el);
  return style.visibility === 'hidden' || style.opacity === '0';
}

/**
 * The elements a drag box selects: the outermost ones that are (almost)
 * entirely inside it, skipping page-sized sections, hidden and tiny elements,
 * Grabby's own UI and anything marked data-grabby-ignore. Subtrees outside
 * the box are not walked. In document order, at most MAX_MEMBERS.
 */
export function elementsInBox(box: Box, isUiNode: (el: Element) => boolean, root: Element = document.body): Element[] {
  const found: Element[] = [];
  let visits = 0;

  const visit = (el: Element): void => {
    if (found.length >= MAX_MEMBERS || ++visits > MAX_VISITS) return;
    if (SKIP_TAGS.has(el.tagName) || isUiNode(el) || el.hasAttribute(IGNORE_ATTR)) return;
    const r = el.getBoundingClientRect();
    const boxless = r.width === 0 && r.height === 0;
    // display: contents (and similar) has no box of its own: look inside.
    if (!boxless && overlapArea(r, box) === 0) return;
    if (!boxless && r.width >= MIN_SIDE && r.height >= MIN_SIDE) {
      const inside = overlapArea(r, box) / (r.width * r.height);
      if (inside >= INSIDE_RATIO && detectKind(el) !== 'section' && !isHidden(el)) {
        found.push(el);
        return;
      }
    }
    for (const child of Array.from(el.children)) visit(child);
  };

  for (const child of Array.from(root.children)) visit(child);
  return found;
}

/** The nearest element that contains all of them (their lowest common ancestor). */
export function commonContainer(elements: Element[]): Element {
  if (elements.length === 0) return document.body;
  let candidate: Element | null = elements[0].parentElement ?? document.body;
  while (candidate && !elements.every((el) => candidate!.contains(el))) candidate = candidate.parentElement;
  return candidate ?? document.body;
}

/** The smallest page element whose box contains the whole drag box (for an area comment). */
export function containerForBox(box: Box, isUiNode: (el: Element) => boolean): Element {
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const stack = typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(cx, cy) : [];
  for (const el of stack) {
    if (isUiNode(el) || el.closest(`[${IGNORE_ATTR}]`)) continue;
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      if (contains(cur.getBoundingClientRect(), box)) return cur;
    }
  }
  return document.body;
}

const frac = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

/** The drag box as fractions of `el`'s box, so it follows the element. */
export function areaWithin(el: Element, box: Box): AreaBox {
  const r = el.getBoundingClientRect();
  const w = r.width || 1;
  const h = r.height || 1;
  return {
    x: frac((box.left - r.left) / w),
    y: frac((box.top - r.top) / h),
    w: frac((box.right - box.left) / w),
    h: frac((box.bottom - box.top) / h),
  };
}

/** An area back in viewport coordinates, from its element's current box. */
export function areaToBox(el: Element, area: AreaBox): Box {
  const r = el.getBoundingClientRect();
  return {
    left: r.left + area.x * r.width,
    top: r.top + area.y * r.height,
    right: r.left + (area.x + area.w) * r.width,
    bottom: r.top + (area.y + area.h) * r.height,
  };
}

/** The box around several elements. */
export function unionBox(elements: Element[]): Box | null {
  let out: Box | null = null;
  for (const el of elements) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    out = out
      ? { left: Math.min(out.left, r.left), top: Math.min(out.top, r.top), right: Math.max(out.right, r.right), bottom: Math.max(out.bottom, r.bottom) }
      : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  return out;
}
