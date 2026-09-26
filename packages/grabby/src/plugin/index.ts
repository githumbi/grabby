import path from 'node:path';
import { createUnplugin } from 'unplugin';
import { stampJsx } from './jsx';
import { stampVue } from './vue';

export interface GrabbyPluginOptions {
  /** Paths are stamped relative to this. Default: the bundler's project root */
  rootDir?: string;
  /** Files to stamp. Default: .jsx, .tsx and .vue */
  include?: RegExp;
  /** Files to leave alone. Default: /node_modules/ */
  exclude?: RegExp;
  /** Attribute to stamp. Default: "data-grabby-loc" */
  attribute?: string;
  /**
   * Also stamp production builds. Off by default, since stamps expose source
   * paths in the page; turn it on when collecting feedback on a deployed
   * site and you want comments to carry file:line.
   */
  includeSourceInBuild?: boolean;
}

const DEFAULT_INCLUDE = /\.(jsx|tsx|vue)$/;
const DEFAULT_EXCLUDE = /[\\/]node_modules[\\/]/;

function isProduction(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
}

/**
 * Adds a `data-grabby-loc="file:line:col"` attribute to every element in
 * JSX/TSX and Vue templates so Grabby can say exactly where an element was
 * written. Svelte needs nothing (its dev build carries locations already)
 * and Angular uses the Grabby builders instead.
 */
export const unplugin = createUnplugin<GrabbyPluginOptions | undefined>((options = {}) => {
  // The bundler's own root beats cwd: dev servers are often started from
  // elsewhere (a monorepo root, an IDE), which would give ../../ paths.
  let rootDir = options.rootDir ?? process.cwd();
  const include = options.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;
  let enabled = options.includeSourceInBuild === true || !isProduction();

  const relative = (file: string) => path.relative(rootDir, file).split(path.sep).join('/');

  return {
    name: 'grabby-source',
    enforce: 'pre',

    transformInclude(id) {
      if (!enabled) return false;
      const [file, query] = id.split('?');
      if (!include.test(file) || exclude.test(file)) return false;
      // Vue sub-requests (?vue&type=style…) are blocks of a file we've already stamped.
      if (file.endsWith('.vue') && query) return false;
      return true;
    },

    async transform(code, id) {
      const file = id.split('?')[0];
      if (file.endsWith('.vue')) return stampVue(code, relative(file), options.attribute);
      return stampJsx(code, file, rootDir, options.attribute);
    },

    vite: {
      configResolved(config) {
        enabled = options.includeSourceInBuild === true || config.command === 'serve';
        if (!options.rootDir) rootDir = config.root;
      },
    },
    webpack(compiler) {
      enabled = options.includeSourceInBuild === true || compiler.options.mode !== 'production';
      if (!options.rootDir && compiler.context) rootDir = compiler.context;
    },
    rspack(compiler) {
      enabled = options.includeSourceInBuild === true || compiler.options.mode !== 'production';
      if (!options.rootDir && compiler.context) rootDir = compiler.context;
    },
  };
});

/** `plugins: [grabby.vite(), react()]` */
export const vite = unplugin.vite;
/** `plugins: [grabby.webpack()]` (Next.js: in `next.config.js` → webpack) */
export const webpack = unplugin.webpack;
export const rspack = unplugin.rspack;
export const rollup = unplugin.rollup;
export const rolldown = unplugin.rolldown;
export const esbuild = unplugin.esbuild;

export { stampJsx } from './jsx';
export { stampVue } from './vue';

export default { vite, webpack, rspack, rollup, rolldown, esbuild };
