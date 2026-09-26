import { init, createNoopApi } from '../core';
import type { GrabbyAPI, GrabbyOptions, Plugin } from '../core';

declare const ngDevMode: boolean | undefined;

let instance: GrabbyAPI | null = null;

/**
 * Initialize Grabby. The Angular adapter is one of the defaults, so this only
 * adds a singleton on top of `init`. Idempotent: later calls return the same
 * instance.
 */
export function initGrabby(options?: Partial<GrabbyOptions>): GrabbyAPI {
  if (instance) return instance;

  // No-op in production
  if (options?.devOnly !== false && typeof ngDevMode !== 'undefined' && !ngDevMode) {
    instance = createNoopApi();
    return instance;
  }

  instance = init(options);

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

