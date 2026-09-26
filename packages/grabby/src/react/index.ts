import { init } from '../core';
import type { GrabbyOptions, GrabbyAPI } from '../core';
import { resolveComponent } from './resolvers/component-resolver';
import { resolveSource } from './resolvers/source-resolver';

export { resolveComponent } from './resolvers/component-resolver';
export { resolveSource, SOURCE_ATTRIBUTE } from './resolvers/source-resolver';
export { getFiber, getComponentName, findHostElement } from './fiber';
export type { FiberNode } from './fiber';

/**
 * Starts grabby against a React tree.
 *
 * Component names come from the React fiber; file paths come from the
 * `data-grabby-loc` stamps the babel plugin adds, so pair this with
 * `grabbyBabelPlugin()` in your bundler config.
 *
 * `devOnly` (default true) keys off `process.env.NODE_ENV`, which every
 * React bundler replaces, so production builds get a no-op API.
 */
export function initGrabby(options?: Partial<GrabbyOptions>): GrabbyAPI {
  const api = init(options);
  api.setComponentResolver(resolveComponent);
  api.setSourceResolver(resolveSource);
  return api;
}

export type { GrabbyOptions, GrabbyAPI };
