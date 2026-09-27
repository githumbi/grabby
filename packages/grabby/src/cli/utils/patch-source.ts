/*
 * Small, conservative source edits. Each patch either applies cleanly to a
 * recognisable pattern or declines, so `grabby init` never writes a guess;
 * when it declines, init prints the lines to add by hand instead.
 */

export type PatchResult =
  | { status: 'patched'; code: string }
  | { status: 'already' }
  | { status: 'unrecognised'; reason: string };

/** Index just after the last top-level import statement (0 when there are none). */
function afterImports(code: string): number {
  const re = /^import\s[^;]*?(?:from\s+)?['"][^'"]+['"];?[ \t]*$/gm;
  let end = 0;
  for (let m = re.exec(code); m; m = re.exec(code)) end = m.index + m[0].length;
  return end;
}

function insertImport(code: string, statement: string): string {
  const at = afterImports(code);
  if (at === 0) return `${statement}\n${code}`;
  return `${code.slice(0, at)}\n${statement}${code.slice(at)}`;
}

/** Adds `grabby.vite()` first in the `plugins: [...]` array of a Vite config. */
export function patchViteConfig(code: string): PatchResult {
  if (code.includes('@githumbi/grabby/plugin')) return { status: 'already' };
  const plugins = /plugins\s*:\s*\[/.exec(code);
  if (!plugins) return { status: 'unrecognised', reason: 'no `plugins: [ … ]` array found' };
  const at = plugins.index + plugins[0].length;
  // First, so it stamps source before framework plugins compile it.
  const withPlugin = `${code.slice(0, at)}grabby.vite(), ${code.slice(at)}`;
  return { status: 'patched', code: insertImport(withPlugin, "import grabby from '@githumbi/grabby/plugin';") };
}

/** Starts Grabby in the app's entry file, in development builds only. */
export function patchEntry(code: string, options: { live?: { server: string; projectKey: string } } = {}): PatchResult {
  if (code.includes('@githumbi/grabby')) return { status: 'already' };
  const at = afterImports(code);
  if (at === 0 && /\bimport\b/.test(code.slice(0, 200))) {
    return { status: 'unrecognised', reason: 'could not find where the imports end' };
  }
  const call = options.live
    ? `initGrabbyLive({ server: ${JSON.stringify(options.live.server)}, projectKey: ${JSON.stringify(options.live.projectKey)} });`
    : 'if (import.meta.env.DEV) initGrabby();';
  const imp = options.live
    ? "import { initGrabbyLive } from '@githumbi/grabby/live';"
    : "import { initGrabby } from '@githumbi/grabby';";
  const withImport = insertImport(code, imp);
  const afterAll = afterImports(withImport);
  return { status: 'patched', code: `${withImport.slice(0, afterAll)}\n\n${call}${withImport.slice(afterAll)}` };
}

/**
 * Swaps the Angular builders for Grabby's, editing the builder strings in
 * place so angular.json keeps its formatting (and any comments).
 */
export function patchAngularJson(code: string): PatchResult {
  if (code.includes('@githumbi/grabby:')) return { status: 'already' };
  const next = code
    .replace(/"@angular(?:-devkit\/build-angular|\/build):application"/g, '"@githumbi/grabby:application"')
    .replace(/"@angular(?:-devkit\/build-angular|\/build):dev-server"/g, '"@githumbi/grabby:dev-server"');
  if (next === code) {
    return { status: 'unrecognised', reason: 'no @angular/build:application or :dev-server builder found (Angular 17+ is required)' };
  }
  return { status: 'patched', code: next };
}

/** Adds provideGrabby() to the providers array of app.config.ts. */
export function patchAngularAppConfig(code: string): PatchResult {
  if (code.includes('provideGrabby')) return { status: 'already' };
  const providers = /providers\s*:\s*\[/.exec(code);
  if (!providers) return { status: 'unrecognised', reason: 'no `providers: [ … ]` array found' };
  const at = providers.index + providers[0].length;
  const withProvider = `${code.slice(0, at)}provideGrabby(), ${code.slice(at)}`;
  return { status: 'patched', code: insertImport(withProvider, "import { provideGrabby } from '@githumbi/grabby/angular';") };
}

/** The live-feedback script tag: the loader, pinned and hashed, plus where comments go. */
export interface LiveTag {
  src: string;
  /** SRI for the loader itself. */
  integrity?: string | null;
  /** SRI for the full build the loader fetches. */
  dataIntegrity?: string | null;
  server: string;
  projectKey: string;
}

export type TagStyle = 'html' | 'astro' | 'jsx' | 'next-script';

function tagAttrs(tag: LiveTag, style: TagStyle): string[] {
  const jsx = style === 'jsx' || style === 'next-script';
  const q = (v: string) => JSON.stringify(v);
  return [
    `src=${q(tag.src)}`,
    ...(tag.integrity ? [`integrity=${q(tag.integrity)}`, jsx ? 'crossOrigin="anonymous"' : 'crossorigin="anonymous"'] : []),
    ...(tag.dataIntegrity ? [`data-integrity=${q(tag.dataIntegrity)}`] : []),
    'data-mode="live"',
    `data-server=${q(tag.server)}`,
    `data-project-key=${q(tag.projectKey)}`,
    style === 'next-script' ? 'strategy="afterInteractive"' : 'defer',
    // Astro leaves an is:inline script exactly as written instead of bundling it.
    ...(style === 'astro' ? ['is:inline'] : []),
  ];
}

export function renderTag(tag: LiveTag, style: TagStyle, indent = '', name = style === 'next-script' ? 'Script' : 'script'): string {
  const attrs = tagAttrs(tag, style).map((a) => `${indent}  ${a}`).join('\n');
  return style === 'next-script' ? `<${name}\n${attrs}\n${indent}/>` : `<${name}\n${attrs}\n${indent}></${name}>`;
}

/** An existing Grabby loader tag, <script …> or <Script …>, self-closing or not. */
const EXISTING_TAG = /<(script|Script)\b(?=[^>]*@githumbi\/grabby@[^"'\s>]*\/dist\/loader\.global\.js)[^>]*?(?:\/>|>\s*<\/\1>)/;

function indentAt(code: string, index: number): string {
  const lineStart = code.lastIndexOf('\n', index - 1) + 1;
  return /^[ \t]*/.exec(code.slice(lineStart, index))?.[0] ?? '';
}

/**
 * Puts the live-feedback loader in a page: rewrites an existing Grabby tag in
 * place (new version, server or key), or adds one before the only </body>.
 * `next-app` is an App Router layout (next/script); `jsx` is any other JSX
 * file with a raw <script> (e.g. pages/_document); `html` is an HTML file;
 * `astro` is an Astro layout (is:inline, so Astro doesn't bundle it).
 */
export function patchLoaderTag(code: string, tag: LiveTag, kind: 'html' | 'astro' | 'jsx' | 'next-app'): PatchResult {
  const existing = EXISTING_TAG.exec(code);
  if (existing) {
    const name = existing[1];
    const style: TagStyle = name === 'Script' ? 'next-script' : kind === 'html' || kind === 'astro' ? kind : 'jsx';
    const next = renderTag(tag, style, indentAt(code, existing.index), name);
    if (next === existing[0]) return { status: 'already' };
    return { status: 'patched', code: code.slice(0, existing.index) + next + code.slice(existing.index + existing[0].length) };
  }

  const bodies = code.split('</body>').length - 1;
  if (bodies !== 1) return { status: 'unrecognised', reason: bodies ? 'more than one </body>' : 'no </body> found' };
  const at = code.indexOf('</body>');
  const indent = `${indentAt(code, at)}  `;

  if (kind !== 'next-app') {
    const withTag = `${code.slice(0, at)}  ${renderTag(tag, kind, indent)}\n${indentAt(code, at)}${code.slice(at)}`;
    return { status: 'patched', code: withTag };
  }

  const imported = /import\s+(\w+)\s+from\s+['"]next\/script['"]/.exec(code);
  const name = imported?.[1] ?? 'Script';
  const withTag = `${code.slice(0, at)}  ${renderTag(tag, 'next-script', indent, name)}\n${indentAt(code, at)}${code.slice(at)}`;
  return { status: 'patched', code: imported ? withTag : insertImport(withTag, 'import Script from "next/script";') };
}
