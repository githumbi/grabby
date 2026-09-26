/**
 * Reports only the styles an app actually set on an element, by diffing its
 * computed style against a fresh element of the same tag in a blank iframe.
 * "font-size: 16px" on a paragraph tells an AI nothing; "font-size: 13px" does.
 */

let baselineFrame: HTMLIFrameElement | null = null;
const baselineCache = new Map<string, Map<string, string>>();

function baselineDoc(): Document | null {
  if (baselineFrame?.isConnected && baselineFrame.contentDocument) return baselineFrame.contentDocument;
  try {
    baselineFrame = document.createElement('iframe');
    baselineFrame.setAttribute('aria-hidden', 'true');
    baselineFrame.setAttribute('tabindex', '-1');
    baselineFrame.setAttribute('data-grabby-ignore', '');
    Object.assign(baselineFrame.style, {
      position: 'fixed', width: '0', height: '0', border: '0', visibility: 'hidden', pointerEvents: 'none',
    });
    document.documentElement.appendChild(baselineFrame);
    return baselineFrame.contentDocument;
  } catch {
    return null;
  }
}

function baselineFor(tag: string, type: string | null, props: string[]): Map<string, string> {
  // An <input type="checkbox"> has very different defaults from a text input.
  const key = type ? `${tag}[${type}]` : tag;
  let cached = baselineCache.get(key);
  if (!cached) {
    cached = new Map();
    baselineCache.set(key, cached);
  }
  const missing = props.filter((p) => !cached!.has(p));
  if (missing.length > 0) {
    const doc = baselineDoc();
    const view = doc?.defaultView;
    if (doc?.body && view) {
      const probe = doc.createElement(tag);
      if (type) probe.setAttribute('type', type);
      doc.body.appendChild(probe);
      const cs = view.getComputedStyle(probe);
      for (const p of missing) cached.set(p, cs.getPropertyValue(p));
      probe.remove();
    } else {
      for (const p of missing) cached.set(p, '');
    }
  }
  return cached;
}

export function disposeStyleBaseline(): void {
  baselineFrame?.remove();
  baselineFrame = null;
  baselineCache.clear();
}

function hex2(n: number): string {
  return Math.round(n).toString(16).padStart(2, '0');
}

/** rgb(37, 99, 235) → #2563eb; keeps alpha when it isn't 1. */
export function shortColor(value: string): string {
  const m = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
  if (!m) return value;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
  if (alpha === 0) return 'transparent';
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  if (alpha >= 1) {
    // #aabbcc → #abc where it's lossless.
    return /^#(.)\1(.)\2(.)\3$/.test(base) ? `#${base[1]}${base[3]}${base[5]}` : base;
  }
  alpha = Math.round(alpha * 100) / 100;
  return `${base} ${Math.round(alpha * 100)}%`;
}

function tidy(prop: string, value: string): string {
  // 103.594px → 103.6px
  let v = value.trim().replace(/(\d+\.\d{2,})px/g, (_, n: string) => `${Math.round(Number(n) * 10) / 10}px`);
  if (/color|background|border|shadow|fill|stroke/.test(prop)) v = v.replace(/rgba?\([^)]*\)/g, (c) => shortColor(c));
  if (prop === 'font-family') v = v.split(',')[0].replace(/["']/g, '').trim();
  // "8px 8px 8px 8px" → "8px"
  const parts = v.split(' ');
  if (parts.length === 4 && parts.every((p) => p === parts[0])) v = parts[0];
  else if (parts.length === 4 && parts[0] === parts[2] && parts[1] === parts[3]) v = `${parts[0]} ${parts[1]}`;
  return v;
}

/** Computed values for `props` that differ from the tag's browser default. */
export function customStyles(el: Element, props: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  let cs: CSSStyleDeclaration;
  try {
    cs = getComputedStyle(el);
  } catch {
    return out;
  }
  const tag = el.tagName.toLowerCase();
  const type = tag === 'input' || tag === 'button' ? el.getAttribute('type') : null;
  const base = baselineFor(tag, type, props);
  for (const prop of props) {
    const value = cs.getPropertyValue(prop);
    if (!value || value === base.get(prop)) continue;
    if (value === 'none' || value === 'normal' || value === 'auto' || value === 'rgba(0, 0, 0, 0)') continue;
    // "border: 0px none rgb(…)" is no border at all.
    if (/^border/.test(prop) && (/^0px\b/.test(value) || /\bnone\b/.test(value))) continue;
    out[prop] = tidy(prop, value);
  }
  return out;
}

const SHORT_NAMES: Record<string, string> = {
  'background-color': 'bg',
  'border-radius': 'radius',
  'font-size': 'size',
  'font-weight': 'weight',
  'line-height': 'line-height',
  'font-family': 'font',
  'box-shadow': 'shadow',
  'flex-direction': 'direction',
  'grid-template-columns': 'columns',
  'justify-content': 'justify',
  'align-items': 'align',
  'text-align': 'text-align',
  'object-fit': 'fit',
};

/** "bg #2563eb · color #fff · radius 6px": the compact form used in exports. */
export function formatStyles(styles: Record<string, string>): string {
  return Object.entries(styles)
    .map(([prop, value]) => `${SHORT_NAMES[prop] ?? prop} ${prop === 'box-shadow' ? 'yes' : value}`)
    .join(' · ');
}
