import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomToken } from '../core/crypto';
import { normalizeOrigin } from '../core/config';

/**
 * Wrangler, pinned to an exact version at least 7 days old (see CLAUDE.md).
 * It runs through npx with install scripts off, so it never becomes a
 * dependency of every Grabby install.
 */
export const WRANGLER_VERSION = '4.135.0';
/** Workers runtime behaviour the bundled worker was tested against. */
export const COMPATIBILITY_DATE = '2026-09-01';

export interface RunResult {
  code: number;
  stdout: string;
  /** Wrangler's warnings and errors. */
  stderr?: string;
}

export interface WranglerRunner {
  /**
   * Runs `wrangler <args>`. Interactive runs share the terminal (login,
   * first-time workers.dev subdomain); output is still captured.
   */
  run(args: string[], options?: { interactive?: boolean; passthrough?: boolean; cwd?: string }): Promise<RunResult>;
}

export function npxWrangler(log: (line: string) => void = (l) => process.stderr.write(l)): WranglerRunner {
  return {
    run(args, options = {}) {
      const windows = process.platform === 'win32';
      const argv = ['-y', `wrangler@${WRANGLER_VERSION}`, ...args];
      if (windows && !argv.every((a) => /^[\w@./:=,+\\-]+$/.test(a))) {
        return Promise.reject(new Error(`unsupported characters in wrangler arguments: ${args.join(' ')}`));
      }
      return new Promise((resolve, reject) => {
        const child = spawn(windows ? 'npx.cmd' : 'npx', argv, {
          cwd: options.cwd,
          shell: windows,
          // passthrough: Wrangler talks to the terminal directly (it only asks
          // questions when it has one), and nothing is captured.
          stdio: options.passthrough ? 'inherit' : [options.interactive ? 'inherit' : 'ignore', 'pipe', 'pipe'],
          env: { ...process.env, npm_config_ignore_scripts: 'true', WRANGLER_SEND_METRICS: 'false' },
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf8');
          if (options.interactive) log(chunk.toString('utf8'));
        });
        // Wrangler reports problems on stderr; keep it (to explain them) and show it live.
        child.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf8');
          if (options.interactive) log(chunk.toString('utf8'));
        });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
      });
    },
  };
}

export interface DeployOptions {
  /** Where to keep the generated wrangler config (inside the gitignored .grabby/). */
  workDir: string;
  /** Worker and database name; defaults to grabby-<project folder>. */
  name?: string;
  origins: string[];
  /** Reuse this project key (from .grabby/config.json); generated when missing. */
  projectKey?: string;
  /** The admin token this project already has, if any. */
  adminToken?: string;
  /** Replace the admin token even if the Worker already has one. */
  rotateAdmin?: boolean;
  /** Path to the built worker; defaults to the one shipped in this package. */
  workerFile?: string;
  /** Stop after this long waiting for /health (tests pass 0). */
  healthTimeoutMs?: number;
  /** Can we open a browser sign-in? Defaults to whether stdin is a terminal. */
  interactive?: boolean;
  log?: (line: string) => void;
}

export interface DeployResult {
  url: string;
  worker: string;
  database: string;
  projectKey: string;
  origins: string[];
  /** Set only when a new admin token was stored on the Worker. */
  adminToken?: string;
}

export function workerName(raw: string): string {
  const slug = raw.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'site';
  return `grabby-${slug}`;
}

export function bundledWorker(): string {
  // dist/cli.js → dist/worker/worker.js
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'worker', 'worker.js');
}

const WORKERS_DEV = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev/i;

function parseJson<T>(text: string): T | null {
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  try { return JSON.parse(text.slice(start)) as T; } catch { return null; }
}

