import { spawn } from 'child_process';
import { parseArgs } from 'util';
import { init } from './commands/init';
import { addMcp } from './commands/add-mcp';

const HELP = `Grabby: point at any UI element, leave a comment, hand it to your AI agent.

Usage
  npx grabby init              Set up Grabby in this project (asks before changing files)
      --yes                    Apply without asking
      --dry-run                Only show what would change
      --no-install             Don't install the package
      --live --server <url> --key <pk_…>
                               Set up live-site feedback instead of local dev mode
  npx grabby add mcp           Let your AI agent read comments over MCP (.mcp.json)
  npx grabby pull [options]    Print collected comments for your agent (runs grabby-server pull)
`;

function fail(err: unknown): never {
  console.error('\x1b[31mError:\x1b[0m', err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const argv = process.argv.slice(2);
const [command, subcommand] = argv;

if (command === 'pull') {
  // The collector owns pulling; forward to it so there's one implementation.
  const args = ['-y', '@githumbi/grabby-server@0', 'pull', ...argv.slice(1)];
  const windows = process.platform === 'win32';
  // npx is a .cmd on Windows, which Node only runs through a shell. Only
  // pass plain flag/value characters so nothing can be interpreted by it.
  if (windows && !args.every((a) => /^[\w@./:=,+-]+$/.test(a))) {
    fail(`unsupported characters in arguments; run it directly: npx ${args.join(' ')}`);
  }
  const child = spawn(windows ? 'npx.cmd' : 'npx', args, { stdio: 'inherit', shell: windows });
  child.on('exit', (code) => process.exit(code ?? 1));
} else if (command === 'add' && subcommand === 'mcp') {
  addMcp().catch(fail);
} else if (!command || command === 'init') {
  const { values } = parseArgs({
    args: argv.slice(command ? 1 : 0),
    options: {
      yes: { type: 'boolean', short: 'y' },
      'dry-run': { type: 'boolean' },
      'no-install': { type: 'boolean' },
      live: { type: 'boolean' },
      server: { type: 'string' },
      key: { type: 'string' },
    },
  });
  if (values.live && (!values.server || !values.key)) {
    fail('--live needs --server <collector url> and --key <project key> (from `npx @githumbi/grabby-server init`)');
  }
  init({
    yes: values.yes,
    dryRun: values['dry-run'],
    noInstall: values['no-install'],
    live: values.live ? { server: values.server!, projectKey: values.key! } : undefined,
  }).catch(fail);
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.log(HELP);
} else {
  console.error(`Unknown command: ${argv.join(' ')}\n`);
  console.log(HELP);
  process.exit(1);
}
