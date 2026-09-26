import type { ComponentResolver, SourceResolver } from '../types';
import type { FrameworkAdapter } from './types';
import { angularAdapter } from './angular';
import { reactAdapter } from './react';
import { vueAdapter } from './vue';
import { svelteAdapter } from './svelte';
import { domAdapter } from './dom';
import { resolveSource as resolveStamp } from './stamp';

export type { FrameworkAdapter } from './types';
export { angularAdapter, reactAdapter, vueAdapter, svelteAdapter, domAdapter };
export { SOURCE_ATTRIBUTE } from './stamp';

/** Every built-in adapter, most specific first; the DOM adapter is the fallback. */
export const DEFAULT_ADAPTERS: readonly FrameworkAdapter[] = [
  angularAdapter,
  reactAdapter,
  vueAdapter,
  svelteAdapter,
  domAdapter,
];

export interface ComposedAdapters {
  resolveComponent: ComponentResolver;
  resolveSource: SourceResolver;
  /** Name of the framework that rendered this element, or "HTML". */
  frameworkFor(el: Element): string;
  cleanClasses(classes: string[]): string[];
}

/**
 * Tries adapters per element rather than picking one per page, so it copes
 * with an app that mounts late, and with micro-frontends mixing frameworks.
 */
export function composeAdapters(adapters: readonly FrameworkAdapter[] = DEFAULT_ADAPTERS): ComposedAdapters {
  function owner(el: Element) {
    for (const adapter of adapters) {
      try {
        const result = adapter.resolveComponent(el);
        if (result?.name) return { adapter, result };
      } catch { /* an adapter must never break the picker */ }
    }
    return null;
  }

  return {
    resolveComponent(el) {
      return owner(el)?.result ?? null;
    },

    resolveSource(el) {
      // A build-time stamp names the exact element's line, so it wins over
      // component-level locations whatever the framework.
      const stamped = resolveStamp(el);
      if (stamped.filePath) return stamped;
      const found = owner(el);
      const ordered = found ? [found.adapter, ...adapters.filter((a) => a !== found.adapter)] : adapters;
      for (const adapter of ordered) {
        try {
          const src = adapter.resolveSource?.(el);
          if (src?.filePath) return src;
        } catch { /* ignore */ }
      }
      return null;
    },

    frameworkFor(el) {
      return owner(el)?.adapter.name ?? 'HTML';
    },

    cleanClasses(classes) {
      return adapters.reduce((list, a) => (a.cleanClasses ? a.cleanClasses(list) : list), classes);
    },
  };
}
