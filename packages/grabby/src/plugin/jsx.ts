import { grabbyBabelPlugin } from '../babel-plugin';

let babel: typeof import('@babel/core') | null = null;

/**
 * Re-emits JSX with a `data-grabby-loc` stamp on every element. It runs its
 * own Babel pass and leaves the JSX in place, so whatever compiles JSX next
 * (Babel, SWC, Oxc, esbuild, Solid's compiler) is unaffected.
 */
export async function stampJsx(code: string, file: string, rootDir: string, attribute?: string) {
  if (!code.includes('<')) return null;
  babel ??= await import('@babel/core');
  const typescript = /\.tsx?$/.test(file);
  const result = await babel.transformAsync(code, {
    filename: file,
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    compact: false,
    parserOpts: { plugins: typescript ? ['jsx', 'typescript', 'decorators-legacy'] : ['jsx'] },
    plugins: [grabbyBabelPlugin({ rootDir, attribute })],
  });
  if (!result?.code) return null;
  return { code: result.code, map: result.map };
}
