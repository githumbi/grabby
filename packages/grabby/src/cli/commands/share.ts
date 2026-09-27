import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { createInterface } from 'readline';
import { detectStack, type Stack } from '../utils/detect-stack';
import { devOrigin, guessSiteOrigins, toOrigin } from '../utils/detect-site';
import { patchLoaderTag, renderTag, type PatchResult } from '../utils/patch-source';
import { ensureGitignore, readProjectConfig, writeProjectConfig, type ProjectConfig } from '../utils/project-config';
import { runServer } from '../utils/server-cli';
import { addMcp } from './add-mcp';
import { liveTag } from './init';

export interface ShareOptions {
  cwd?: string;
  /** Sites allowed to send comments. */
  origins?: string[];
  /** Don't also allow the local dev server. */
  noLocalhost?: boolean;
  /** Use a collector you run yourself instead of deploying to Cloudflare. */
  server?: string;
  /** Admin token for --server. */
  token?: string;
  /** Slack incoming webhook for new-feedback alerts. */
  slack?: string;
  /** Replace the private inbox link. */
  rotate?: boolean;
  /** Replace the admin token (Cloudflare). */
  rotateAdmin?: boolean;
  noMcp?: boolean;
  yes?: boolean;
  dryRun?: boolean;
}

const c = {
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};
const log = (msg = '') => console.log(msg && `${c.cyan('[grabby]')} ${msg}`);
const warn = (msg: string) => console.log(`${c.yellow('[grabby]')} ${msg}`);

function trimSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}

async function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) return '';
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim();
}

/** The file the loader tag goes in, and how to write it there. */
export function siteTarget(stack: Stack): { file: string; kind: 'html' | 'jsx' | 'next-app' } | null {
  const first = (files: string[]) => files.map((f) => join(stack.root, f)).find((f) => existsSync(f));
  if (stack.framework === 'next') {
    const layout = first(['app/layout.tsx', 'app/layout.jsx', 'app/layout.js', 'src/app/layout.tsx', 'src/app/layout.jsx', 'src/app/layout.js']);
    if (layout) return { file: layout, kind: 'next-app' };
    const doc = first(['pages/_document.tsx', 'pages/_document.jsx', 'pages/_document.js', 'src/pages/_document.tsx', 'src/pages/_document.jsx', 'src/pages/_document.js']);
    return doc ? { file: doc, kind: 'jsx' } : null;
  }
  // Vite apps, Angular, SvelteKit, CRA and plain sites all have one HTML shell.
  const html = first(['index.html', 'src/index.html', 'public/index.html', 'src/app.html']);
  return html ? { file: html, kind: 'html' } : null;
}

async function collector(server: string, path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${server}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
}

async function resolveOrigins(stack: Stack, saved: ProjectConfig | null, options: ShareOptions): Promise<string[]> {
  const given = (options.origins ?? []).map((o) => {
    const origin = toOrigin(o);
    if (!origin) throw new Error(`"${o}" is not a web address (e.g. https://your-site.com)`);
    return origin;
  });
  let sites = given.length ? given : saved?.origins.filter((o) => !o.startsWith('http://localhost')) ?? [];
  if (!sites.length) sites = guessSiteOrigins(stack.root);
  if (!sites.length) {
    const answer = await ask(`  Where is your site live? ${c.dim('(e.g. https://my-app.netlify.app)')} `);
    const origin = toOrigin(answer);
    if (!origin) {
      throw new Error(process.stdin.isTTY
        ? 'a site address is needed, e.g. https://my-app.netlify.app'
        : 'pass the site address: npx @githumbi/grabby share --origin https://your-site.com');
    }
    sites = [origin];
  }
  const merged = new Set([...(given.length ? [] : saved?.origins ?? []), ...sites]);
  const dev = devOrigin(stack.framework);
  if (dev && !options.noLocalhost) merged.add(dev);
  return [...merged];
}

