import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SERVER_PACKAGE as MCP_PACKAGE } from '../versions';
const MCP_SERVER_NAME = 'grabby';

function log(msg: string): void {
  console.log(`\x1b[36m[grabby]\x1b[0m ${msg}`);
}

function warn(msg: string): void {
  console.log(`\x1b[33m[grabby]\x1b[0m ${msg}`);
}

function success(msg: string): void {
  console.log(`\x1b[32m[grabby]\x1b[0m ${msg}`);
}

function getMcpServerEntry(): { type: string; command: string; args: string[] } {
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    return {
      type: 'stdio',
      command: 'cmd',
      args: ['/c', 'npx', '-y', MCP_PACKAGE, 'mcp'],
    };
  }
  return {
    type: 'stdio',
    command: 'npx',
    args: ['-y', MCP_PACKAGE, 'mcp'],
  };
}

export async function addMcp(): Promise<void> {
  log('Adding grabby MCP server...\n');

  const mcpJsonPath = join(process.cwd(), '.mcp.json');
  let config: Record<string, unknown> = {};

  if (existsSync(mcpJsonPath)) {
    try {
      config = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'));
    } catch {
      // Never clobber a file we can't read: it may hold other servers' config.
      warn('.mcp.json exists but is not valid JSON; leaving it alone. Add this entry by hand:');
      console.log(JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: getMcpServerEntry() } }, null, 2));
      return;
    }
  }

  const servers = (config.mcpServers as Record<string, unknown>) ?? {};
  servers[MCP_SERVER_NAME] = getMcpServerEntry();
  config.mcpServers = servers;

  writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2) + '\n');
  success('Added grabby MCP server to .mcp.json');

  console.log('');
  console.log('  It also collects comments from your app on http://localhost:3456.');
  console.log("  Point Grabby at it:  initGrabby({ server: 'http://localhost:3456' })");
  console.log('');
  console.log('  \x1b[1mRestart your editor\x1b[0m to activate the MCP connection.');
  console.log('  When prompted, \x1b[1mapprove the MCP server\x1b[0m in your editor.');
  console.log('');
}
