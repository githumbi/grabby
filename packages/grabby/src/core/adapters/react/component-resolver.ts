import { getFiber, getComponentName, findHostElement, type FiberNode } from './fiber';

const MAX_STACK = 12;

/** Plumbing components that add noise to the stack without locating anything. */
const NOISE = new Set(['Slot', 'SlotClone', 'Presence', 'Primitive', 'Anonymous', 'Unknown']);

function isNoise(name: string): boolean {
  return NOISE.has(name) || name.startsWith('_') || name.includes('.');
}

export function resolveComponent(element: Element): {
  name: string | null;
  hostElement: Element | null;
  stack: Array<{ name: string; hostElement: Element | null }>;
} {
  const fiber = getFiber(element);
  if (!fiber) return { name: null, hostElement: null, stack: [] };

  const stack: Array<{ name: string; hostElement: Element | null }> = [];

  let current: FiberNode | null = fiber;
  while (current && stack.length < MAX_STACK) {
    const name = getComponentName(current.type);
    // memo/forwardRef wrappers repeat the same name on adjacent fibers
    if (name && !isNoise(name) && stack[stack.length - 1]?.name !== name) {
      stack.push({ name, hostElement: findHostElement(current) });
    }
    current = current.return;
  }

  return {
    name: stack[0]?.name ?? null,
    hostElement: stack[0]?.hostElement ?? null,
    stack,
  };
}