/** The project key in a Grabby tag already on the site, if any. */
export function projectKeyInSite(stack: Stack): string | undefined {
  const target = siteTarget(stack);
  if (!target) return undefined;
  const code = readFileSync(target.file, 'utf8');
  if (!code.includes('/dist/loader.global.js')) return undefined;
  return /data-project-key=["'](pk_[A-Za-z0-9_-]{8,64})["']/.exec(code)?.[1];
}

function patchSite(stack: Stack, tag: ReturnType<typeof liveTag>, dryRun: boolean): { file: string | null; result: PatchResult | null } {
  const target = siteTarget(stack);
  if (!target) return { file: null, result: null };
  const result = patchLoaderTag(readFileSync(target.file, 'utf8'), tag, target.kind);
  if (result.status === 'patched' && !dryRun) writeFileSync(target.file, result.code, 'utf8');
  return { file: target.file, result };
}

/**
 * One command from nothing to a feedback link: puts a collector in the
 * developer's own Cloudflare account (or connects one they run), adds the
 * loader to the site, and saves everything `pull`, `inbox` and the MCP need.
 * Re-running it is safe; it's also how the Worker gets upgraded.
 */
export async function share(options: ShareOptions = {}): Promise<void> {
  const stack = detectStack(options.cwd);
  const rel = (f: string) => relative(stack.root, f) || f;
  const saved = readProjectConfig(stack.root);
  // On another computer the settings aren't there (they're gitignored), but
  // the site's tag still has the key: keep it, so the site doesn't change.
  const keyInSite = saved ? undefined : projectKeyInSite(stack);
  const selfHosted = options.server ?? (saved?.deploy.kind === 'server' ? saved.server : undefined);
  const origins = await resolveOrigins(stack, saved, options);
  const target = siteTarget(stack);

  log(`Project: ${stack.root}`);
  log(`Detected: ${stack.framework}${saved ? ' · already shared, updating' : ''}`);
  console.log('');
  console.log(c.bold('  Grabby will:'));
  console.log(selfHosted
    ? `   • use your collector at ${c.bold(selfHosted)}`
    : `   • ${saved ? 'update' : 'set up'} a feedback collector in ${c.bold('your Cloudflare account')} ${c.dim('(free, no card; a browser window opens to sign in the first time)')}`);
  console.log(`   • accept comments from ${origins.map((o) => c.bold(o)).join(', ')}`);
  console.log(target
    ? `   • add the Grabby script to ${c.bold(rel(target.file))}`
    : `   • show you the script tag to add ${c.dim('(no layout or index.html found to edit)')}`);
  console.log(`   • save settings in ${c.bold('.grabby/config.json')} ${c.dim('(private; added to .gitignore)')}`);
  if (!options.noMcp) console.log(`   • let your AI agent read feedback ${c.dim('(.mcp.json)')}`);
  if (options.slack) console.log('   • post new feedback to Slack');
  console.log('');

  if (options.dryRun) return;
  if (!options.yes) {
    const go = /^y(es)?$/i.test(await ask('  Go ahead? [y/N] '));
    if (!go) {
      warn(process.stdin.isTTY ? 'Nothing changed.' : 'Nothing changed (not a terminal; re-run with --yes to apply).');
      return;
    }
  }

  // 1. The collector.
  let server: string;
  let projectKey: string;
  let adminToken: string | undefined;
  let deploy: ProjectConfig['deploy'];
  if (selfHosted) {
    server = trimSlashes(selfHosted);
    adminToken = options.token ?? process.env.GRABBY_ADMIN_TOKEN ?? saved?.adminToken;
    if (!adminToken) throw new Error('--server needs the collector\'s admin token: --token sk_… (or GRABBY_ADMIN_TOKEN)');
    const res = await collector(server, '/v1/meta', adminToken).catch((err: Error) => { throw new Error(`could not reach ${server}: ${err.message}`); });
    if (res.status === 401) throw new Error(`${server} rejected the admin token`);
    if (!res.ok) throw new Error(`${server}/v1/meta answered ${res.status}. Is it a Grabby collector, version 0.2 or newer?`);
    const meta = await res.json() as { projects: Array<{ publicKey: string; allowedOrigins: string[] }> };
    const project = meta.projects[0];
    if (!project?.publicKey) throw new Error(`${server} has no project key configured`);
    projectKey = project.publicKey;
    const missing = origins.filter((o) => !o.startsWith('http://localhost') && !project.allowedOrigins.includes(o));
    if (missing.length) warn(`Your collector doesn't accept ${missing.join(', ')} yet. Add it to GRABBY_ALLOWED_ORIGINS on the server.`);
    deploy = { kind: 'server' };
  } else {
    // The result comes back in a private file, so the terminal stays free for
    // Wrangler's sign-in and first-time questions.
    const resultFile = join(stack.root, '.grabby', 'cloudflare', 'result.json');
    const args = ['deploy', 'cloudflare', '--out', resultFile, '--dir', join(stack.root, '.grabby', 'cloudflare'), ...origins.flatMap((o) => ['--origin', o])];
    const key = saved?.projectKey ?? keyInSite;
    if (key) args.push('--key', key);
    if (options.rotateAdmin) args.push('--rotate-admin');
    rmSync(resultFile, { force: true });
    const run = await runServer(args, { env: { GRABBY_ADMIN_TOKEN: saved?.adminToken } });
    let result: { url: string; projectKey: string; adminToken?: string; worker: string; database: string };
    try {
      result = JSON.parse(readFileSync(resultFile, 'utf8'));
    } catch {
      throw new Error('setting up the collector failed (see the messages above)');
    } finally {
      rmSync(resultFile, { force: true });
    }
    if (run.code !== 0) throw new Error('setting up the collector failed (see the messages above)');
    server = result.url;
    projectKey = result.projectKey;
    adminToken = result.adminToken ?? saved?.adminToken;
    deploy = { kind: 'cloudflare', worker: result.worker, database: result.database };
    if (!adminToken) {
      throw new Error('this collector already has an admin token that is not saved on this computer. Run again with --rotate-admin to replace it.');
    }
  }

  // 2. The private inbox link: keep a working one, unless asked to replace it.
  let inbox = saved?.inbox && saved.server === server && !options.rotate ? saved.inbox : undefined;
  if (inbox) {
    const token = new URL(inbox).hash.replace(/^#k=/, '');
    const check = await collector(server, '/v1/meta', token).catch(() => null);
    if (check?.status === 401) inbox = undefined;
  }
  if (!inbox) {
    const res = await collector(server, '/v1/admin/inbox-token', adminToken, { method: 'POST' });
    if (!res.ok) throw new Error(`could not create the inbox link (${res.status})`);
    inbox = ((await res.json()) as { url?: unknown }).url as string;
    // Only keep a link to the collector we just talked to.
    let sameCollector = false;
    try { sameCollector = typeof inbox === 'string' && new URL(inbox).origin === new URL(server).origin; } catch { /* not a URL */ }
    if (!sameCollector) throw new Error(`${server} returned an unexpected inbox link`);
  }

  // 3. Alerts.
  if (options.slack) {
    const res = await collector(server, '/v1/admin/alerts', adminToken, { method: 'PUT', body: JSON.stringify({ slack: options.slack }) });
    if (!res.ok) warn(`Slack alerts not set: ${((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.status}`);
  }

  // 4. The site.
  const tag = liveTag(server, projectKey);
  const { file, result } = patchSite(stack, tag, false);
  let siteChanged: string | null = null;
  if (file && result?.status === 'patched') {
    siteChanged = rel(file);
    log(`${c.green('✓')} ${siteChanged}`);
  } else if (file && result?.status === 'already') {
    log(`${rel(file)}: already up to date`);
  } else {
    warn(`Add this before </body> in your site's layout${file && result?.status === 'unrecognised' ? ` (${rel(file)}: ${result.reason})` : ''}:`);
    console.log(`\n${renderTag(tag, 'html')}\n`);
  }

  // 5. Settings, for pull / inbox / MCP.
  writeProjectConfig(stack.root, { version: 1, server, projectKey, adminToken, inbox, origins, deploy });
  if (ensureGitignore(stack.root)) log(`${c.green('✓')} .gitignore (added .grabby/)`);
  log(`${c.green('✓')} .grabby/config.json`);
  if (!options.noMcp) await addMcp({ cwd: stack.root, quiet: true });

  const site = origins.find((o) => !o.startsWith('http://localhost')) ?? origins[0];
  console.log('');
  log(c.green('Grabby is ready.'));
  console.log('');
  console.log(`  ${c.bold('1.')} ${siteChanged ? `Commit and deploy your site as usual (${siteChanged} changed).` : 'Deploy your site as usual.'}`);
  console.log(`  ${c.bold('2.')} Send reviewers this link. They click Comment, pick anything, and type:`);
  console.log(`       ${c.bold(`${site}/?grabby=${projectKey}`)}`);
  console.log(`  ${c.bold('3.')} Read feedback in your private inbox ${c.dim('(bookmark it; don\'t share it)')}:`);
  console.log(`       ${c.bold(inbox)}`);
  console.log(`     or hand it to your AI agent: ${c.bold('npx @githumbi/grabby pull')}`);
  console.log('');
  console.log(c.dim(`  Comments arrive even while your computer is off. Later: ${c.bold('npx @githumbi/grabby inbox')} opens the inbox,`));
  console.log(c.dim(`  ${c.bold('npx @githumbi/grabby alerts --slack <webhook>')} posts new feedback to Slack.`));
  console.log('');
}
