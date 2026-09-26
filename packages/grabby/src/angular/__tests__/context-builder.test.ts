// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentStackEntry } from '../../core';

vi.mock('../resolvers/component-resolver', () => ({
  resolveComponent: vi.fn(),
}));

vi.mock('../resolvers/source-resolver', () => ({
  resolveSource: vi.fn(),
  resolveSourceForComponent: vi.fn(),
}));

import { buildContext } from '../resolvers/context-builder';
import { resolveComponent } from '../resolvers/component-resolver';
import { resolveSource, resolveSourceForComponent } from '../resolvers/source-resolver';

const mockedResolveComponent = vi.mocked(resolveComponent);
const mockedResolveSource = vi.mocked(resolveSource);
const mockedResolveSourceForComponent = vi.mocked(resolveSourceForComponent);

beforeEach(() => {
  vi.clearAllMocks();

  mockedResolveComponent.mockReturnValue({
    name: null,
    hostElement: null,
    stack: [],
  });

  mockedResolveSource.mockReturnValue({
    filePath: null,
    line: null,
    column: null,
  });

  mockedResolveSourceForComponent.mockReturnValue({
    filePath: null,
    line: null,
    column: null,
  });
});

describe('buildContext', () => {
  it('produces correct ElementContext shape', () => {
    const el = document.createElement('div');
    el.innerHTML = 'hello';

    const ctx = buildContext(el);

    expect(ctx).toEqual(
      expect.objectContaining({
        element: el,
        html: expect.any(String),
        componentName: null,
        filePath: null,
        line: null,
        column: null,
        componentStack: [],
        selector: expect.any(String),
        cssClasses: expect.any(Array),
      }),
    );
  });

  it('includes component name from resolver', () => {
    mockedResolveComponent.mockReturnValue({
      name: 'MyComponent',
      hostElement: null,
      stack: [],
    });

    const el = document.createElement('div');
    const ctx = buildContext(el);

    expect(ctx.componentName).toBe('MyComponent');
  });

  it('includes file path from source resolver', () => {
    mockedResolveSource.mockReturnValue({
      filePath: 'src/app/app.component.ts',
      line: 42,
      column: 3,
    });

    const el = document.createElement('div');
    const ctx = buildContext(el);

    expect(ctx.filePath).toBe('src/app/app.component.ts');
    expect(ctx.line).toBe(42);
    expect(ctx.column).toBe(3);
  });

  it('builds component stack from resolver stack', () => {
    mockedResolveComponent.mockReturnValue({
      name: 'Child',
      hostElement: null,
      stack: [
        { name: 'Child', hostElement: null },
        { name: 'Parent', hostElement: null },
      ],
    });
    mockedResolveSourceForComponent
      .mockReturnValueOnce({ filePath: 'child.ts', line: 5, column: null })
      .mockReturnValueOnce({ filePath: 'parent.ts', line: 20, column: null });

    const el = document.createElement('div');
    const ctx = buildContext(el);

    expect(ctx.componentStack).toHaveLength(2);
    expect(ctx.componentStack[0]).toEqual({
      name: 'Child',
      filePath: 'child.ts',
      line: 5,
      column: null,
    });
    expect(ctx.componentStack[1]).toEqual({
      name: 'Parent',
      filePath: 'parent.ts',
      line: 20,
      column: null,
    });
  });

  it('truncates long HTML with truncation marker', () => {
    const el = document.createElement('div');
    // Create content longer than MAX_HTML_LENGTH (2000)
    el.textContent = 'x'.repeat(2100);

    const ctx = buildContext(el);

    expect(ctx.html.length).toBeLessThanOrEqual(2000 + '<!-- truncated -->'.length);
    expect(ctx.html).toContain('<!-- truncated -->');
  });

  it('does not truncate short HTML', () => {
    const el = document.createElement('div');
    el.textContent = 'short';

    const ctx = buildContext(el);

    expect(ctx.html).not.toContain('<!-- truncated -->');
    expect(ctx.html).toContain('short');
  });

  it('generates CSS selector for element', () => {
    const el = document.createElement('div');
    el.id = 'myid';
    document.body.appendChild(el);

    const ctx = buildContext(el);
    expect(ctx.selector).toContain('div#myid');

    document.body.removeChild(el);
  });

  it('generates selector with classes', () => {
    const el = document.createElement('span');
    el.className = 'foo bar';
    document.body.appendChild(el);

    const ctx = buildContext(el);
    expect(ctx.selector).toContain('span.foo.bar');

    document.body.removeChild(el);
  });

  it('generates selector with nth-of-type for siblings', () => {
    const parent = document.createElement('div');
    const child1 = document.createElement('span');
    const child2 = document.createElement('span');
    parent.appendChild(child1);
    parent.appendChild(child2);
    document.body.appendChild(parent);

    const ctx = buildContext(child2);
    expect(ctx.selector).toContain('nth-of-type(2)');

    document.body.removeChild(parent);
  });

  it('filters out Angular CSS classes', () => {
    const el = document.createElement('div');
    el.classList.add('my-class', 'ng-star-inserted', '_ngcontent-abc', 'real-class');

    const ctx = buildContext(el);

    expect(ctx.cssClasses).toContain('my-class');
    expect(ctx.cssClasses).toContain('real-class');
    expect(ctx.cssClasses).not.toContain('ng-star-inserted');
    expect(ctx.cssClasses).not.toContain('_ngcontent-abc');
  });

  it('handles element with no classes', () => {
    const el = document.createElement('div');
    const ctx = buildContext(el);
    expect(ctx.cssClasses).toEqual([]);
  });

  it('stops selector at element with id', () => {
    const grandparent = document.createElement('section');
    const parent = document.createElement('div');
    parent.id = 'stop-here';
    const child = document.createElement('span');
    grandparent.appendChild(parent);
    parent.appendChild(child);
    document.body.appendChild(grandparent);

    const ctx = buildContext(child);
    // The selector should start from div#stop-here because id terminates the walk
    expect(ctx.selector).toContain('div#stop-here');
    expect(ctx.selector).toContain('span');

    document.body.removeChild(grandparent);
  });
});
