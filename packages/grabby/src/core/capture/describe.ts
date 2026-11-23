import type { GrabbyComment, GrabbyTarget, TargetKind } from '../types';
import { detectKind } from './kind';
import { isMasked, textOf, truncate } from './preview';
import { redact } from './redact';

/*
 * Plain-language names for elements, for reviewers who don't read HTML:
 * `Button "Choose Pro"` instead of `<button> .btn.btn-primary`. Only visible
 * labels, headings, alt text and placeholders are used, never what someone
 * typed into a field, and masked elements get no text at all.
 */

const MAX_NAME = 40;
const HEADING = /^h[1-6]$/;

function role(el: Element): string {
  return (el.getAttribute('role') ?? '').toLowerCase();
}

function hasBox(el: Element): boolean {
  try {
    const s = getComputedStyle(el);
    const bordered = s.borderStyle !== 'none' && parseFloat(s.borderWidth) > 0;
    const shadow = !!s.boxShadow && s.boxShadow !== 'none';
    return shadow || (bordered && parseFloat(s.borderRadius) > 0);
  } catch {
    return false;
  }
}

/** What kind of thing this is, in words a reviewer uses. */
export function nounFor(tag: string, kind: TargetKind, r = '', inputType = '', boxed = false, titled = false): string {
  switch (kind) {
    case 'action':
      if (r === 'tab') return 'Tab';
      if (r.startsWith('menuitem')) return 'Menu item';
      if (r === 'checkbox' || inputType === 'checkbox') return 'Checkbox';
      if (r === 'radio' || r === 'option' || inputType === 'radio') return 'Option';
      if (r === 'switch') return 'Switch';
      if (tag === 'a' || r === 'link') return 'Link';
      return 'Button';
    case 'field':
      if (tag === 'select' || r === 'combobox') return 'Dropdown';
      if (tag === 'textarea') return 'Text area';
      if (inputType === 'checkbox') return 'Checkbox';
      if (inputType === 'radio') return 'Option';
      if (inputType === 'range' || r === 'slider') return 'Slider';
      if (inputType === 'file') return 'File upload';
      if (inputType === 'search' || r === 'searchbox') return 'Search box';
      if (/^(date|datetime-local|month|week|time)$/.test(inputType)) return 'Date picker';
      return 'Text box';
    case 'media':
      if (tag === 'svg') return 'Icon';
      if (tag === 'video') return 'Video';
      if (tag === 'audio') return 'Audio player';
      if (tag === 'iframe') return 'Embedded content';
      if (tag === 'canvas') return 'Chart or drawing';
      return 'Image';
    case 'text':
      if (HEADING.test(tag) || r === 'heading') return 'Heading';
      if (tag === 'li') return 'List item';
      if (tag === 'label') return 'Label';
      if (tag === 'td' || tag === 'th') return 'Table cell';
      if (tag === 'blockquote' || tag === 'q') return 'Quote';
      if (tag === 'code' || tag === 'pre') return 'Code';
      return 'Text';
    case 'section':
      if (tag === 'html' || tag === 'body') return 'Whole page';
      if (tag === 'main' || r === 'main') return 'Main content';
      if (tag === 'header') return 'Page header';
      if (tag === 'footer') return 'Page footer';
      if (tag === 'nav') return 'Navigation menu';
      return 'Page section';
    default:
      if (tag === 'nav' || r === 'navigation' || r === 'menu' || r === 'menubar') return 'Menu';
      if (tag === 'header') return 'Header';
      if (tag === 'footer') return 'Footer';
      if (tag === 'aside') return 'Sidebar';
      if (tag === 'form' || r === 'form') return 'Form';
      if (tag === 'table' || r === 'table' || r === 'grid') return 'Table';
      if (tag === 'ul' || tag === 'ol' || r === 'list') return 'List';
      if (tag === 'dialog' || r === 'dialog' || r === 'alertdialog') return 'Pop-up';
      if (boxed) return 'Card';
      if (titled) return 'Section';
      return 'Area';
  }
}

function fieldName(el: Element): string {
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length) return textOf(labels[0], MAX_NAME);
  return redact(el.getAttribute('aria-label') ?? '') || redact(el.getAttribute('placeholder') ?? '');
}

function firstHeading(el: Element): Element | null {
  return el.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
}

function nameOf(el: Element, kind: TargetKind): string {
  // The whole page needs no name; its first heading would only mislead.
  if (isMasked(el) || el.tagName === 'BODY' || el.tagName === 'HTML') return '';
  const aria = redact(el.getAttribute('aria-label') ?? '');
  switch (kind) {
    case 'action':
      return aria || textOf(el, MAX_NAME) || redact(el.getAttribute('title') ?? '') || redact(el.querySelector('img[alt]')?.getAttribute('alt') ?? '');
    case 'field':
      return fieldName(el);
    case 'media':
      return redact(el.getAttribute('alt') ?? '') || aria || redact(el.getAttribute('title') ?? '');
    case 'text':
      return textOf(el, MAX_NAME);
    default: {
      const heading = firstHeading(el);
      return aria || (heading ? textOf(heading, MAX_NAME) : '');
    }
  }
}

function quoted(noun: string, name: string): string {
  const clean = truncate(name.replace(/\s+/g, ' ').trim(), MAX_NAME);
  return clean ? `${noun} “${clean}”` : noun;
}

/** `Button "Choose Pro"`, `Card "Your plan"`, `Text box "Email"`, `Whole page`. */
export function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  // SVG elements report a lowercase tagName, which detectKind's media check misses.
  const kind = tag === 'svg' ? 'media' : detectKind(el);
  const r = role(el);
  const inputType = tag === 'input' ? ((el as HTMLInputElement).type || '').toLowerCase() : '';
  const container = kind === 'container';
  const noun = nounFor(tag, kind, r, inputType, container && hasBox(el), container && !!firstHeading(el));
  return quoted(noun, nameOf(el, kind));
}

/** The same description for a comment that was already saved (no live element). */
export function describeTarget(target: GrabbyTarget): string {
  const facts = target.facts ?? {};
  const noun = nounFor(target.tag, target.kind, '', (facts.type ?? '').toLowerCase(), false, !!facts.heading);
  const name = facts.label || facts.heading || facts.text || facts.alt || '';
  return quoted(noun, name);
}

/** How many members a group description names before "and N more". */
const GROUP_NAMED = 3;

/** `3 elements: Button "Approve", Button "Reject", Text "Total"` from their labels. */
export function describeGroup(labels: string[]): string {
  const named = labels.slice(0, GROUP_NAMED).join(', ');
  const more = labels.length > GROUP_NAMED ? ` and ${labels.length - GROUP_NAMED} more` : '';
  return `${labels.length} elements: ${named}${more}`;
}

/** `Area in Card "Your plan"`, for a comment on a region. */
export function describeArea(around: string): string {
  return `Area in ${around}`;
}

/** What a saved comment is about, in plain words: one element, several, or an area. */
export function describeComment(c: Pick<GrabbyComment, 'target' | 'members' | 'area'>): string {
  if (c.members?.length) return describeGroup(c.members.map((m) => m.label));
  if (c.area) return describeArea(describeTarget(c.target));
  return describeTarget(c.target);
}
