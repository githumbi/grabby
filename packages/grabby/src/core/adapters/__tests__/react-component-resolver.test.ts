// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { resolveComponent } from '../react/component-resolver';
import { getComponentName } from '../react/fiber';

interface FakeFiber {
  type: unknown;
  stateNode: unknown;
  return: FakeFiber | null;
  child: FakeFiber | null;
  sibling: FakeFiber | null;
  memoizedProps: null;
  _debugOwner?: null;
}

/** A development-build fiber (it has React's debug fields). */
function fiber(type: unknown, stateNode: unknown = null): FakeFiber {
  return { type, stateNode, return: null, child: null, sibling: null, memoizedProps: null, _debugOwner: null };
}

/**
 * Links a leaf-first chain the way React does — `return` points at the parent,
 * `child` back down — and hangs the leaf off the element.
 */
function attach(element: Element, chain: FakeFiber[]): void {
  chain.forEach((f, i) => {
    f.return = chain[i + 1] ?? null;
    f.child = chain[i - 1] ?? null;
  });
  (element as unknown as Record<string, FakeFiber>)['__reactFiber$abc123'] = chain[0];
}

describe('resolveComponent', () => {
  it('returns empty when the element has no fiber', () => {
    const el = document.createElement('div');
    expect(resolveComponent(el)).toEqual({ name: null, hostElement: null, stack: [] });
  });

  it('names the nearest component and walks the ancestor chain', () => {
    const el = document.createElement('button');
    function StatCard() {}
    function Dashboard() {}
    attach(el, [fiber('button', el), fiber(StatCard), fiber(Dashboard)]);

    const result = resolveComponent(el);
    expect(result.name).toBe('StatCard');
    expect(result.stack.map((s) => s.name)).toEqual(['StatCard', 'Dashboard']);
  });

  it('resolves the host element for each component in the stack', () => {
    const el = document.createElement('button');
    function StatCard() {}
    attach(el, [fiber('button', el), fiber(StatCard)]);

    expect(resolveComponent(el).stack[0].hostElement).toBe(el);
  });

  it('skips plumbing components', () => {
    const el = document.createElement('span');
    function Slot() {}
    function Card() {}
    attach(el, [fiber('span', el), fiber(Slot), fiber(Card)]);

    expect(resolveComponent(el).stack.map((s) => s.name)).toEqual(['Card']);
  });

  it('collapses the duplicate name a memo wrapper adds', () => {
    const el = document.createElement('div');
    function Chart() {}
    const memo = { $$typeof: Symbol.for('react.memo'), type: Chart };
    attach(el, [fiber('div', el), fiber(memo), fiber(Chart)]);

    expect(resolveComponent(el).stack.map((s) => s.name)).toEqual(['Chart']);
  });

  it('caps the stack depth', () => {
    const el = document.createElement('div');
    const chain = [fiber('div', el)];
    for (let i = 0; i < 40; i++) {
      chain.push(fiber({ displayName: `Level${i}` }));
    }
    attach(el, chain);

    expect(resolveComponent(el).stack.length).toBeLessThanOrEqual(12);
  });
});

describe('getComponentName', () => {
  it('ignores host element types', () => {
    expect(getComponentName('div')).toBeNull();
  });

  it('prefers displayName over the function name', () => {
    function Inner() {}
    (Inner as { displayName?: string }).displayName = 'Outer';
    expect(getComponentName(Inner)).toBe('Outer');
  });

  it('unwraps forwardRef', () => {
    function Button() {}
    expect(getComponentName({ render: Button })).toBe('Button');
  });

  it('unwraps memo', () => {
    function Chart() {}
    expect(getComponentName({ type: Chart })).toBe('Chart');
  });

  it('stops unwrapping rather than recursing forever', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.type = cyclic;
    expect(getComponentName(cyclic)).toBeNull();
  });
});

describe('reactAdapter in production builds', () => {
  // Production fibers have no debug fields, and function names are minified.
  function prodFiber(type: unknown, stateNode: unknown = null) {
    return { type, stateNode, return: null as unknown, child: null as unknown, sibling: null, memoizedProps: null };
  }

  it('names components from build stamps instead of minified function names', async () => {
    const { reactAdapter } = await import('../react');
    document.body.innerHTML = '<section data-grabby-loc="src/pages/Pricing.tsx:12:5"><table><thead><tr><th data-grabby-loc="src/pages/Pricing.tsx:40:9:TableHeaderCell">Plan</th></tr></thead></table></section>';
    const th = document.querySelector('th')!;
    const section = document.querySelector('section')!;
    function vu() {}
    function M() {}
    const chain = [prodFiber('th', th), prodFiber(vu), prodFiber('section', section), prodFiber(M)];
    chain.forEach((f, i) => { f.return = chain[i + 1] ?? null; f.child = chain[i - 1] ?? null; });
    (chain[3] as { child: unknown }).child = chain[2];
    Object.assign(th, { '__reactFiber$x': chain[0] });

    const result = reactAdapter.resolveComponent(th)!;
    expect(result.name).toBe('TableHeaderCell');
    expect(result.stack!.map((s) => s.name)).toEqual(['TableHeaderCell', 'Pricing']);
    document.body.innerHTML = '';
  });
});
