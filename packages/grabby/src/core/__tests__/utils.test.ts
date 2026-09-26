// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { escapeHtml, cleanAngularAttrs } from '../utils';

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('passes through double quotes (not special in text nodes)', () => {
    // innerHTML only escapes <, >, & in text content — not quotes
    expect(escapeHtml('"hello"')).toBe('"hello"');
  });

  it('passes through single quotes (not special in text nodes)', () => {
    expect(escapeHtml("it's")).toBe("it's");
  });

  it('escapes multiple special characters together', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      '&lt;a href="x"&gt;&amp;&lt;/a&gt;',
    );
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
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
