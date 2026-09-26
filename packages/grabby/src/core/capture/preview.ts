import { redact, sanitizeUrl } from './redact';

export const MASK_ATTR = 'data-grabby-mask';
export const IGNORE_ATTR = 'data-grabby-ignore';

/** Attributes worth showing an AI, most useful first. */
const PRIORITY_ATTRS = [
  'id', 'class', 'role', 'aria-label', 'data-testid', 'data-test', 'data-cy', 'name', 'type',
  'href', 'src', 'alt', 'placeholder', 'title', 'for', 'aria-expanded', 'aria-selected', 'disabled',
];
const URL_ATTRS = new Set(['href', 'src']);
const MAX_ATTRS = 8;
const MAX_CLASS_CHARS = 60;
const MAX_ATTR_CHARS = 80;
const MAX_TEXT_CHARS = 80;
export const MAX_PREVIEW_CHARS = 300;

/** Framework noise that never helps: Angular/Vue/Svelte scoping and our own stamps. */
export function isNoiseAttr(name: string): boolean {
  return name.startsWith('_ng')
    || name.startsWith('ng-reflect-')
    || name.startsWith('data-v-')
    || name.startsWith('data-grabby-')
    || name.startsWith('data-svelte')
    || name === 'style'
    || name === 'value'
    || name.startsWith('on');
}

export function isNoiseClass(name: string): boolean {
  return name.startsWith('ng-') || name.startsWith('_ng') || /^svelte-[a-z0-9]+$/i.test(name) || /^s-[A-Za-z0-9_-]{8,}$/.test(name);
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function isMasked(el: Element): boolean {
  return el.closest(`[${MASK_ATTR}]`) !== null;
}

/** Visible-ish text, whitespace collapsed, scripts skipped, secrets redacted. */
export function textOf(el: Element, max: number): string {
  if (isMasked(el)) return '[masked]';
  let raw = '';
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent && /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(parent.tagName)) continue;
    if (parent?.closest(`[${IGNORE_ATTR}], [${MASK_ATTR}]`)) continue;
    raw += ` ${node.nodeValue ?? ''}`;
    if (raw.length > max * 3) break;
  }
  return truncate(redact(raw.replace(/\s+/g, ' ').trim()), max);
}

/** Text belonging to the element itself, not its element children. */
function ownText(el: Element): string {
  let raw = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) raw += ` ${node.nodeValue ?? ''}`;
  }
  return raw.replace(/\s+/g, ' ').trim();
}

function attrValue(el: Element, name: string, value: string, cleanClasses: (list: string[]) => string[]): string | null {
  if (name === 'class') {
    const classes = cleanClasses(value.split(/\s+/).filter(Boolean));
    if (classes.length === 0) return null;
    return truncate(classes.join(' '), MAX_CLASS_CHARS);
  }
  if (URL_ATTRS.has(name)) return truncate(sanitizeUrl(value), 120);
  return truncate(redact(value, { keepEmails: name === 'placeholder' }), MAX_ATTR_CHARS);
}

export function openingTag(el: Element, cleanClasses: (list: string[]) => string[] = (l) => l.filter((c) => !isNoiseClass(c))): string {
  const tag = el.tagName.toLowerCase();
  const attrs: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (attrs.length >= MAX_ATTRS || seen.has(name) || isNoiseAttr(name)) return;
    const raw = el.getAttribute(name);
    if (raw === null) return;
    seen.add(name);
    if (raw === '') { attrs.push(name); return; }
    const value = attrValue(el, name, raw, cleanClasses);
    if (value !== null) attrs.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
  };
  for (const name of PRIORITY_ATTRS) add(name);
  // Any remaining aria-* attributes carry meaning; arbitrary data-* usually doesn't.
  for (const { name } of Array.from(el.attributes)) {
    if (name.startsWith('aria-')) add(name);
  }
  return `<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`;
}

/**
 * A short, readable stand-in for outerHTML: the opening tag, a text excerpt,
 * and children collapsed to their tags. Never more than ~300 characters,
 * however big the element is.
 */
export function buildPreview(el: Element, cleanClasses?: (list: string[]) => string[]): string {
  const tag = el.tagName.toLowerCase();
  const open = openingTag(el, cleanClasses);
  if (/^(img|input|br|hr|meta|link|source|area|col|embed|wbr)$/.test(tag)) {
    return truncate(open, MAX_PREVIEW_CHARS);
  }

  const children = Array.from(el.children).filter((c) => !c.hasAttribute(IGNORE_ATTR));
  let inner: string;
  if (isMasked(el)) {
    inner = '[masked]';
  } else if (children.length === 0) {
    inner = truncate(redact(ownText(el)), MAX_TEXT_CHARS);
  } else if (children.length <= 2) {
    const text = truncate(redact(ownText(el)), 40);
    const kids = children.map((c) => {
      const t = textOf(c, 30);
      return `<${c.tagName.toLowerCase()}${t ? `>${t}</${c.tagName.toLowerCase()}>` : ' …>'}`;
    });
    inner = [text, ...kids].filter(Boolean).join(' ');
  } else {
    inner = `(${children.length} elements)`;
  }
  return truncate(`${open}${inner}</${tag}>`, MAX_PREVIEW_CHARS);
}
