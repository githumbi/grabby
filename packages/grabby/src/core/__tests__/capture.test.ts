// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { detectKind, promoteTarget } from '../capture/kind';
import { buildPreview } from '../capture/preview';
import { redact, sanitizeRoute, sanitizeUrl } from '../capture/redact';
import { captureTarget } from '../capture/capture';
import { formatExport, estimateTokens } from '../capture/export';
import { shortColor } from '../capture/styles';
import { makeComment, makeTarget } from './fixtures';
import type { ComponentResolver, SourceResolver } from '../types';

function mount(html: string): void {
  document.body.innerHTML = html;
}

function $(sel: string): Element {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`no ${sel}`);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('detectKind', () => {
  it.each([
    ['<button id="t">Go</button>', 'action'],
    ['<a id="t" href="/x">Go</a>', 'action'],
    ['<div id="t" role="button">Go</div>', 'action'],
    ['<input id="t" type="submit">', 'action'],
    ['<input id="t" type="text">', 'field'],
    ['<select id="t"></select>', 'field'],
    ['<h2 id="t">Title</h2>', 'text'],
    ['<div id="t">just text</div>', 'text'],
    ['<img id="t" src="a.png">', 'media'],
    ['<div id="t"><p>a</p><p>b</p></div>', 'container'],
    ['<main id="t"><p>a</p></main>', 'section'],
  ])('%s → %s', (html, kind) => {
    mount(html);
    expect(detectKind($('#t'))).toBe(kind);
  });
});

describe('promoteTarget', () => {
  it('resolves an icon inside a button to the button', () => {
    mount('<button id="b"><span><svg id="i"></svg></span> Save</button>');
    expect(promoteTarget($('#i'))).toBe($('#b'));
  });

  it('leaves a plain element alone', () => {
    mount('<div><p id="p">hi</p></div>');
    expect(promoteTarget($('#p'))).toBe($('#p'));
  });
});

describe('buildPreview', () => {
  it('keeps the opening tag short and collapses many children', () => {
    mount(`<ul id="t" class="${'x '.repeat(80)}">${'<li>item</li>'.repeat(20)}</ul>`);
    const preview = buildPreview($('#t'));
    expect(preview).toMatch(/^<ul id="t" class="[^"]{1,60}">\(20 elements\)<\/ul>$/);
  });

  it('drops framework noise, inline styles, handlers and values', () => {
    mount('<input id="t" _ngcontent-abc="" data-v-123 style="color:red" onclick="x()" value="secret" name="q">');
    const preview = buildPreview($('#t'));
    expect(preview).toBe('<input id="t" name="q">');
  });

  it('never exceeds 300 characters', () => {
    mount(`<p id="t">${'word '.repeat(400)}</p>`);
    expect(buildPreview($('#t')).length).toBeLessThanOrEqual(300);
  });

  it('respects data-grabby-mask', () => {
    mount('<div id="t" data-grabby-mask>Account 1234 5678 9012</div>');
    expect(buildPreview($('#t'))).toContain('[masked]');
    expect(buildPreview($('#t'))).not.toContain('1234');
  });
});

describe('redact', () => {
  it('removes emails, JWTs, long numbers and bearer tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const out = redact(`mail jane@acme.io card 4111 1111 1111 1111 ${jwt} Bearer abcdef123456789`);
    expect(out).toBe('mail [email] card [number] [token] Bearer [token]');
  });

  it('keeps ordinary text', () => {
    expect(redact('Save changes (3 items)')).toBe('Save changes (3 items)');
  });

  it('strips query strings from routes unless allowlisted', () => {
    expect(sanitizeRoute({ pathname: '/reset', search: '?token=abc&tab=2', hash: '' })).toBe('/reset');
    expect(sanitizeRoute({ pathname: '/p', search: '?token=abc&tab=2', hash: '' }, ['tab'])).toBe('/p?tab=2');
    expect(sanitizeRoute({ pathname: '/', search: '', hash: '#/settings' })).toBe('/#/settings');
    expect(sanitizeRoute({ pathname: '/', search: '', hash: '#access_token=xyz' })).toBe('/');
  });

  it('reduces URLs to their path', () => {
    expect(sanitizeUrl('/docs?key=1#frag', 'https://app.test/')).toBe('/docs');
    expect(sanitizeUrl('https://cdn.test/img/a.png?sig=1', 'https://app.test/')).toBe('cdn.test/img/a.png');
    expect(sanitizeUrl('javascript:alert(1)', 'https://app.test/')).toBe('javascript:…');
  });
});

describe('shortColor', () => {
  it('shortens rgb() to hex', () => {
    expect(shortColor('rgb(37, 99, 235)')).toBe('#2563eb');
    expect(shortColor('rgb(255, 255, 255)')).toBe('#fff');
    expect(shortColor('rgba(0, 0, 0, 0)')).toBe('transparent');
    expect(shortColor('rgba(0, 0, 0, 0.5)')).toBe('#000000 50%');
  });
});

