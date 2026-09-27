import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deployCloudflare, readDeployConfig, workerName, type WranglerRunner } from '../cloudflare';

/** A fake Cloudflare account that remembers databases, secrets and what was deployed. */
function fakeWrangler(opts: { signedIn?: boolean; subdomain?: boolean } = {}) {
  const state = { subdomain: opts.subdomain ?? true, signedIn: opts.signedIn ?? true, dbs: [] as Array<{ name: string; uuid: string }>, secrets: new Set<string>(), deployed: 0, secretFiles: [] as string[] };
  const calls: string[][] = [];
  const runner: WranglerRunner = {
    async run(args, runOptions = {}) {
      calls.push(args);
      // Wrangler, given the terminal, asks for a subdomain and registers it.
      if (runOptions.passthrough && args[0] === 'deploy') { state.subdomain = true; }
      const [cmd, sub] = args;
      if (cmd === 'whoami') return { code: state.signedIn ? 0 : 1, stdout: '{}' };
      if (cmd === 'login') { state.signedIn = true; return { code: 0, stdout: '' }; }
      if (cmd === 'd1' && sub === 'list') return { code: 0, stdout: JSON.stringify(state.dbs) };
      if (cmd === 'd1' && sub === 'create') { state.dbs.push({ name: args[2], uuid: `uuid-${args[2]}` }); return { code: 0, stdout: 'ok' }; }
      if (cmd === 'secret') return { code: state.deployed ? 0 : 1, stdout: JSON.stringify([...state.secrets].map((name) => ({ name, type: 'secret_text' }))) };
      if (cmd === 'deploy') {
        if (!state.subdomain) {
          return { code: 1, stdout: '', stderr: '▲ [WARNING] You need to register a workers.dev subdomain before publishing to workers.dev\n✘ [ERROR] … register a workers.dev subdomain here:\n\n  https://dash.cloudflare.com/abc123/workers/onboarding\n' };
        }
        const i = args.indexOf('--secrets-file');
        if (i > 0) {
          const file = args[i + 1];
          state.secretFiles.push(readFileSync(file, 'utf8'));
          for (const k of Object.keys(JSON.parse(readFileSync(file, 'utf8')))) state.secrets.add(k);
        }
        state.deployed++;
        return { code: 0, stdout: 'Uploaded grabby-shop\nDeployed grabby-shop triggers\n  https://grabby-shop.jane.workers.dev\n' };
      }
      return { code: 1, stdout: '' };
    },
  };
  return { runner, state, calls };
}

describe('deploy to Cloudflare', () => {
  let dir: string;
  let workDir: string;
  let workerFile: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'grabby-deploy-'));
    workDir = path.join(dir, 'shop', '.grabby', 'cloudflare');
    workerFile = path.join(dir, 'worker.js');
    writeFileSync(workerFile, 'export default {}');
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const deploy = (runner: WranglerRunner, extra: Partial<Parameters<typeof deployCloudflare>[0]> = {}) =>
    deployCloudflare({ workDir, workerFile, origins: ['https://shop.example/'], healthTimeoutMs: 0, interactive: true, log: () => {}, ...extra }, runner);

  it('signs in, creates the database, deploys with the admin token as a secret, and cleans up', async () => {
    const { runner, state, calls } = fakeWrangler({ signedIn: false });
    const result = await deploy(runner);
    expect(result).toMatchObject({ url: 'https://grabby-shop.jane.workers.dev', worker: 'grabby-shop', database: 'uuid-grabby-shop', origins: ['https://shop.example'] });
    expect(result.projectKey).toMatch(/^pk_/);
    expect(result.adminToken).toMatch(/^sk_/);
    expect(calls.map((c) => c.slice(0, 2).join(' '))).toEqual(['whoami --json', 'login', 'd1 list', 'd1 create', 'd1 list', 'secret list', 'deploy --config']);
    // The token only ever travels in the secrets file, never on a command line.
    expect(calls.flat().join(' ')).not.toContain(result.adminToken!);
    expect(state.secretFiles[0]).toContain(result.adminToken!);
    expect(existsSync(path.join(workDir, '.secrets.json'))).toBe(false);
    const cfg = JSON.parse(readFileSync(path.join(workDir, 'wrangler.json'), 'utf8'));
    expect(cfg).toMatchObject({ main: 'worker.js', no_bundle: true, vars: { GRABBY_PUBLIC_KEY: result.projectKey, GRABBY_ALLOWED_ORIGINS: 'https://shop.example' } });
    expect(readDeployConfig(workDir)).toMatchObject({ name: 'grabby-shop', projectKey: result.projectKey });
  });

  it('re-runs without recreating the database or replacing the admin token', async () => {
    const { runner, calls } = fakeWrangler();
    const first = await deploy(runner);
    calls.length = 0;
    const again = await deploy(runner, { projectKey: first.projectKey, origins: ['https://shop.example', 'http://localhost:3000'] });
    expect(calls.some((c) => c[1] === 'create')).toBe(false);
    expect(again.adminToken).toBeUndefined();
    expect(again.projectKey).toBe(first.projectKey);
    expect(readDeployConfig(workDir)?.origins).toEqual(['https://shop.example', 'http://localhost:3000']);
    const rotated = await deploy(runner, { rotateAdmin: true });
    expect(rotated.adminToken).toMatch(/^sk_/);
    expect(rotated.adminToken).not.toBe(first.adminToken);
  });

  it('refuses a wildcard origin, and sign-in without a terminal', async () => {
    await expect(deploy(fakeWrangler().runner, { origins: ['*'] })).rejects.toThrow(/not allowed/);
    await expect(deploy(fakeWrangler({ signedIn: false }).runner, { interactive: false })).rejects.toThrow(/CLOUDFLARE_API_TOKEN/);
  });

  it('lets Wrangler ask a brand-new account for its workers.dev subdomain, then reads the address', async () => {
    const { runner, calls } = fakeWrangler({ subdomain: false });
    const result = await deploy(runner);
    expect(result.url).toBe('https://grabby-shop.jane.workers.dev');
    expect(calls.filter((c) => c[0] === 'deploy')).toHaveLength(3); // failed, handed the terminal, then read the address
    await expect(deploy(fakeWrangler({ subdomain: false }).runner, { interactive: false })).rejects.toThrow(/workers\.dev subdomain/);
  });

  it('names workers after the project folder', () => {
    expect(workerName('My Shop!')).toBe('grabby-my-shop');
    expect(workerName('***')).toBe('grabby-site');
  });
});
