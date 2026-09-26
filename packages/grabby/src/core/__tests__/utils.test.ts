// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanAngularAttrs, cssEscape, safeQuery, buildUniqueSelector } from '../utils';

describe('cssEscape', () => {
  it('escapes Tailwind-style class characters', () => {
    expect(cssEscape('md:flex')).toBe('md\\:flex');
    expect(cssEscape('w-1/2')).toBe('w-1\\/2');
  });

  it('escapes a leading digit', () => {
    expect(cssEscape('1abc')).toBe('\\31 abc');
  });
});

describe('safeQuery', () => {
  it('returns null for a selector that would throw', () => {
    expect(safeQuery('div.md:flex')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(safeQuery('')).toBeNull();
    expect(safeQuery(null)).toBeNull();
  });
});

describe('buildUniqueSelector', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('prefers a test id', () => {
    document.body.innerHTML = '<div><button data-testid="save" id="x">Save</button></div>';
    const el = document.querySelector('button')!;
    expect(buildUniqueSelector(el)).toBe('[data-testid="save"]');
  });

  it('uses an escaped id when there is no test id', () => {
    document.body.innerHTML = '<div id="1st:item"></div>';
    const el = document.body.firstElementChild!;
    const sel = buildUniqueSelector(el);
    expect(document.querySelector(sel)).toBe(el);
  });

  it('builds a unique path for elements with Tailwind classes and no id', () => {
    document.body.innerHTML = '<ul><li class="md:flex">a</li><li class="md:flex w-1/2">b</li></ul>';
    const el = document.querySelectorAll('li')[1];
    const sel = buildUniqueSelector(el);
    expect(document.querySelectorAll(sel)).toHaveLength(1);
    expect(document.querySelector(sel)).toBe(el);
  });
});

describe('cleanAngularAttrs', () => {
  it('removes _nghost attributes with values', () => {
    const html = '<div _nghost-abc-123=""></div>';
    expect(cleanAngularAttrs(html)).toBe('<div></div>');
  });

  it('removes _ngcontent attributes with values', () => {
    const html = '<span _ngcontent-xyz-456=""></span>';
    expect(cleanAngularAttrs(html)).toBe('<span></span>');
  });

  it('removes _nghost attributes without values', () => {
    const html = '<div _nghost-abc-123></div>';
    expect(cleanAngularAttrs(html)).toBe('<div></div>');
  });

  it('removes _ngcontent attributes without values', () => {
    const html = '<span _ngcontent-xyz-456></span>';
    expect(cleanAngularAttrs(html)).toBe('<span></span>');
  });

  it('removes multiple Angular attributes from one tag', () => {
    const html = '<div _nghost-abc-123="" _ngcontent-xyz-456="">text</div>';
    expect(cleanAngularAttrs(html)).toBe('<div>text</div>');
  });

  it('removes Angular attributes from nested elements', () => {
    const html =
      '<div _nghost-a-1=""><span _ngcontent-b-2="">hi</span></div>';
    expect(cleanAngularAttrs(html)).toBe('<div><span>hi</span></div>');
  });

  it('preserves non-Angular attributes', () => {
    const html = '<div class="foo" id="bar" _nghost-abc-123="">text</div>';
    expect(cleanAngularAttrs(html)).toBe(
      '<div class="foo" id="bar">text</div>',
    );
  });

  it('returns unchanged HTML when no Angular attributes present', () => {
    const html = '<div class="test">hello</div>';
    expect(cleanAngularAttrs(html)).toBe(html);
  });

  it('handles empty string', () => {
    expect(cleanAngularAttrs('')).toBe('');
  });
});
