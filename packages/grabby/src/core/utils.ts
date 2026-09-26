export function filterAngularClasses(classList: DOMTokenList): string[] {
  return Array.from(classList).filter(c => !c.startsWith('ng-') && !c.startsWith('_ng'));
}

const NG_ATTR_RE = /\s_ng(host|content)-[a-z0-9-]+="[^"]*"/gi;
const NG_ATTR_EMPTY_RE = /\s_ng(host|content)-[a-z0-9-]+/gi;

export function cleanAngularAttrs(html: string): string {
  return html.replace(NG_ATTR_RE, '').replace(NG_ATTR_EMPTY_RE, '');
}

/** CSS.escape, with the spec algorithm as a fallback where it's missing (jsdom). */
export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value.charAt(i);
    const code = value.charCodeAt(i);
    if (code === 0) { out += '\uFFFD'; continue; }
    if ((code >= 0x1 && code <= 0x1f) || code === 0x7f
      || (i === 0 && code >= 0x30 && code <= 0x39)
      || (i === 1 && code >= 0x30 && code <= 0x39 && value.charCodeAt(0) === 0x2d)) {
      out += `\\${code.toString(16)} `;
      continue;
    }
    if (i === 0 && value.length === 1 && code === 0x2d) { out += `\\${ch}`; continue; }
    if (code >= 0x80 || code === 0x2d || code === 0x5f
      || (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      out += ch;
      continue;
    }
    out += `\\${ch}`;
  }
  return out;
}

/** querySelector that returns null instead of throwing on a malformed selector. */
export function safeQuery(selector: string | null | undefined, root: ParentNode = document): Element | null {
  if (!selector) return null;
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

const TEST_ID_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-qa'];
const MAX_SELECTOR_DEPTH = 8;

function isUnique(selector: string, el: Element): boolean {
  try {
    const matches = el.ownerDocument.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === el;
  } catch {
    return false;
  }
}

function stepFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const sameTag = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  if (sameTag.length === 1) return tag;
  return `${tag}:nth-of-type(${sameTag.indexOf(el) + 1})`;
}

/**
 * A selector that matches exactly this element, as short as we can make it:
 * a test id, then an id, then the shortest tag/nth-of-type path that is
 * unique. Every id and attribute value is escaped, so Tailwind classes and
 * ids starting with digits can't produce a selector that throws.
 */
export function buildUniqueSelector(el: Element): string {
  for (const attr of TEST_ID_ATTRS) {
    const value = el.getAttribute(attr);
    if (value) {
      const sel = `[${attr}="${value.replace(/["\\]/g, '\\$&')}"]`;
      if (isUnique(sel, el)) return sel;
    }
  }
  if (el.id) {
    const sel = `#${cssEscape(el.id)}`;
    if (isUnique(sel, el)) return sel;
  }

  const steps: string[] = [];
  let current: Element | null = el;
  while (current && steps.length < MAX_SELECTOR_DEPTH) {
    if (current !== el && current.id) {
      const anchor = `#${cssEscape(current.id)}`;
      if (isUnique(anchor, current)) {
        steps.unshift(anchor);
        break;
      }
    }
    steps.unshift(stepFor(current));
    const sel = steps.join(' > ');
    if (isUnique(sel, el)) return sel;
    if (current.tagName === 'BODY' || current.tagName === 'HTML') break;
    current = current.parentElement;
  }
  return steps.join(' > ');
}
