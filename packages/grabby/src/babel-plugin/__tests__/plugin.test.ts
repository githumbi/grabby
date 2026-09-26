import { describe, it, expect } from 'vitest';
import { transformSync } from '@babel/core';
import { grabbyBabelPlugin } from '../index';

function transform(code: string, filename = '/app/src/pages/Dashboard.tsx'): string {
  const result = transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['jsx', 'typescript'] },
    plugins: [grabbyBabelPlugin({ rootDir: '/app' })],
  });
  return result?.code ?? '';
}

describe('grabbyBabelPlugin', () => {
  it('stamps a host element with a path relative to rootDir', () => {
    const out = transform('const a = <div>hi</div>;');
    expect(out).toContain('data-grabby-loc="src/pages/Dashboard.tsx:1:11"');
  });

  it('stamps component elements too, so the stamp rides the props spread', () => {
    const out = transform('const a = <Button>Save</Button>;');
    expect(out).toContain('data-grabby-loc="src/pages/Dashboard.tsx:1:11:Button"');
  });

  it('prepends the attribute so a later spread still wins', () => {
    const out = transform('const a = <button {...props} />;');
    expect(out.indexOf('data-grabby-loc')).toBeLessThan(out.indexOf('...props'));
  });

  it('records the line of each element', () => {
    const out = transform('const a = (\n  <div>\n    <span />\n  </div>\n);');
    expect(out).toContain('src/pages/Dashboard.tsx:2:3');
    expect(out).toContain('src/pages/Dashboard.tsx:3:5');
  });

  it('leaves fragments alone', () => {
    const out = transform('const a = <><div /></>;');
    expect(out.match(/data-grabby-loc/g)).toHaveLength(1);
  });

  it('skips React built-ins that take no DOM props', () => {
    const out = transform('const a = <Suspense><div /></Suspense>;');
    expect(out.match(/data-grabby-loc/g)).toHaveLength(1);
  });

  it('skips files in node_modules', () => {
    const out = transform('const a = <div />;', '/app/node_modules/lib/index.js');
    expect(out).not.toContain('data-grabby-loc');
  });

  it('does not stamp twice when a stamp is already present', () => {
    const out = transform('const a = <div data-grabby-loc="kept:1:1" />;');
    expect(out).toContain('kept:1:1');
    expect(out.match(/data-grabby-loc/g)).toHaveLength(1);
  });

  it('honours a custom attribute name', () => {
    const result = transformSync('const a = <div />;', {
      filename: '/app/src/App.tsx',
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: ['jsx'] },
      plugins: [grabbyBabelPlugin({ rootDir: '/app', attribute: 'data-where' })],
    });
    expect(result?.code).toContain('data-where="src/App.tsx:1:11"');
  });

  it('handles member-expression elements', () => {
    const out = transform('const a = <Card.Header />;');
    expect(out).toContain('data-grabby-loc');
  });
});

describe('component names in stamps', () => {
  it('records the name for components, not for native tags', async () => {
    const babel = await import('@babel/core');
    const { grabbyBabelPlugin } = await import('../index');
    const out = babel.transformSync('const a = <Table.Row><Card /><div /></Table.Row>;', {
      filename: '/app/src/A.jsx', babelrc: false, configFile: false,
      parserOpts: { plugins: ['jsx'] }, plugins: [grabbyBabelPlugin({ rootDir: '/app' })],
    })!.code!;
    expect(out).toContain('data-grabby-loc="src/A.jsx:1:11:Table.Row"');
    expect(out).toContain('data-grabby-loc="src/A.jsx:1:22:Card"');
    expect(out).toContain('data-grabby-loc="src/A.jsx:1:30"');
  });
});
