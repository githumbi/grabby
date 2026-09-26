export interface FiberNode {
  type: unknown;
  stateNode: unknown;
  return: FiberNode | null;
  child: FiberNode | null;
  sibling: FiberNode | null;
  memoizedProps: Record<string, unknown> | null;
}

const FIBER_KEYS = ['__reactFiber$', '__reactInternalInstance$'];

/** React attaches the fiber to the DOM node under a randomised key. */
export function getFiber(element: Element): FiberNode | null {
  const keys = Object.keys(element);
  for (const prefix of FIBER_KEYS) {
    const match = keys.find((k) => k.startsWith(prefix));
    if (match) return (element as unknown as Record<string, FiberNode>)[match] ?? null;
  }
  return null;
}

/** Unwraps memo, forwardRef and lazy to reach the component's display name. */
export function getComponentName(type: unknown, depth = 0): string | null {
  if (!type || depth > 4) return null;
  if (typeof type === 'string') return null;
  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || null;
  }
  if (typeof type === 'object') {
    const obj = type as { displayName?: string; render?: unknown; type?: unknown };
    if (obj.displayName) return obj.displayName;
    if (obj.render) return getComponentName(obj.render, depth + 1);
    if (obj.type) return getComponentName(obj.type, depth + 1);
  }
  return null;
}

/** The nearest DOM node a component fiber rendered, used to resolve its source. */
export function findHostElement(fiber: FiberNode, depth = 0): Element | null {
  if (depth > 8) return null;
  if (fiber.stateNode instanceof Element) return fiber.stateNode;

  let child = fiber.child;
  while (child) {
    const host = findHostElement(child, depth + 1);
    if (host) return host;
    child = child.sibling;
  }
  return null;
}