async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
      const body = await res.json().catch(() => ({})) as { ok?: boolean };
      if (res.ok && body.ok) return true;
    } catch { /* DNS for a new workers.dev name can take a few seconds */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/**
 * Puts the collector in the developer's own Cloudflare account: a Worker on
 * a permanent workers.dev address, with a D1 database for comments. Safe to
 * re-run: it reuses the database, keeps the admin token, and redeploys the
 * bundled worker (which is also how upgrades happen).
 */
export async function deployCloudflare(options: DeployOptions, wrangler: WranglerRunner): Promise<DeployResult> {
  const log = options.log ?? ((l: string) => process.stderr.write(`${l}\n`));
  const name = options.name ?? workerName(path.basename(path.resolve(options.workDir, '..', '..')));
  const origins = [...new Set(options.origins.map(normalizeOrigin))];
  if (origins.length === 0) throw new Error('at least one site origin is needed (e.g. --origin https://your-site.com)');
  if (origins.includes('*')) throw new Error('"*" is not allowed; list the real sites');

  // 1. Signed in to Cloudflare?
  const me = await wrangler.run(['whoami', '--json']);
  if (me.code !== 0) {
    if (process.env.CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is set but Cloudflare rejected it');
    if (!(options.interactive ?? process.stdin.isTTY)) throw new Error('not signed in to Cloudflare. Run this in a terminal (a browser window opens to sign in), or set CLOUDFLARE_API_TOKEN');
    log('[grabby] Opening your browser to sign in to Cloudflare (free, no card needed)…');
    const login = await wrangler.run(['login'], { interactive: true });
    if (login.code !== 0) throw new Error('Cloudflare sign-in did not complete');
  }

  // 2. The database: reuse it by name, or create it.
  const findDb = async () => {
    const list = await wrangler.run(['d1', 'list', '--json']);
    if (list.code !== 0) throw new Error('could not list D1 databases (is more than one Cloudflare account linked? set CLOUDFLARE_ACCOUNT_ID)');
    return (parseJson<Array<{ name: string; uuid: string }>>(list.stdout) ?? []).find((d) => d.name === name);
  };
  let db = await findDb();
  if (!db) {
    log(`[grabby] Creating database ${name}…`);
    const created = await wrangler.run(['d1', 'create', name]);
    if (created.code !== 0) throw new Error(`could not create D1 database ${name}`);
    db = await findDb();
    if (!db) throw new Error(`created D1 database ${name} but could not find it`);
  }

  // 3. The config wrangler deploys from, next to a copy of the bundled worker.
  mkdirSync(options.workDir, { recursive: true });
  const configFile = path.join(options.workDir, 'wrangler.json');
  const workerFile = options.workerFile ?? bundledWorker();
  if (!existsSync(workerFile)) throw new Error(`worker bundle missing at ${workerFile}`);
  copyFileSync(workerFile, path.join(options.workDir, 'worker.js'));
  const projectKey = options.projectKey ?? randomToken('pk', 16);
  writeFileSync(configFile, `${JSON.stringify({
    $schema: 'https://unpkg.com/wrangler/config-schema.json',
    name,
    main: 'worker.js',
    compatibility_date: COMPATIBILITY_DATE,
    workers_dev: true,
    no_bundle: true,
    d1_databases: [{ binding: 'DB', database_name: name, database_id: db.uuid }],
    // Public by design: the key is in every page, and origins are no secret.
    vars: { GRABBY_PUBLIC_KEY: projectKey, GRABBY_ALLOWED_ORIGINS: origins.join(',') },
  }, null, 2)}\n`);

  // 4. The admin token is a secret; keep the Worker's unless asked to rotate.
  const secrets = await wrangler.run(['secret', 'list', '--format', 'json', '--config', configFile]);
  const hasToken = secrets.code === 0
    && (parseJson<Array<{ name: string }>>(secrets.stdout) ?? []).some((s) => s.name === 'GRABBY_ADMIN_TOKEN');
  let adminToken: string | undefined;
  if (!hasToken || options.rotateAdmin) adminToken = options.adminToken && !options.rotateAdmin ? options.adminToken : randomToken('sk', 24);

  // 5. Deploy, uploading the secret with the same version so it's never live without one.
  const secretsFile = path.join(options.workDir, '.secrets.json');
  const deployArgs = ['deploy', '--config', configFile];
  if (adminToken) {
    writeFileSync(secretsFile, JSON.stringify({ GRABBY_ADMIN_TOKEN: adminToken }), { mode: 0o600 });
    deployArgs.push('--secrets-file', secretsFile);
  }
  log(`[grabby] Deploying the collector to Cloudflare…`);
  let deployed: RunResult;
  try {
    deployed = await wrangler.run(deployArgs, { interactive: true });
    // A new account has no workers.dev subdomain yet. Wrangler registers one,
    // but only when it can ask in a terminal, so hand it the terminal once;
    // then deploy again, captured, to read the address.
    if (deployed.code !== 0 && /register a workers\.dev subdomain/i.test(`${deployed.stdout}\n${deployed.stderr ?? ''}`)) {
      if (!(options.interactive ?? process.stdin.isTTY)) {
        throw new Error('your Cloudflare account needs a free workers.dev subdomain first. Run this again in a terminal, where Wrangler can ask for one');
      }
      log('');
      log('[grabby] One more step, only needed once: pick your free workers.dev subdomain.');
      log('[grabby] Answer "Y" below, then type a name (it becomes part of your collector\'s address).');
      log('');
      const registered = await wrangler.run(deployArgs, { interactive: true, passthrough: true });
      if (registered.code !== 0) throw new Error('the workers.dev subdomain was not set up (see the messages above)');
      deployed = await wrangler.run(deployArgs, { interactive: true });
    }
  } finally {
    rmSync(secretsFile, { force: true });
  }
  const url = WORKERS_DEV.exec(deployed.stdout)?.[0]?.toLowerCase();
  if (deployed.code !== 0 || !url) throw new Error('wrangler deploy failed (see the output above)');

  if (!(await waitForHealth(url, options.healthTimeoutMs ?? 60_000))) {
    log(`[grabby] Deployed, but ${url}/health isn't answering yet. New workers.dev addresses can take a minute.`);
  }
  return { url, worker: name, database: db.uuid, projectKey, origins, ...(adminToken ? { adminToken } : {}) };
}

/** The saved wrangler config from an earlier deploy, if any. */
export function readDeployConfig(workDir: string): { name: string; projectKey?: string; origins: string[] } | null {
  try {
    const cfg = JSON.parse(readFileSync(path.join(workDir, 'wrangler.json'), 'utf8')) as { name: string; vars?: Record<string, string> };
    return {
      name: cfg.name,
      projectKey: cfg.vars?.GRABBY_PUBLIC_KEY,
      origins: (cfg.vars?.GRABBY_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    };
  } catch {
    return null;
  }
}
