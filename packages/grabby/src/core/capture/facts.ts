import type { TargetKind, ComponentResolver } from '../types';
import { customStyles, formatStyles } from './styles';
import { textOf, truncate, isMasked, IGNORE_ATTR } from './preview';
import { redact, sanitizeUrl } from './redact';

type Facts = Record<string, string>;

export interface FactsResult {
  facts: Facts;
  extra: Facts;
}

const ACTION_STYLES = ['background-color', 'color', 'font-size', 'font-weight', 'padding', 'border-radius', 'border'];
const FIELD_STYLES = ['background-color', 'border', 'border-radius', 'padding', 'font-size'];
const TEXT_STYLES = ['font-size', 'font-weight', 'line-height', 'color', 'font-family', 'text-align', 'letter-spacing'];
const MEDIA_STYLES = ['object-fit', 'border-radius', 'aspect-ratio'];
const CONTAINER_STYLES = ['display', 'flex-direction', 'gap', 'grid-template-columns', 'justify-content', 'align-items', 'padding', 'max-width', 'background-color', 'border-radius', 'box-shadow', 'border'];
const EXTRA_STYLES = ['margin', 'color', 'background-color', 'font-size', 'font-weight', 'line-height', 'display', 'position', 'z-index', 'opacity', 'overflow', 'box-shadow', 'border'];

function put(facts: Facts, key: string, value: string | null | undefined): void {
  if (value !== null && value !== undefined && value !== '') facts[key] = value;
}

function size(el: Element): string {
  const r = el.getBoundingClientRect();
  return r.width || r.height ? `${Math.round(r.width)}×${Math.round(r.height)}` : '';
}

function labelledBy(el: Element): string {
  const ids = el.getAttribute('aria-labelledby');
  if (!ids) return '';
  return ids.split(/\s+/)
    .map((id) => el.ownerDocument.getElementById(id))
    .filter((n): n is HTMLElement => !!n)
    .map((n) => textOf(n, 60))
    .join(' ');
}

function accessibleLabel(el: Element): string {
  return redact(el.getAttribute('aria-label') ?? '') || labelledBy(el);
}

function states(el: Element): string {
  const out: string[] = [];
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') out.push('disabled');
  for (const a of ['aria-expanded', 'aria-pressed', 'aria-selected', 'aria-checked']) {
    const v = el.getAttribute(a);
    if (v !== null) out.push(`${a.slice(5)}=${v}`);
  }
  if (el.getAttribute('aria-current')) out.push('current');
  return out.join(', ');
}

function actionFacts(el: Element): Facts {
  const f: Facts = {};
  const imgAlt = el.querySelector('img[alt]')?.getAttribute('alt') ?? '';
  put(f, 'label', accessibleLabel(el) || textOf(el, 80) || redact(el.getAttribute('title') ?? '') || redact(imgAlt));
  if (el.tagName === 'A') put(f, 'href', sanitizeUrl(el.getAttribute('href') ?? ''));
  else if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') put(f, 'type', el.getAttribute('type') ?? (el.tagName === 'BUTTON' ? 'submit' : ''));
  put(f, 'state', states(el));
  put(f, 'styles', formatStyles(customStyles(el, ACTION_STYLES)));
  return f;
}

function fieldLabel(el: Element): string {
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length > 0) return textOf(labels[0], 60);
  return accessibleLabel(el) || redact(el.getAttribute('placeholder') ?? '');
}

/** Form fields: what the field is, never what's typed in it. */
function fieldFacts(el: Element): Facts {
  const f: Facts = {};
  put(f, 'label', fieldLabel(el));
  const type = el.tagName === 'INPUT' ? ((el as HTMLInputElement).type || 'text') : el.tagName.toLowerCase();
  put(f, 'type', type);
  put(f, 'placeholder', redact(el.getAttribute('placeholder') ?? ''));
  const flags: string[] = [];
  if ((el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true') flags.push('required');
  if ((el as HTMLInputElement).disabled) flags.push('disabled');
  if (el.getAttribute('aria-invalid') === 'true') flags.push('invalid');
  put(f, 'state', flags.join(', '));
  if (el.tagName === 'SELECT') put(f, 'options', String((el as HTMLSelectElement).options.length));
  put(f, 'styles', formatStyles(customStyles(el, FIELD_STYLES)));
  return f;
}

function textFacts(el: Element): Facts {
  const f: Facts = {};
  put(f, 'text', textOf(el, 120));
  put(f, 'styles', formatStyles(customStyles(el, TEXT_STYLES)));
  return f;
}

function basename(url: string): string {
  const clean = sanitizeUrl(url);
  return clean.split('/').filter(Boolean).pop() ?? clean;
}

function mediaFacts(el: Element): Facts {
  const f: Facts = {};
  if (el.tagName === 'IMG') {
    const img = el as HTMLImageElement;
    put(f, 'alt', img.hasAttribute('alt') ? (redact(img.alt) || '(empty)') : '(missing)');
    put(f, 'src', basename(img.currentSrc || img.getAttribute('src') || ''));
    if (img.naturalWidth) put(f, 'natural', `${img.naturalWidth}×${img.naturalHeight}`);
  } else if (el.tagName === 'SVG' || el.tagName.toLowerCase() === 'svg') {
    put(f, 'label', accessibleLabel(el) || textOf(el.querySelector('title') ?? el, 40));
    put(f, 'viewBox', el.getAttribute('viewBox') ?? '');
  } else if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO' || el.tagName === 'IFRAME') {
    put(f, 'src', basename(el.getAttribute('src') ?? el.querySelector('source')?.getAttribute('src') ?? ''));
    put(f, 'title', redact(el.getAttribute('title') ?? ''));
  }
  put(f, 'size', size(el));
  put(f, 'styles', formatStyles(customStyles(el, MEDIA_STYLES)));
  return f;
}

function childLabel(child: Element, resolver: ComponentResolver | null): string {
  const resolved = resolver?.(child);
  if (resolved?.name && resolved.hostElement === child) return resolved.name;
  const tag = child.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'a') return 'link';
  if (tag === 'img' || tag === 'svg') return 'image';
  if (tag === 'ul' || tag === 'ol') return 'list';
  return tag;
}

