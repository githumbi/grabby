// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { vueAdapter } from '../vue';
import { svelteAdapter } from '../svelte';
import { domAdapter } from '../dom';
import { composeAdapters } from '../index';
import { relativizePath } from '../types';

afterEach(() => {
  document.body.innerHTML = '';
});

function el(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe('vueAdapter', () => {
  it('names the owning Vue 3 component and walks its parents', () => {
    const root = el('<div class="card"><button>Buy</button></div>');
    const button = root.querySelector('button')!;
    const page = { type: { __name: 'PricingPage', __file: '/Users/me/app/src/pages/Pricing.vue' }, parent: null, subTree: { el: document.body } };
    const card = { type: { __name: 'PlanCard', __file: '/Users/me/app/src/components/PlanCard.vue' }, parent: page, subTree: { el: root } };
    Object.assign(root, { __vueParentComponent: card });
    Object.assign(button, { __vueParentComponent: card });

    const result = vueAdapter.resolveComponent(button)!;
    expect(result.name).toBe('PlanCard');
    expect(result.hostElement).toBe(root);
    expect(result.stack!.map((s) => s.name)).toEqual(['PlanCard', 'PricingPage']);
    expect(vueAdapter.resolveSource!(button)).toEqual({ filePath: 'src/components/PlanCard.vue', line: null, column: null });
  });

  it('skips Vue built-ins like Transition', () => {
    const node = el('<p>x</p>');
    const comp = { type: { name: 'Toast' }, parent: null };
    const transition = { type: { name: 'Transition' }, parent: comp };
    Object.assign(node, { __vueParentComponent: transition });
    expect(vueAdapter.resolveComponent(node)!.name).toBe('Toast');
  });

  it('reads Vue 2 instances off __vue__', () => {
    const node = el('<div><span>x</span></div>');
    Object.assign(node, { __vue__: { $options: { name: 'LegacyWidget', __file: 'src/LegacyWidget.vue' }, $parent: null, $el: node } });
    expect(vueAdapter.resolveComponent(node.querySelector('span')!)!.name).toBe('LegacyWidget');
    expect(vueAdapter.resolveSource!(node)!.filePath).toBe('src/LegacyWidget.vue');
  });

  it('returns null outside Vue', () => {
    expect(vueAdapter.resolveComponent(el('<div></div>'))).toBeNull();
  });
});

describe('svelteAdapter', () => {
  it('uses Svelte 5 meta (1-based lines, parent chain)', () => {
    const node = el('<button class="svelte-1x2y3z btn">Go</button>');
    Object.assign(node, {
      __svelte_meta: {
        loc: { file: 'src/lib/Button.svelte', line: 12, column: 2 },
        parent: { type: 'component', componentTag: 'Button', file: 'src/lib/Toolbar.svelte', line: 4, column: 0, parent: null },
      },
    });
    const comp = svelteAdapter.resolveComponent(node)!;
    expect(comp.name).toBe('Button');
    expect(comp.stack!.map((s) => s.name)).toEqual(['Button', 'Toolbar']);
    expect(comp.stack![1]).toMatchObject({ filePath: 'src/lib/Toolbar.svelte', line: 4 });
    expect(svelteAdapter.resolveSource!(node)).toEqual({ filePath: 'src/lib/Button.svelte', line: 12, column: 3 });
    expect(svelteAdapter.cleanClasses!(['svelte-1x2y3z', 's-XsEmFtvddWTw', 'btn'])).toEqual(['btn']);
  });

  it('converts Svelte 4 0-based lines', () => {
    const node = el('<p>x</p>');
    Object.assign(node, { __svelte_meta: { loc: { file: 'src/App.svelte', line: 9, column: 4, char: 120 } } });
    expect(svelteAdapter.resolveSource!(node)!.line).toBe(10);
  });
});

describe('domAdapter', () => {
  it('names components from data-component', () => {
    const node = el('<section data-component="Hero"><div data-component="CTA"><a id="t" href="#">Go</a></div></section>');
    const result = domAdapter.resolveComponent(node.querySelector('#t')!)!;
    expect(result.name).toBe('CTA');
    expect(result.stack!.map((s) => s.name)).toEqual(['CTA', 'Hero']);
  });
});

describe('composeAdapters', () => {
  it('reports the framework per element and prefers build-time stamps for source', () => {
    const root = el('<div data-grabby-loc="src/components/Card.vue:14:5"><b>x</b></div>');
    Object.assign(root, { __vueParentComponent: { type: { __name: 'Card', __file: '/abs/src/components/Card.vue' }, parent: null } });
    const composed = composeAdapters();
    expect(composed.frameworkFor(root)).toBe('Vue');
    expect(composed.resolveSource(root)).toEqual({ filePath: 'src/components/Card.vue', line: 14, column: 5 });
    expect(composed.frameworkFor(el('<p>plain</p>'))).toBe('HTML');
  });

  it('never lets a throwing adapter break resolution', () => {
    const composed = composeAdapters([
      { name: 'Broken', resolveComponent: () => { throw new Error('boom'); } },
      domAdapter,
    ]);
    const node = el('<div data-component="Safe"></div>');
    expect(composed.resolveComponent(node)!.name).toBe('Safe');
  });
});

describe('relativizePath', () => {
  it('trims absolute dev-server paths to the project folder', () => {
    expect(relativizePath('/Users/me/proj/src/App.vue')).toBe('src/App.vue');
    expect(relativizePath('C:\\work\\proj\\app\\page.tsx')).toBe('app/page.tsx');
    expect(relativizePath('src/already/relative.ts')).toBe('src/already/relative.ts');
  });
});

describe('relativizePath in monorepos', () => {
  it('keeps the package folder', () => {
    expect(relativizePath('/repo/packages/web/src/App.vue')).toBe('packages/web/src/App.vue');
    expect(relativizePath('/Users/me/app/src/x.vue')).toBe('src/x.vue');
  });
});
