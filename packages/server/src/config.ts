import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export interface ProjectConfig {
  id: string;
  name: string;
  /** Write-only key, safe to embed in a web page. */
  publicKey: string;
  /** Sites allowed to post comments, e.g. "https://example.com". */
  allowedOrigins: string[];
}

export interface ServerConfig {
  version: 1;
  /** Accept comments from other machines. Requires keys and an origin allowlist. */
  public: boolean;
  host: string;
  port: number;
  /** Secret for reading, resolving and deleting comments (CLI, MCP, dashboard). */
  adminToken: string;
  projects: ProjectConfig[];
  dataDir: string;
}

export const DEFAULT_PORT = 3456;

export function defaultDataDir(): string {
  return process.env.GRABBY_DATA_DIR || path.join(homedir(), '.grabby');
}

export function generateKey(prefix: 'pk' | 'sk'): string {
  return `${prefix}_${randomBytes(prefix === 'sk' ? 24 : 16).toString('base64url')}`;
}

export function configPath(dataDir: string, explicit?: string): string {
  return explicit || process.env.GRABBY_CONFIG || path.join(dataDir, 'config.json');
}

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/+$/, '');
  }
}

function parseOrigins(raw: string | undefined): string[] | null {
  if (!raw) return null;
  return raw.split(',').map((o) => o.trim()).filter(Boolean).map(normalizeOrigin);
}

export interface LoadOptions {
  dataDir?: string;
  config?: string;
  port?: number;
  host?: string;
  public?: boolean;
}

/**
 * Config comes from the config file (written by `grabby-server init`) with
 * environment variables layered on top, so container deploys can skip the
 * file entirely: GRABBY_PUBLIC, GRABBY_ADMIN_TOKEN, GRABBY_PUBLIC_KEY,
 * GRABBY_ALLOWED_ORIGINS, GRABBY_HOST, GRABBY_PORT, GRABBY_DATA_DIR.
 */
export function loadConfig(options: LoadOptions = {}): ServerConfig {
  const dataDir = options.dataDir || defaultDataDir();
  const file = configPath(dataDir, options.config);
  let fromFile: Partial<ServerConfig> = {};
  if (existsSync(file)) {
    try {
      fromFile = JSON.parse(readFileSync(file, 'utf8')) as Partial<ServerConfig>;
    } catch (err) {
      throw new Error(`Could not read ${file}: ${(err as Error).message}`);
    }
  }

  const env = process.env;
  const isPublic = options.public ?? (env.GRABBY_PUBLIC ? env.GRABBY_PUBLIC === '1' || env.GRABBY_PUBLIC === 'true' : fromFile.public ?? false);
  const projects: ProjectConfig[] = (fromFile.projects ?? []).map((p) => ({
    id: String(p.id),
    name: String(p.name ?? p.id),
    publicKey: String(p.publicKey),
    allowedOrigins: (p.allowedOrigins ?? []).map(normalizeOrigin),
  }));
  const envKey = env.GRABBY_PUBLIC_KEY;
  const envOrigins = parseOrigins(env.GRABBY_ALLOWED_ORIGINS);
  if (envKey || envOrigins) {
    const first = projects[0] ?? { id: 'default', name: 'default', publicKey: '', allowedOrigins: [] };
    if (envKey) first.publicKey = envKey;
    if (envOrigins) first.allowedOrigins = envOrigins;
    if (!projects[0]) projects.push(first);
  }

  return {
    version: 1,
    public: isPublic,
    host: options.host || env.GRABBY_HOST || fromFile.host || (isPublic ? '0.0.0.0' : '127.0.0.1'),
    port: options.port || Number(env.GRABBY_PORT) || fromFile.port || DEFAULT_PORT,
    adminToken: env.GRABBY_ADMIN_TOKEN || fromFile.adminToken || '',
    projects,
    dataDir,
  };
}

/** Why a public server can't start with this config, or null when it can. */
export function publicConfigProblem(config: ServerConfig): string | null {
  if (!config.adminToken || config.adminToken.length < 20) return 'an admin token (run `grabby-server init`, or set GRABBY_ADMIN_TOKEN)';
  if (config.projects.length === 0) return 'at least one project with a public key';
  for (const p of config.projects) {
    if (!p.publicKey || p.publicKey.length < 12) return `a public key for project "${p.id}"`;
    if (p.allowedOrigins.length === 0) return `allowedOrigins for project "${p.id}" (the sites allowed to send comments)`;
    if (p.allowedOrigins.includes('*')) return `a real origin list for project "${p.id}" ("*" is not allowed)`;
  }
  return null;
}

export interface InitOptions {
  dataDir?: string;
  config?: string;
  name?: string;
  origins?: string[];
  force?: boolean;
}

/** Creates a config with fresh keys. Refuses to overwrite one unless forced. */
export function initConfig(options: InitOptions = {}): { file: string; config: ServerConfig; created: boolean } {
  const dataDir = options.dataDir || defaultDataDir();
  const file = configPath(dataDir, options.config);
  if (existsSync(file) && !options.force) {
    return { file, config: loadConfig({ dataDir, config: options.config }), created: false };
  }
  const config: ServerConfig = {
    version: 1,
    public: false,
    host: '127.0.0.1',
    port: DEFAULT_PORT,
    adminToken: generateKey('sk'),
    projects: [{
      id: 'default',
      name: options.name || 'My site',
      publicKey: generateKey('pk'),
      allowedOrigins: (options.origins ?? []).map(normalizeOrigin),
    }],
    dataDir,
  };
  mkdirSync(path.dirname(file), { recursive: true });
  const { dataDir: _omit, ...onDisk } = config;
  void _omit;
  writeFileSync(file, `${JSON.stringify(onDisk, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* not supported on this filesystem */ }
  return { file, config, created: true };
}
