import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initConfig, loadConfig } from '../config';

describe('loadConfig host', () => {
  const dirs: string[] = [];
  const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), 'grabby-cfg-')); dirs.push(d); return d; };
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

  it('init leaves host and port out of the file, so --public listens on all interfaces', () => {
    const dataDir = tmp();
    initConfig({ dataDir, origins: ['https://shop.example'] });
    const onDisk = JSON.parse(readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
    expect(onDisk.host).toBeUndefined();
    expect(onDisk.port).toBeUndefined();
    expect(loadConfig({ dataDir, public: true }).host).toBe('0.0.0.0');
    expect(loadConfig({ dataDir }).host).toBe('127.0.0.1');
  });

  it('treats a loopback host saved by older versions as the default when public', () => {
    const dataDir = tmp();
    writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ version: 1, host: '127.0.0.1', port: 3456, adminToken: 'x', projects: [] }));
    expect(loadConfig({ dataDir, public: true }).host).toBe('0.0.0.0');
    writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ version: 1, host: '10.0.0.5', projects: [] }));
    expect(loadConfig({ dataDir, public: true }).host).toBe('10.0.0.5');
  });
});
