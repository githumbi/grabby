declare const __GRABBY_VERSION__: string;
declare const __GRABBY_SERVER_VERSION__: string;

/** This package's version, filled in at build time. */
export const GRABBY_VERSION = __GRABBY_VERSION__;

/**
 * The collector, pinned to an exact version. An MCP server runs with your
 * editor's permissions, and `npx` re-resolves a range on every launch, so a
 * range would let one bad publish reach every user at once. Re-running
 * `grabby add mcp` after upgrading Grabby moves the pin.
 */
export const SERVER_PACKAGE = `@githumbi/grabby-server@${__GRABBY_SERVER_VERSION__}`;
