import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomToken } from './core/crypto';
import { configFromEnv, envFlag, normalizeOrigin, type CollectorConfig } from './core/config';

export { trimTrailingSlashes, publicConfigProblem, type ProjectConfig } from './core/config';

export interface ServerConfig extends CollectorConfig {
  version: 1;
  host: string;
  port: number;
  dataDir: string;
}

export const DEFAULT_PORT = 3456;

export function defaultDataDir(): string {
  return process.env.GRABBY_DATA_DIR || path.join(homedir(), '.grabby');
}

export function generateKey(prefix: 'pk' | 'sk'): string {
  return randomToken(prefix, prefix === 'sk' ? 24 : 16);
}

export function configPath(dataDir: string, explicit?: string): string {
  return explicit || process.env.GRABBY_CONFIG || path.join(dataDir, 'config.json');
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
  const isPublic = options.public ?? envFlag(env.GRABBY_PUBLIC) ?? fromFile.public ?? false;
  const collector = configFromEnv(env, { ...fromFile, public: isPublic });

  return {
    version: 1,
    ...collector,
    public: isPublic,
    host: options.host || env.GRABBY_HOST || fileHost(fromFile.host, isPublic),
    port: options.port || Number(env.GRABBY_PORT) || fromFile.port || DEFAULT_PORT,
    dataDir,
  };
}

/**
 * Older `init` versions saved the default host "127.0.0.1" into the file,
 * which kept `start --public` on loopback. A saved loopback address counts as
 * "not chosen" when public; any other saved host is respected.
 */
function fileHost(saved: string | undefined, isPublic: boolean): string {
  if (!isPublic) return saved || '127.0.0.1';
  return saved && !isLoopbackHost(saved) ? saved : '0.0.0.0';
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
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
  // Host and port stay out of the file so --public and env can pick them.
  const { dataDir: _d, host: _h, port: _p, ...onDisk } = config;
  void _d; void _h; void _p;
  try {
    // 'wx' fails if the file exists, so checking and creating are one step.
    writeFileSync(file, `${JSON.stringify(onDisk, null, 2)}\n`, { mode: 0o600, flag: options.force ? 'w' : 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    return { file, config: loadConfig({ dataDir, config: options.config }), created: false };
  }
  try { chmodSync(file, 0o600); } catch { /* not supported on this filesystem */ }
  return { file, config, created: true };
}
