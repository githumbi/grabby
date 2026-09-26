// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { resolveSource, SOURCE_ATTRIBUTE } from '../stamp';

describe('resolveSource', () => {
  it('reads a file:line:column stamp off the element', () => {
    const el = document.createElement('div');
    el.setAttribute(SOURCE_ATTRIBUTE, 'src/pages/Dashboard.tsx:42:7');

    expect(resolveSource(el)).toEqual({
      filePath: 'src/pages/Dashboard.tsx',
      line: 42,
      column: 7,
    });
  });

  it('walks up to the nearest stamped ancestor', () => {
    const parent = document.createElement('section');
    parent.setAttribute(SOURCE_ATTRIBUTE, 'src/App.tsx:10:3');
    const child = document.createElement('span');
    parent.appendChild(child);

    expect(resolveSource(child).filePath).toBe('src/App.tsx');
    expect(resolveSource(child).line).toBe(10);
  });

  it('prefers the closest stamp', () => {
    const outer = document.createElement('div');
    outer.setAttribute(SOURCE_ATTRIBUTE, 'src/App.tsx:1:1');
    const inner = document.createElement('div');
    inner.setAttribute(SOURCE_ATTRIBUTE, 'src/Card.tsx:5:2');
    outer.appendChild(inner);

    expect(resolveSource(inner).filePath).toBe('src/Card.tsx');
  });

  it('returns nulls when nothing is stamped', () => {
    const el = document.createElement('div');
    expect(resolveSource(el)).toEqual({ filePath: null, line: null, column: null });
  });

  it('keeps a malformed stamp as the file path', () => {
    const el = document.createElement('div');
    el.setAttribute(SOURCE_ATTRIBUTE, 'src/App.tsx');
    expect(resolveSource(el)).toEqual({ filePath: 'src/App.tsx', line: null, column: null });
  });

  it('handles a windows-style path containing colons', () => {
    const el = document.createElement('div');
    el.setAttribute(SOURCE_ATTRIBUTE, 'C:/app/src/App.tsx:8:4');
    expect(resolveSource(el)).toEqual({ filePath: 'C:/app/src/App.tsx', line: 8, column: 4 });
  });
});

describe('ownStamp', () => {
  it('reads the optional component name', async () => {
    const { ownStamp } = await import('../stamp');
    const el = document.createElement('th');
    el.setAttribute('data-grabby-loc', 'src/pages/A.tsx:4:9:Table.HeaderCell');
    expect(ownStamp(el)).toEqual({ file: 'src/pages/A.tsx', line: 4, column: 9, name: 'Table.HeaderCell' });
    el.setAttribute('data-grabby-loc', 'src/pages/A.tsx:4:9');
    expect(ownStamp(el)?.name).toBeNull();
  });
});
