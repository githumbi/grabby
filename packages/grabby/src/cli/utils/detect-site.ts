import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Framework } from './detect-stack';

/** The dev server port each framework uses by default. */
const DEV_PORTS: Partial<Record<Framework, number>> = {
  next: 3000, nuxt: 3000, angular: 4200, astro: 4321,
  react: 5173, vue: 5173, svelte: 5173, sveltekit: 5173, solid: 5173, preact: 5173,
};

export function devOrigin(framework: Framework): string | null {
  const port = DEV_PORTS[framework];
  return port ? `http://localhost:${port}` : null;
}

/** "my-site.netlify.app" or "https://x.com/path" → "https://my-site.netlify.app" / "https://x.com". */
export function toOrigin(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Best guesses at where the site is deployed, from files that say so. */
export function guessSiteOrigins(root: string): string[] {
  const found: string[] = [];
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { homepage?: unknown };
    if (typeof pkg.homepage === 'string' && !/github\.com\//.test(pkg.homepage)) {
      const o = toOrigin(pkg.homepage);
      if (o) found.push(o);
    }
  } catch { /* no package.json */ }
  for (const cname of ['CNAME', 'public/CNAME', 'static/CNAME']) {
    const file = join(root, cname);
    if (existsSync(file)) {
      const o = toOrigin(readFileSync(file, 'utf8').split('\n')[0]);
      if (o) found.push(o);
    }
  }
  return [...new Set(found)];
}
