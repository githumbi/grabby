import { init } from '../core';
import type { GrabbyOptions, GrabbyAPI } from '../core';

export { reactAdapter, SOURCE_ATTRIBUTE } from '../core';
export { resolveComponent } from '../core/adapters/react/component-resolver';
export { resolveSource } from '../core/adapters/stamp';
export { getFiber, getComponentName, findHostElement } from '../core/adapters/react/fiber';
export type { FiberNode } from '../core/adapters/react/fiber';

/**
 * Starts Grabby in a React app. Component names come from the React fiber;
 * file:line comes from the stamps `@githumbi/grabby/plugin` adds at build time.
 *
 * Same as `initGrabby` from the package root, which detects React on its own;
 * kept so existing `@githumbi/grabby/react` imports keep working.
 */
export function initGrabby(options?: Partial<GrabbyOptions>): GrabbyAPI {
  return init(options);
}

export type { GrabbyOptions, GrabbyAPI };
