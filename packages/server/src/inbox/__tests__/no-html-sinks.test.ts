import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

describe('inbox source', () => {
  it('never parses strings as HTML', () => {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'generated.ts')) {
      // Comments may say "no innerHTML"; only code counts.
      const code = readFileSync(path.join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment/);
    }
  });
});
