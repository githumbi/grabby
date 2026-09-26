import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { loadConfig, initConfig, publicConfigProblem, type ServerConfig } from './config';
import { CommentStore } from './store';
import { createGrabbyServer, SERVER_VERSION } from './http';
import { LocalSource, RemoteSource, type CommentSource } from './source';
import { runMcp } from './mcp';
import { pull } from './pull';

const HELP = `grabby-server ${SERVER_VERSION}: collects Grabby UI comments and serves them to you and your AI agent.

Usage
  grabby-server [start]       Run the collector (localhost only unless --public)
  grabby-server init          Create a config with a public key and an admin token
  grabby-server mcp           Run as an MCP server for Claude Code, Cursor, etc.
  grabby-server pull          Print open comments for your AI agent, then resolve them

Common options
  --data-dir <dir>            Where comments and screenshots live (default ~/.grabby)
  --config <file>             Config file (default <data-dir>/config.json)
  --port <n>                  Default 3456
  --host <addr>               Default 127.0.0.1 (0.0.0.0 with --public)

start
  --public                    Accept comments from your deployed site. Refuses to
                              start without keys and an allowedOrigins list.

init
  --origin <url>              A site allowed to send comments (repeatable)
  --name <text>               Project name
  --force                     Replace an existing config (new keys!)

mcp / pull
  --server <url>              Read from a deployed server instead of this machine
  --token <sk_…>              Its admin token (or GRABBY_ADMIN_TOKEN)

pull
  --level compact|standard|detailed   Default standard
  --format md|json            Default md
  --keep                      Leave comments open after printing
  --delete                    Delete comments after printing
  --out <file>                Write to a file instead of stdout
  --screenshots <dir>         Save screenshots here (default ./.grabby/screenshots)
  --no-screenshots
`;

function fail(message: string): never {
  console.error(`grabby-server: ${message}`);
  process.exit(1);
}

async function start(config: ServerConfig): Promise<void> {
  if (config.public) {
    const problem = publicConfigProblem(config);
    if (problem) fail(`--public needs ${problem}.`);
  }
  const store = new CommentStore(config.dataDir);
  const http = createGrabbyServer(config, store);
  const { host, port } = await http.listen().catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') fail(`port ${config.port} is already in use (another grabby-server?). Use --port.`);
    throw err;
  });
  const shown = host === '0.0.0.0' ? 'localhost' : host;
  console.error(`[grabby] collecting comments on http://${shown}:${port} (${config.public ? 'public' : 'local only'})`);
  console.error(`[grabby] data: ${config.dataDir}`);
  if (!config.public) {
    console.error(`[grabby] in your app: initGrabby({ server: 'http://localhost:${port}' })`);
  }
  const stop = () => { void http.close().then(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

function sourceFor(values: Record<string, unknown>, config: ServerConfig): CommentSource {
  const remote = (values.server as string | undefined) || process.env.GRABBY_SERVER;
  if (remote) return new RemoteSource(remote, (values.token as string | undefined) || process.env.GRABBY_ADMIN_TOKEN || config.adminToken);
  return new LocalSource(new CommentStore(config.dataDir));
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'data-dir': { type: 'string' },
      config: { type: 'string' },
      port: { type: 'string' },
      host: { type: 'string' },
      public: { type: 'boolean' },
      origin: { type: 'string', multiple: true },
      name: { type: 'string' },
      force: { type: 'boolean' },
      server: { type: 'string' },
      token: { type: 'string' },
      level: { type: 'string' },
      format: { type: 'string' },
      keep: { type: 'boolean' },
      delete: { type: 'boolean' },
      out: { type: 'string' },
      screenshots: { type: 'string' },
      'no-screenshots': { type: 'boolean' },
      ids: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (values.version) { console.log(SERVER_VERSION); return; }
  const command = positionals[0] ?? 'start';
  if (values.help || command === 'help') { console.log(HELP); return; }

  const load = () => loadConfig({
    dataDir: values['data-dir'],
    config: values.config,
    port: values.port ? Number(values.port) : undefined,
    host: values.host,
    public: values.public,
  });

  switch (command) {
    case 'start':
      return start(load());

    case 'init': {
      const { file, config, created } = initConfig({
        dataDir: values['data-dir'],
        config: values.config,
        name: values.name,
        origins: values.origin,
        force: values.force,
      });
      const project = config.projects[0];
      console.log(created ? `Created ${file}` : `${file} already exists (use --force to replace it and its keys)`);
      console.log(`
Project key (public, goes in your site):  ${project?.publicKey}
Admin token (secret, for pull/MCP):       ${config.adminToken}

1. Add the sites that may send comments:  grabby-server init --force --origin https://your-site.com
   (or set GRABBY_ALLOWED_ORIGINS when deploying)
2. Deploy and run:                         grabby-server start --public
3. In your site:
     initGrabby({ mode: 'live', server: 'https://feedback.your-site.com', projectKey: '${project?.publicKey}' })
4. Share a feedback link:                  https://your-site.com/?grabby=${project?.publicKey}
5. Pull comments for your AI agent:        grabby-server pull --server https://feedback.your-site.com --token <admin token>`);
      return;
    }

    case 'mcp': {
      const config = load();
      const remote = sourceFor(values, config);
      if (remote instanceof RemoteSource) return runMcp(remote);
      // Locally, collect browser comments in the same process when the port
      // is free, so one MCP entry is all a local setup needs. If another
      // collector already owns the port, read its data dir fresh each time.
      const store = new CommentStore(config.dataDir);
      const http = createGrabbyServer(config, store);
      const owned = await http.listen().then(
        ({ port }) => { console.error(`[grabby] also collecting on http://localhost:${port}`); return true; },
        () => { console.error(`[grabby] port ${config.port} busy; reading the running collector's data`); return false; },
      );
      return runMcp(new LocalSource(store, !owned));
    }

    case 'pull': {
      const config = load();
      const source = sourceFor(values, config);
      const level = (['compact', 'standard', 'detailed'] as const).find((l) => l === values.level) ?? 'standard';
      if (values.keep && values.delete) fail('use either --keep or --delete, not both');
      const result = await pull(source, {
        level,
        format: values.format === 'json' ? 'json' : 'md',
        after: values.delete ? 'delete' : values.keep ? 'keep' : 'resolve',
        screenshotsDir: values['no-screenshots'] ? false : values.screenshots,
        includeIds: values.ids,
      });
      if (result.count === 0) {
        console.error('[grabby] no open comments');
        return;
      }
      if (values.out) await writeFile(values.out, `${result.text}\n`);
      else process.stdout.write(`${result.text}\n`);
      const after = values.delete ? 'deleted' : values.keep ? 'left open' : 'marked resolved';
      console.error(`[grabby] ${result.count} comment${result.count === 1 ? '' : 's'}${result.screenshots ? `, ${result.screenshots} screenshot${result.screenshots === 1 ? '' : 's'}` : ''} (${after})${values.out ? ` → ${values.out}` : ''}`);
      return;
    }

    default:
      fail(`unknown command "${command}". Run grabby-server --help.`);
  }
}

main().catch((err) => fail((err as Error).message));
