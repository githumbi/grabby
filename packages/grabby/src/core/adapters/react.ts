import type { FrameworkAdapter, ComponentResult } from './types';
import { baseName } from './types';
import { resolveComponent } from './react/component-resolver';
import { getFiber, type FiberNode } from './react/fiber';
import { ownStamp } from './stamp';

/**
 * Development fibers carry debug fields (`_debugOwner` and friends); the
 * production build leaves them out. In production, function names are
 * minified, so the fiber's names can't be trusted.
 */
function isProductionFiber(fiber: FiberNode): boolean {
  return !('_debugOwner' in fiber) && !('_debugSource' in fiber) && !('_debugStack' in fiber);
}

/**
 * Production names from build-time stamps instead of the minified function
 * names: the component written at the host element's stamp (`<PlanCard …>`
 * records "PlanCard"), else the name of the file the host element was
 * written in. Frames with neither are dropped rather than shown as "vu".
 */
function nameFromStamps(result: ReturnType<typeof resolveComponent>): ComponentResult | null {
  const stack: NonNullable<ComponentResult['stack']> = [];
  for (const entry of result.stack) {
    const stamp = ownStamp(entry.hostElement);
    const name = stamp?.name ?? (stamp ? baseName(stamp.file) : null);
    if (name && stack[stack.length - 1]?.name !== name) stack.push({ name, hostElement: entry.hostElement });
  }
  return stack[0] ? { name: stack[0].name, hostElement: stack[0].hostElement, stack } : null;
}

/** Names come from the React fiber; locations come from build-time stamps. */
export const reactAdapter: FrameworkAdapter = {
  name: 'React',
  resolveComponent: (el) => {
    const result = resolveComponent(el);
    if (!result.name) return null;
    const fiber = getFiber(el);
    return fiber && isProductionFiber(fiber) ? nameFromStamps(result) ?? { name: null, hostElement: null, stack: [] } : result;
  },
};