/** "heading, 3× PlanCard, 1× button": what's inside, without the markup. */
function childSummary(el: Element, resolver: ComponentResolver | null): string {
  const counts = new Map<string, number>();
  for (const child of Array.from(el.children)) {
    if (child.hasAttribute(IGNORE_ATTR) || /^(SCRIPT|STYLE|TEMPLATE)$/.test(child.tagName)) continue;
    const label = childLabel(child, resolver);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const parts = Array.from(counts.entries()).slice(0, 6).map(([label, n]) => (n > 1 ? `${n}× ${label}` : label));
  if (counts.size > 6) parts.push('…');
  return parts.join(', ');
}

function firstHeading(el: Element): string {
  const heading = el.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
  return heading ? textOf(heading, 60) : '';
}

function containerFacts(el: Element, resolver: ComponentResolver | null): Facts {
  const f: Facts = {};
  put(f, 'heading', firstHeading(el));
  put(f, 'contains', childSummary(el, resolver));
  put(f, 'size', size(el));
  put(f, 'layout', formatStyles(customStyles(el, CONTAINER_STYLES)));
  return f;
}

function sectionFacts(el: Element, resolver: ComponentResolver | null): Facts {
  const f: Facts = {};
  put(f, 'title', redact(el.ownerDocument.title));
  put(f, 'viewport', `${window.innerWidth}×${window.innerHeight}`);
  const regions = Array.from(el.querySelectorAll('header, nav, main, aside, footer, section, [role="region"]'))
    .filter((r) => !r.parentElement?.closest('header, nav, main, aside, footer, section, [role="region"]') || r.parentElement === el)
    .slice(0, 8)
    .map((r) => {
      const heading = firstHeading(r);
      return heading ? `${r.tagName.toLowerCase()} "${truncate(heading, 30)}"` : r.tagName.toLowerCase();
    });
  put(f, 'regions', regions.join(', '));
  put(f, 'contains', childSummary(el.tagName === 'HTML' ? (el.ownerDocument.body ?? el) : el, resolver));
  return f;
}

function ancestry(el: Element, depth: number): string {
  const chain: string[] = [];
  let current = el.parentElement;
  while (current && chain.length < depth && current.tagName !== 'BODY' && current.tagName !== 'HTML') {
    const cls = Array.from(current.classList).filter((c) => !c.startsWith('ng-') && !c.startsWith('_ng')).slice(0, 2);
    chain.push(`${current.tagName.toLowerCase()}${cls.length ? `.${cls.join('.')}` : ''}`);
    current = current.parentElement;
  }
  return chain.reverse().join(' > ');
}

function extraFacts(el: Element, kind: TargetKind): Facts {
  const f: Facts = {};
  const r = el.getBoundingClientRect();
  if (r.width || r.height) put(f, 'box', `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  put(f, 'ancestors', ancestry(el, 5));
  put(f, 'computed', formatStyles(customStyles(el, EXTRA_STYLES)));
  if (kind !== 'section' && kind !== 'field' && !isMasked(el)) put(f, 'text', textOf(el, 240));
  return f;
}

export function collectFacts(el: Element, kind: TargetKind, resolver: ComponentResolver | null): FactsResult {
  let facts: Facts;
  switch (kind) {
    case 'action': facts = actionFacts(el); break;
    case 'field': facts = fieldFacts(el); break;
    case 'text': facts = textFacts(el); break;
    case 'media': facts = mediaFacts(el); break;
    case 'section': facts = sectionFacts(el, resolver); break;
    default: facts = containerFacts(el, resolver);
  }
  return { facts, extra: extraFacts(el, kind) };
}
