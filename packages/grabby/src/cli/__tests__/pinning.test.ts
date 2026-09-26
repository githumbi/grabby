import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { cdnScriptTag } from '../commands/init';
import { addMcp } from '../commands/add-mcp';
import { GRABBY_VERSION, SERVER_PACKAGE } from '../versions';

const EXACT = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

/** A version range here would let one bad publish reach every user at once. */
describe('generated commands pin exact versions', () => {
  let dir = '';
  const cwd = process.cwd();
  afterEach(() => {
    process.chdir(cwd);
    if (dir) rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('knows both package versions', () => {
    const own = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).version;
    const server = JSON.parse(readFileSync(new URL('../../../../server/package.json', import.meta.url), 'utf8')).version;
    expect(GRABBY_VERSION).toBe(own);
    expect(SERVER_PACKAGE).toBe(`@githumbi/grabby-server@${server}`);
    expect(server).toMatch(EXACT);
  });

  it('writes an MCP entry that runs one exact collector version', async () => {
    dir = mkdtempSync(join(tmpdir(), 'grabby-mcp-'));
    process.chdir(dir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await addMcp();
    const entry = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8')).mcpServers.grabby;
    expect(entry.args).toContain(SERVER_PACKAGE);
    expect(entry.args.join(' ')).not.toMatch(/grabby-server(@\d+)?(\s|$)/);
  });

  it('pins the CDN script tag to this version', () => {
    const tag = cdnScriptTag({ server: 'https://feedback.test', projectKey: 'pk_x' });
    expect(tag).toContain(`/npm/@githumbi/grabby@${GRABBY_VERSION}/dist/loader.global.js`);
    expect(tag).toContain('data-mode="live"');
  });
});
