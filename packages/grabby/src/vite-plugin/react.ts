import type { Plugin } from 'vite';
import { grabbyBabelPlugin, type GrabbyBabelOptions } from '../babel-plugin';

export interface GrabbyReactViteOptions extends GrabbyBabelOptions {
  /** Files to stamp. Default: /\.[jt]sx$/ */
  include?: RegExp;
  /** Files to leave alone. Default: /node_modules/ */
  exclude?: RegExp;
}

/**
 * Stamps JSX with source locations for grabby's React resolver.
 *
 * Runs its own Babel pass with `enforce: 'pre'` and emits JSX again, so it
 * works whichever compiler @vitejs/plugin-react is using underneath — v6
 * moved from Babel to Oxc and no longer takes Babel plugins.
 *
 *   plugins: [grabbyReactVitePlugin({ rootDir: import.meta.dirname }), react()]
 *
 * It has no `apply`, so it also runs for production builds. That's deliberate:
 * grabbing feedback on a deployed site needs the stamps to survive the build.
 */
export function grabbyReactVitePlugin(options: GrabbyReactViteOptions = {}): Plugin {
  const include = options.include ?? /\.[jt]sx$/;
  const exclude = options.exclude ?? /node_modules/;
  let babel: typeof import('@babel/core') | null = null;

  return {
    name: 'grabby-react-source',
    enforce: 'pre',
    async transform(code: string, id: string) {
      const file = id.split('?')[0];
      if (!include.test(file) || exclude.test(file)) return null;
      if (!code.includes('<')) return null;

      babel ??= await import('@babel/core');

      const typescript = /\.tsx?$/.test(file);
      const result = await babel.transformAsync(code, {
        filename: file,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        compact: false,
        parserOpts: { plugins: typescript ? ['jsx', 'typescript'] : ['jsx'] },
        plugins: [
          grabbyBabelPlugin({ rootDir: options.rootDir, attribute: options.attribute }),
        ],
      });

      if (!result?.code) return null;
      return { code: result.code, map: result.map };
    },
  };
}

export default grabbyReactVitePlugin;
