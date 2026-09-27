import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * What `npx @githumbi/grabby share` saves in <project>/.grabby/config.json
 * (gitignored, owner-only), so `pull` and `mcp` need no flags.
 */
export interface ProjectFile {
  version: 1;
  server: string;
  projectKey?: string;
  adminToken?: string;
  inbox?: string;
  origins?: string[];
  deploy?: { kind: 'cloudflare'; worker: string; database: string } | { kind: 'server' };
}

export const PROJECT_FILE = path.join('.grabby', 'config.json');

/** Walks up from `start` to the nearest .grabby/config.json with a server in it. */
export function findProjectFile(start: string = process.cwd()): { file: string; config: ProjectFile } | null {
  let dir = path.resolve(start);
  for (;;) {
    const file = path.join(dir, PROJECT_FILE);
    if (existsSync(file)) {
      try {
        const config = JSON.parse(readFileSync(file, 'utf8')) as ProjectFile;
        if (config && typeof config.server === 'string') return { file, config };
      } catch { /* unreadable: keep looking */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
