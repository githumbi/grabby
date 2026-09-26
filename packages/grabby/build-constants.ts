import { readFileSync } from 'node:fs';

const version = (file: string): string =>
  (JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8')) as { version: string }).version;

/**
 * Exact versions baked into the CLI, so the commands it writes (MCP config,
 * `npx … pull`, CDN script tags) never float to whatever is published next.
 */
export const versionDefines = {
  __GRABBY_VERSION__: JSON.stringify(version('./package.json')),
  __GRABBY_SERVER_VERSION__: JSON.stringify(version('../server/package.json')),
};
