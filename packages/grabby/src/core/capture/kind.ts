import type { TargetKind } from '../types';

const ACTION_TAGS = new Set(['BUTTON', 'A', 'SUMMARY']);
const ACTION_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'switch', 'option', 'checkbox', 'radio']);
const BUTTON_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'image']);
const FIELD_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const FIELD_ROLES = new Set(['textbox', 'combobox', 'searchbox', 'spinbutton', 'slider']);
const MEDIA_TAGS = new Set(['IMG', 'SVG', 'VIDEO', 'PICTURE', 'CANVAS', 'IFRAME', 'AUDIO']);
const TEXT_TAGS = new Set([
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SPAN', 'LABEL', 'LI', 'STRONG', 'EM', 'B', 'I',
  'SMALL', 'BLOCKQUOTE', 'CODE', 'PRE', 'TD', 'TH', 'DT', 'DD', 'FIGCAPTION', 'LEGEND', 'CAPTION', 'Q', 'CITE', 'MARK', 'TIME',
]);
const PAGE_TAGS = new Set(['HTML', 'BODY', 'MAIN']);
const LANDMARK_TAGS = new Set(['HEADER', 'FOOTER', 'NAV', 'ASIDE']);

/** Share of the viewport above which an element counts as a page section. */
const SECTION_AREA_RATIO = 0.6;

function role(el: Element): string {
  return (el.getAttribute('role') ?? '').toLowerCase();
}

function isAction(el: Element): boolean {
  if (ACTION_TAGS.has(el.tagName)) return el.tagName !== 'A' || el.hasAttribute('href') || el.hasAttribute('role');
  if (el.tagName === 'INPUT' && BUTTON_INPUT_TYPES.has((el as HTMLInputElement).type)) return true;
  return ACTION_ROLES.has(role(el));
}

function isField(el: Element): boolean {
  if (el.tagName === 'INPUT') return !BUTTON_INPUT_TYPES.has((el as HTMLInputElement).type);
  if (FIELD_TAGS.has(el.tagName)) return true;
  if ((el as HTMLElement).isContentEditable && el.getAttribute('contenteditable') !== null) return true;
  return FIELD_ROLES.has(role(el));
}

function coversViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  if (!vw || !vh) return false;
  const w = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
  const hgt = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
  return (w * hgt) / (vw * vh) >= SECTION_AREA_RATIO;
}

function hasElementChildren(el: Element): boolean {
  return el.children.length > 0;
}

export function detectKind(el: Element): TargetKind {
  if (PAGE_TAGS.has(el.tagName)) return 'section';
  if (MEDIA_TAGS.has(el.tagName)) return 'media';
  if (isField(el)) return 'field';
  if (isAction(el)) return 'action';
  if (LANDMARK_TAGS.has(el.tagName) || role(el) === 'main' || role(el) === 'region') {
    return coversViewport(el) ? 'section' : 'container';
  }
  if (TEXT_TAGS.has(el.tagName)) return 'text';
  if (!hasElementChildren(el) && (el.textContent ?? '').trim()) return 'text';
  if (coversViewport(el)) return 'section';
  return 'container';
}

/** How many ancestors up we look for an interactive element to promote to. */
const PROMOTE_DEPTH = 3;

/**
 * Clicking the icon or label inside a button almost always means the button.
 * Returns the nearest action or field ancestor within a few levels, or the
 * element itself when there's none (or it's already interactive).
 */
export function promoteTarget(el: Element): Element {
  if (isAction(el) || isField(el)) return el;
  let current = el.parentElement;
  for (let depth = 0; current && depth < PROMOTE_DEPTH; depth++) {
    if (isAction(current) || isField(current)) return current;
    if (PAGE_TAGS.has(current.tagName)) break;
    current = current.parentElement;
  }
  return el;
}
