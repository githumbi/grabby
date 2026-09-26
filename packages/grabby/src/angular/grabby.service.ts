import { init, createNoopApi } from '../core';
import type { GrabbyAPI, GrabbyOptions, Plugin } from '../core';
import { resolveComponent } from './resolvers/component-resolver';
import { resolveSource } from './resolvers/source-resolver';

declare const ngDevMode: boolean | undefined;

let instance: GrabbyAPI | null = null;

/**
 * Initialize grabby. Registers Angular-specific component and source
 * resolvers, then returns the API handle. Idempotent — subsequent calls
 * return the same instance.
 */
export function initGrabby(options?: Partial<GrabbyOptions>): GrabbyAPI {
  if (instance) return instance;

  // No-op in production
  if (options?.devOnly !== false && typeof ngDevMode !== 'undefined' && !ngDevMode) {
    instance = createNoopApi();
    return instance;
  }

  instance = init(options);
  instance.setComponentResolver((el) => resolveComponent(el));
  instance.setSourceResolver((el) => resolveSource(el));

  return instance;
}

export function getGrabbyApi(): GrabbyAPI | null {
  return instance;
}

export function registerGrabbyPlugin(plugin: Plugin): void {
  instance?.registerPlugin(plugin);
}

export function disposeGrabby(): void {
  instance?.dispose();
  instance = null;
}

