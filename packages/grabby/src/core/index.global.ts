import { init } from './grab';

// Only initialize in development. The devOnly option (default: true) is checked,
// but the IIFE bundle should also guard against running in production builds
// where Angular's ngDevMode is explicitly false.
declare const ngDevMode: boolean | undefined;

const isDevMode = typeof ngDevMode === 'undefined' || !!ngDevMode;

if (isDevMode) {
  const api = init();
  (window as any).__GRABBY__ = api;
}
