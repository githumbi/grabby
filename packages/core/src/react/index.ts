import { init } from '../core';
import type { AngularGrabOptions, AngularGrabAPI } from '../core';
import { resolveComponent } from './resolvers/component-resolver';
import { resolveSource } from './resolvers/source-resolver';

export { resolveComponent } from './resolvers/component-resolver';
export { resolveSource, SOURCE_ATTRIBUTE } from './resolvers/source-resolver';
export { getFiber, getComponentName, findHostElement } from './fiber';
export type { FiberNode } from './fiber';

/**
 * Starts angular-grab against a React tree.
 *
 * Component names come from the React fiber; file paths come from the
 * `data-ag-loc` stamps the babel plugin adds, so pair this with
 * `reactGrabBabelPlugin()` in your bundler config.
 *
 * `devOnly` defaults to false here: the Angular dev flag it keys off doesn't
 * exist in a React app. Gate it yourself with `import.meta.env.DEV` if you
 * only want it while developing.
 */
export function initReactGrab(options?: Partial<AngularGrabOptions>): AngularGrabAPI {
  const api = init({ devOnly: false, ...options });
  api.setComponentResolver(resolveComponent);
  api.setSourceResolver(resolveSource);
  return api;
}

export type { AngularGrabOptions, AngularGrabAPI };
