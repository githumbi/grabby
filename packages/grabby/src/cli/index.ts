import { parseArgs } from 'util';
import { init } from './commands/init';
import { addMcp } from './commands/add-mcp';
import { share } from './commands/share';
import { openInbox } from './commands/inbox';
import { alerts } from './commands/alerts';
import { runServer } from './utils/server-cli';

const HELP = `Grabby: point at any UI element, leave a comment, hand it to your AI agent.

Usage
  npx @githumbi/grabby init    Set up Grabby for local development (asks before changing files)
      --yes                    Apply without asking
      --dry-run                Only show what would change
      --no-install             Don't install the package

  npx @githumbi/grabby share   Get feedback from others on your live site. Sets up a
                               collector in your own free Cloudflare account, adds the
                               script to your site, and gives you a feedback link and
                               a private inbox. Safe to re-run.
      --origin <url>           Your site's address (repeatable; asked if missing)
      --server <url> --token <sk_…>
                               Use a collector you run yourself instead
      --slack <webhook>        Post new feedback to Slack
      --rotate                 Replace the private inbox link
      --rotate-admin           Replace the admin token
      --no-localhost           Don't accept comments from your local dev server
      --no-mcp                 Don't add the MCP server to .mcp.json
      --yes, --dry-run

  npx @githumbi/grabby inbox   Open your private feedback inbox (--print to only show the link)
  npx @githumbi/grabby pull    Print open comments for your AI agent, then mark them resolved
  npx @githumbi/grabby alerts  --slack <webhook> | --webhook <url> | --off | --test
  npx @githumbi/grabby add mcp Let your AI agent read comments over MCP (.mcp.json)
`;

function fail(err: unknown): never {
  console.error('\x1b[31mError:\x1b[0m', err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const argv = process.argv.slice(2);
const [command, subcommand] = argv;

if (command === 'pull') {
  // The collector owns pulling; forward to it so there's one implementation.
  // It reads .grabby/config.json (from `share`), so no flags are needed.
  runServer(['pull', ...argv.slice(1)]).then(({ code }) => process.exit(code)).catch(fail);
} else if (command === 'share') {
  const { values } = parseArgs({
    args: argv.slice(1),
    options: {
      origin: { type: 'string', multiple: true },
      server: { type: 'string' },
      token: { type: 'string' },
      slack: { type: 'string' },
      rotate: { type: 'boolean' },
      'rotate-admin': { type: 'boolean' },
      'no-localhost': { type: 'boolean' },
      'no-mcp': { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      'dry-run': { type: 'boolean' },
    },
  });
  share({
    origins: values.origin,
    server: values.server,
    token: values.token,
    slack: values.slack,
    rotate: values.rotate,
    rotateAdmin: values['rotate-admin'],
    noLocalhost: values['no-localhost'],
    noMcp: values['no-mcp'],
    yes: values.yes,
    dryRun: values['dry-run'],
  }).catch(fail);
} else if (command === 'inbox') {
  openInbox({ print: argv.includes('--print') }).catch(fail);
} else if (command === 'alerts') {
  const { values } = parseArgs({
    args: argv.slice(1),
    options: { slack: { type: 'string' }, webhook: { type: 'string' }, off: { type: 'boolean' }, test: { type: 'boolean' } },
  });
  alerts(values).catch(fail);
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