describe('captureTarget', () => {
  const componentResolver: ComponentResolver = (el) => ({
    name: 'PricingCard',
    hostElement: el.closest('section'),
    stack: [
      { name: 'PricingCard', hostElement: el.closest('section') },
      { name: 'LibButton', hostElement: el },
      { name: 'PricingPage', hostElement: document.body },
    ],
  });
  const sourceResolver: SourceResolver = (el) => {
    if (el.tagName === 'SECTION') return { filePath: 'src/pricing/card.tsx', line: 8, column: 2 };
    if (el.tagName === 'BODY') return { filePath: 'src/pricing/page.tsx', line: 20, column: 1 };
    if (el.tagName === 'BUTTON') return { filePath: 'node_modules/ui-lib/button.js', line: 1, column: 1 };
    return null;
  };

  it('keeps app frames, skips library frames, and falls back past a library source', () => {
    mount('<section><button id="t" class="btn">Buy</button></section>');
    const t = captureTarget($('#t'), { componentResolver, sourceResolver });
    expect(t.kind).toBe('action');
    expect(t.source).toEqual({ file: 'src/pricing/card.tsx', line: 8, column: null });
    expect(t.stack.map((f) => f.name)).toEqual(['PricingCard', 'PricingPage']);
    expect(t.facts.label).toBe('Buy');
    expect(t.preview).toBe('<button id="t" class="btn">Buy</button>');
  });

  it('works with no resolvers at all (plain HTML)', () => {
    mount('<div><h1 id="t">Hello</h1></div>');
    const t = captureTarget($('#t'), { componentResolver: null, sourceResolver: null });
    expect(t.source).toBeNull();
    expect(t.component).toBeNull();
    expect(t.selector).toBe('#t');
    expect(t.facts.text).toBe('Hello');
  });
});

describe('formatExport', () => {
  it('groups by file, says page context once, and omits selectors when a file is known', () => {
    const a = makeComment({ comment: 'Bigger', target: makeTarget({ source: { file: 'src/a.tsx', line: 3, column: 1 } }) });
    const b = makeComment({ comment: 'Red', target: makeTarget({ source: { file: 'src/a.tsx', line: 9, column: 1 } }) });
    const c = makeComment({ comment: 'Typo', target: makeTarget({ source: null, component: null, selector: '#hero > p' }) });
    const text = formatExport([a, b, c], 'standard', { origin: 'localhost:5173', now: new Date('2026-09-26') });

    expect(text.split('\n').slice(0, 2)).toEqual([
      '# UI feedback · 3 comments',
      'localhost:5173 · React · page / · 1280×800 · 2026-09-26',
    ]);
    expect(text).toContain('## src/a.tsx · SaveButton');
    expect(text).toContain('## Elements without source info');
    expect(text.match(/selector:/g)).toHaveLength(1);
    expect(text).toContain('selector: `#hero > p`');
    expect(text).not.toContain('by Anonymous');
  });

  it('names authors only when more than one person commented', () => {
    const jane = makeComment({ author: { name: 'Jane', anonymous: false, sessionId: 's1' } });
    const anon = makeComment({ author: { name: null, anonymous: true, sessionId: 'abcd9999' } });
    const text = formatExport([jane, anon], 'standard');
    expect(text).toContain('From: Jane, Anonymous abcd');
    expect(text).toContain('by Jane');
    expect(text).toContain('by Anonymous abcd');
  });

  it('compact is one line per comment', () => {
    const text = formatExport([makeComment({ comment: 'Fix spacing' })], 'compact');
    expect(text.split('\n')).toHaveLength(4);
    expect(text).toContain('1. src/app/save-button.tsx:12 SaveButton <button> — Fix spacing');
  });

  it('keeps 20 mixed comments well inside a small context budget', () => {
    const kinds = ['action', 'field', 'text', 'media', 'container'] as const;
    const list = Array.from({ length: 20 }, (_, i) => makeComment({
      comment: `Please adjust the spacing and colour of this element, it looks off on mobile (${i})`,
      target: makeTarget({
        kind: kinds[i % kinds.length],
        source: { file: `src/components/feature-${i % 6}/widget.component.tsx`, line: 10 + i, column: 4 },
        preview: '<div class="card grid gap-4 rounded-xl border p-6 shadow-sm">(4 elements)</div>',
        facts: { heading: 'Pricing plans', contains: 'heading, 3× PlanCard, button', size: '960×420', layout: 'display grid · gap 24px · columns 3 · padding 24px' },
      }),
    }));
    const standard = formatExport(list, 'standard');
    expect(estimateTokens(standard)).toBeLessThan(6000);
    expect(estimateTokens(formatExport(list, 'compact'))).toBeLessThan(estimateTokens(standard) / 2);
  });
});
