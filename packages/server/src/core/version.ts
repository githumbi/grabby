declare const __SERVER_VERSION__: string | undefined;

/** This package's version, filled in by tsup from package.json (tests see the fallback). */
export const SERVER_VERSION: string = typeof __SERVER_VERSION__ === 'string' ? __SERVER_VERSION__ : '0.0.0-dev';
