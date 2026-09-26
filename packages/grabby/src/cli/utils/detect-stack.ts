import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';
export type Framework = 'angular' | 'next' | 'nuxt' | 'sveltekit' | 'astro' | 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';

export interface Stack {
  root: string;
  packageManager: PackageManager;
  framework: Framework;
  /** vite.config.* when the project builds with Vite. */
  viteConfig: string | null;
  /** The file that mounts the app, where initGrabby() goes. */
  entry: string | null;
  hasPackageJson: boolean;
}

const VITE_CONFIGS = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'];
const ENTRIES = ['src/main.tsx', 'src/main.ts', 'src/main.jsx', 'src/main.js', 'src/index.tsx', 'src/index.jsx', 'src/index.ts', 'src/index.js'];

export function findProjectRoot(start: string = process.cwd()): string {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export function detectPackageManager(root: string): PackageManager {
  // Walk up for lockfiles too: a workspace package's lockfile lives at the repo root.
  let dir = root;
  while (true) {
    if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
    if (existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, 'bun.lock'))) return 'bun';
    if (existsSync(join(dir, 'package-lock.json'))) return 'npm';
    const parent = dirname(dir);
    if (parent === dir) return 'npm';
    dir = parent;
  }
}

export function detectStack(start: string = process.cwd()): Stack {
  const root = findProjectRoot(start);
  const pkgPath = join(root, 'package.json');
  const hasPackageJson = existsSync(pkgPath);
  let deps: Record<string, string> = {};
  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      deps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch { /* unreadable package.json: treat as plain HTML */ }
  }
  const has = (name: string) => name in deps;

  let framework: Framework = 'html';
  if (existsSync(join(root, 'angular.json')) || has('@angular/core')) framework = 'angular';
  else if (has('next')) framework = 'next';
  else if (has('nuxt')) framework = 'nuxt';
  else if (has('@sveltejs/kit')) framework = 'sveltekit';
  else if (has('astro')) framework = 'astro';
  else if (has('solid-js')) framework = 'solid';
  else if (has('preact')) framework = 'preact';
  else if (has('react')) framework = 'react';
  else if (has('vue')) framework = 'vue';
  else if (has('svelte')) framework = 'svelte';

  const viteConfig = VITE_CONFIGS.map((f) => join(root, f)).find((f) => existsSync(f)) ?? null;
  const entry = ENTRIES.map((f) => join(root, f)).find((f) => existsSync(f)) ?? null;

  return { root, packageManager: detectPackageManager(root), framework, viteConfig, entry, hasPackageJson };
}

export function installCommand(pm: PackageManager, pkg: string, dev: boolean): string {
  switch (pm) {
    case 'pnpm': return `pnpm add ${dev ? '-D ' : ''}${pkg}`;
    case 'yarn': return `yarn add ${dev ? '-D ' : ''}${pkg}`;
    case 'bun': return `bun add ${dev ? '-d ' : ''}${pkg}`;
    default: return `npm install ${dev ? '-D ' : ''}${pkg}`;
  }
}
