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
