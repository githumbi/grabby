import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Settings `grabby share` saves in <project>/.grabby/config.json. The file
 * holds the admin token, so it is owner-only and .grabby/ is gitignored.
 * @githumbi/grabby-server reads the same file (its `pull` and `mcp`).
 */
export interface ProjectConfig {
  version: 1;
  server: string;
  projectKey: string;
  adminToken?: string;
  inbox?: string;
  origins: string[];
  deploy: { kind: 'cloudflare'; worker: string; database: string } | { kind: 'server' };
}

export const projectConfigPath = (root: string) => join(root, '.grabby', 'config.json');

export function readProjectConfig(root: string): ProjectConfig | null {
  try {
    const parsed = JSON.parse(readFileSync(projectConfigPath(root), 'utf8')) as ProjectConfig;
    return parsed && typeof parsed.server === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeProjectConfig(root: string, config: ProjectConfig): string {
  const file = projectConfigPath(root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* not supported on this filesystem */ }
  return file;
}

/** Adds `.grabby/` to .gitignore once. Returns true when it changed the file. */
export function ensureGitignore(root: string): boolean {
  const file = join(root, '.gitignore');
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (/^\/?\.grabby\/?\s*$/m.test(current)) return false;
  const sep = current && !current.endsWith('\n') ? '\n' : '';
  writeFileSync(file, `${current}${sep}# Grabby: collector settings and admin token\n.grabby/\n`);
  return true;
}
