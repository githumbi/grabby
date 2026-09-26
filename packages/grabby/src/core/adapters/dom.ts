import type { FrameworkAdapter } from './types';

/**
 * Plain HTML, or any stack Grabby has no adapter for: a `data-component`
 * attribute names the component that owns an element.
 */
export const domAdapter: FrameworkAdapter = {
  name: 'HTML',
  resolveComponent: (el) => {
    const host = el.closest('[data-component]');
    const name = host?.getAttribute('data-component');
    if (!host || !name) return null;
    const stack: Array<{ name: string; hostElement: Element | null }> = [];
    for (let h: Element | null = host; h; h = h.parentElement?.closest('[data-component]') ?? null) {
      const n = h.getAttribute('data-component');
      if (n) stack.push({ name: n, hostElement: h });
      if (stack.length >= 12) break;
    }
    return { name, hostElement: host, stack };
  },
};
