import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { createInterface } from 'readline';
import { detectStack, installCommand, type Stack } from '../utils/detect-stack';
import { patchViteConfig, patchEntry, patchAngularJson, patchAngularAppConfig, type LiveTag, type PatchResult } from '../utils/patch-source';
import { GRABBY_VERSION, SERVER_PACKAGE } from '../versions';

const PKG = '@githumbi/grabby';

export interface InitOptions {
  cwd?: string;
  /** Apply without asking. */
  yes?: boolean;
  /** Show the plan only. */
  dryRun?: boolean;
  /** Skip installing the package. */
  noInstall?: boolean;
  /** Set up live-site feedback instead of local developer mode. */
  live?: { server: string; projectKey: string };
}

const c = {
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

/**
 * Subresource Integrity for a script-tag build shipped next to this CLI
 * (dist/cli → dist). It's the same file jsDelivr serves for this exact
 * version, so a tampered CDN copy won't run.
 */
function sri(file: string): string | null {
  try {
    const data = readFileSync(new URL(`../${file}`, import.meta.url));
    return `sha384-${createHash('sha384').update(data).digest('base64')}`;
  } catch {
    return null; // running from source
  }
}

/** The live-feedback loader tag's contents, pinned to this exact version with integrity hashes. */
export function liveTag(server: string, projectKey: string): LiveTag {
  return {
    src: `https://cdn.jsdelivr.net/npm/${PKG}@${GRABBY_VERSION}/dist/loader.global.js`,
    integrity: sri('loader.global.js'),
    // The loader fetches the full build itself; data-integrity covers that file.
    dataIntegrity: sri('grabby.global.js'),
    server,
    projectKey,
  };
}

/** A script tag pinned to this exact version, with integrity hashes. */
export function cdnScriptTag(live?: { server: string; projectKey: string }): string {
  const file = live ? 'loader.global.js' : 'grabby.global.js';
  const own = sri(file);
  // The loader fetches the full build itself; data-integrity covers that file.
  const full = live ? sri('grabby.global.js') : null;
  const attrs = [
    `src="https://cdn.jsdelivr.net/npm/${PKG}@${GRABBY_VERSION}/dist/${file}"`,
    ...(own ? [`integrity="${own}"`, 'crossorigin="anonymous"'] : []),
    ...(full ? [`data-integrity="${full}"`] : []),
    ...(live ? ['data-mode="live"', `data-server="${live.server}"`, `data-project-key="${live.projectKey}"`] : []),
    'defer',
  ];
  return `<script ${attrs.join(' ')}></script>`;
}

const log = (msg = '') => console.log(msg && `${c.cyan('[grabby]')} ${msg}`);
const warn = (msg: string) => console.log(`${c.yellow('[grabby]')} ${msg}`);

interface Change {
  file: string;
  describe: string;
  next: string;
}

function tryPatch(file: string | null, patch: (code: string) => PatchResult, describe: string, manual: string, changes: Change[], manualSteps: string[]): void {
  if (!file || !existsSync(file)) {
    manualSteps.push(manual);
    return;
  }
  const result = patch(readFileSync(file, 'utf8'));
  if (result.status === 'patched') changes.push({ file, describe, next: result.code });
  else if (result.status === 'already') log(`${describe}: already set up`);
  else manualSteps.push(`${manual}\n     ${c.dim(`(couldn't edit ${file} automatically: ${result.reason})`)}`);
}

/** What to change for each stack. Anything not safely automatable becomes a manual step. */
function plan(stack: Stack, options: InitOptions): { changes: Change[]; manual: string[]; devDependency: boolean } {
  const changes: Change[] = [];
  const manual: string[] = [];
  const live = options.live;
  const liveCall = live ? `initGrabbyLive({ server: '${live.server}', projectKey: '${live.projectKey}' })` : '';

  switch (stack.framework) {
    case 'angular': {
      tryPatch(join(stack.root, 'angular.json'), patchAngularJson, 'use the Grabby builders',
        'In angular.json, set build → "@githumbi/grabby:application" and serve → "@githumbi/grabby:dev-server".', changes, manual);
      const appConfig = ['src/app/app.config.ts', 'src/app.config.ts'].map((f) => join(stack.root, f)).find((f) => existsSync(f)) ?? null;
      tryPatch(appConfig, patchAngularAppConfig, 'add provideGrabby()',
        "In app.config.ts: import { provideGrabby } from '@githumbi/grabby/angular'; and add provideGrabby() to providers.", changes, manual);
      if (live) manual.push(`For live feedback, pass the options: provideGrabby({ mode: 'live', server: '${live.server}', projectKey: '${live.projectKey}' })`);
      break;
    }
    case 'react':
    case 'vue':
    case 'svelte':
    case 'solid':
    case 'preact': {
      if (stack.framework !== 'svelte' && !live) {
        tryPatch(stack.viteConfig, patchViteConfig, 'add the source-location plugin',
          "In your bundler config add the plugin first: import grabby from '@githumbi/grabby/plugin'; plugins: [grabby.vite(), …] (also grabby.webpack(), grabby.rspack(), …)", changes, manual);
      }
      tryPatch(stack.entry, (code) => patchEntry(code, { live }), live ? 'start live feedback' : 'start Grabby in development builds',
        live
          ? `In your entry file: import { initGrabbyLive } from '@githumbi/grabby/live'; ${liveCall};`
          : "In your entry file: import { initGrabby } from '@githumbi/grabby'; if (import.meta.env.DEV) initGrabby();", changes, manual);
      break;
    }
    case 'next':
      manual.push(
        "next.config: const grabby = require('@githumbi/grabby/plugin').default; webpack: (config) => { config.plugins.unshift(grabby.webpack()); return config; }",
        live
          ? `In a client component rendered by your root layout: useEffect(() => { import('@githumbi/grabby/live').then((g) => g.${liveCall}); }, []);`
          : "In a client component rendered by your root layout: useEffect(() => { if (process.env.NODE_ENV === 'development') import('@githumbi/grabby').then((g) => g.initGrabby()); }, []);",
      );
      break;
    case 'nuxt':
    case 'sveltekit':
    case 'astro':
      manual.push(
        stack.framework === 'nuxt' ? "nuxt.config: vite: { plugins: [require('@githumbi/grabby/plugin').default.vite()] }" : 'No build plugin needed for Svelte-based apps; Astro can add grabby.vite() under vite.plugins.',
        live
          ? `In a client-only script/plugin: import('@githumbi/grabby/live').then((g) => g.${liveCall});`
          : "In a client-only script/plugin: if (import.meta.env.DEV) import('@githumbi/grabby').then((g) => g.initGrabby());",
      );
      break;
    default:
      manual.push(`Add before </body>:\n     ${cdnScriptTag(live)}`);
  }

  return { changes, manual, devDependency: !live };
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

export async function init(options: InitOptions = {}): Promise<void> {
  const stack = detectStack(options.cwd);
  const rel = (f: string) => relative(stack.root, f) || f;
  log(`Project: ${stack.root}`);
  log(`Detected: ${stack.framework}${stack.viteConfig ? ' + Vite' : ''} · ${stack.packageManager}${options.live ? ' · live feedback' : ''}`);
  log();

  const { changes, manual, devDependency } = plan(stack, options);
  const install = stack.hasPackageJson && !options.noInstall ? installCommand(stack.packageManager, PKG, devDependency) : null;

  if (!install && changes.length === 0 && manual.length === 0) {
    log(c.green('Everything is already set up.'));
    return;
  }

  console.log(c.bold('  Grabby will:'));
  if (install) console.log(`   • run ${c.bold(install)}`);
  for (const ch of changes) console.log(`   • edit ${c.bold(rel(ch.file))}: ${ch.describe}`);
  if (manual.length) {
    console.log(c.bold('\n  You\'ll need to do by hand:'));
    manual.forEach((m, i) => console.log(`   ${i + 1}. ${m}`));
  }
  console.log('');

  if (options.dryRun) return;
  if (changes.length || install) {
    const go = options.yes || await confirm('  Go ahead? [y/N] ');
    if (!go) {
      warn(process.stdin.isTTY ? 'Nothing changed.' : 'Nothing changed (not a terminal; re-run with --yes to apply).');
      return;
    }
  }

  if (install) {
    try {
      execSync(install, { cwd: stack.root, stdio: 'inherit' });
    } catch {
      warn(`Install failed; run it yourself: ${install}`);
    }
  }
  for (const ch of changes) {
    writeFileSync(ch.file, ch.next, 'utf8');
    log(`${c.green('✓')} ${rel(ch.file)}`);
  }

  console.log('');
  log(c.green('Done.'));
  if (options.live) {
    console.log(`\n  Share this feedback link with reviewers:  ${c.bold(`https://<your-site>/?grabby=${options.live.projectKey}`)}`);
    console.log(`  Pull their comments:  ${c.bold(`npx -y ${SERVER_PACKAGE} pull --server ${options.live.server} --token <admin token>`)}\n`);
  } else {
    console.log(`\n  Start your dev server, press ${c.bold('Alt+G')} (${c.bold('Option+G')} on Mac), click anything, and comment.`);
    console.log(`  Then use ${c.bold('Copy all')} and paste into your AI agent.`);
    console.log(`  Want your agent to read comments directly? Run ${c.bold('npx @githumbi/grabby add mcp')}.\n`);
  }
}
