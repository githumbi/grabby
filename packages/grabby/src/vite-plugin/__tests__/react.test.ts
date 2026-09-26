import { describe, it, expect } from 'vitest';
import { grabbyReactVitePlugin } from '../react';

type TransformFn = (code: string, id: string) => Promise<{ code: string } | null>;

function transformer(options = {}): TransformFn {
  const plugin = grabbyReactVitePlugin({ rootDir: '/app', ...options });
  return (plugin.transform as unknown as TransformFn).bind(plugin);
}

describe('grabbyReactVitePlugin', () => {
  it('runs before the react plugin', () => {
    expect(grabbyReactVitePlugin().enforce).toBe('pre');
  });

  it('has no apply, so it runs for builds as well as dev', () => {
    expect(grabbyReactVitePlugin().apply).toBeUndefined();
  });

  it('stamps a tsx file and keeps the JSX intact', async () => {
    const result = await transformer()(
      'export const A = () => <div className="x">hi</div>;',
      '/app/src/A.tsx',
    );
    expect(result?.code).toContain('data-grabby-loc="src/A.tsx:1:24"');
    expect(result?.code).toContain('<div');
  });

  it('preserves type annotations', async () => {
    const result = await transformer()(
      'export const A = (p: { n: number }) => <div>{p.n}</div>;',
      '/app/src/A.tsx',
    );
    expect(result?.code).toContain('p: {');
  });

  it('returns a source map', async () => {
    const plugin = grabbyReactVitePlugin({ rootDir: '/app' });
    const out = await (plugin.transform as unknown as (c: string, i: string) => Promise<{ map: unknown } | null>)
      .call(plugin, 'const a = <div />;', '/app/src/A.tsx');
    expect(out?.map).toBeTruthy();
  });

  it('skips files without JSX extensions', async () => {
    expect(await transformer()('const a = 1 < 2;', '/app/src/util.ts')).toBeNull();
  });

  it('skips node_modules', async () => {
    expect(await transformer()('const a = <div />;', '/app/node_modules/x/i.jsx')).toBeNull();
  });

  it('skips files with no angle bracket at all', async () => {
    expect(await transformer()('export const a = 1;', '/app/src/A.tsx')).toBeNull();
  });

  it('ignores a query suffix on the module id', async () => {
    const result = await transformer()('const a = <div />;', '/app/src/A.tsx?t=123');
    expect(result?.code).toContain('data-grabby-loc');
  });

  it('handles a plain jsx file', async () => {
    const result = await transformer()('const a = <div />;', '/app/src/A.jsx');
    expect(result?.code).toContain('data-grabby-loc="src/A.jsx:1:11"');
  });
});
