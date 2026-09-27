import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadConfig, initConfig, publicConfigProblem, type ServerConfig } from './config';
import { CommentStore } from './store';
import { createGrabbyServer, SERVER_VERSION } from './http';
import { LocalSource, RemoteSource, type CommentSource } from './source';
import { runMcp } from './mcp';
import { pull } from './pull';
import { findProjectFile } from './project-config';
import { deployCloudflare, npxWrangler, readDeployConfig } from './deploy/cloudflare';

const HELP = `grabby-server ${SERVER_VERSION}: collects Grabby UI comments and serves them to you and your AI agent.

Usage
  grabby-server [start]       Run the collector (localhost only unless --public)
  grabby-server init          Create a config with a public key and an admin token
  grabby-server mcp           Run as an MCP server for Claude Code, Cursor, etc.
  grabby-server pull          Print open comments for your AI agent, then resolve them
  grabby-server deploy cloudflare
                              Put the collector in your own free Cloudflare account
                              (usually run for you by \`npx @githumbi/grabby share\`)

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
                              Both default to .grabby/config.json, written by \`grabby share\`

deploy cloudflare
  --origin <url>              A site allowed to send comments (repeatable)
  --name <text>               Worker and database name (default grabby-<folder>)
  --key <pk_…>                Keep this project key
  --rotate-admin              Replace the admin token
  --dir <dir>                 Where to keep the wrangler config (default .grabby/cloudflare)
  --json                      Print the result as one JSON line
  --out <file>                Write the JSON result to a file instead (owner-only)
  The current admin token, if any, is read from GRABBY_ADMIN_TOKEN.

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
  } else {
    console.error('[grabby] connect your site (adds the script and an inbox link):');
    console.error('[grabby]   npx @githumbi/grabby share --server https://<this collector> --token <admin token>');
  }
  const stop = () => { void http.close().then(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

/**
 * Where comments are read from: --server/--token, then GRABBY_SERVER and
 * GRABBY_ADMIN_TOKEN, then the project's .grabby/config.json (from
 * `grabby share`), and otherwise the collector on this machine.
 */
function sourceFor(values: Record<string, unknown>, config: ServerConfig): CommentSource {
  const token = (values.token as string | undefined) || process.env.GRABBY_ADMIN_TOKEN;
  const remote = (values.server as string | undefined) || process.env.GRABBY_SERVER;
  if (remote) return new RemoteSource(remote, token || config.adminToken);
  const project = findProjectFile();
  if (project) return new RemoteSource(project.config.server, token || project.config.adminToken || '');
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
      key: { type: 'string' },
      'rotate-admin': { type: 'boolean' },
      dir: { type: 'string' },
      json: { type: 'boolean' },
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
2. Deploy and run behind HTTPS:           grabby-server start --public
3. Connect your site (script tag, inbox link, settings):
     npx @githumbi/grabby share --server https://feedback.your-site.com --token <admin token>

Easier: skip all this and run \`npx @githumbi/grabby share\` in your site's folder.
It sets up the collector in your own free Cloudflare account.`);
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

    case 'deploy': {
      if (positionals[1] !== 'cloudflare') fail('usage: grabby-server deploy cloudflare --origin https://your-site.com');
      const workDir = path.resolve(values.dir ?? path.join('.grabby', 'cloudflare'));
      const previous = readDeployConfig(workDir);
      const result = await deployCloudflare({
        workDir,
        name: values.name ?? previous?.name,
        origins: values.origin?.length ? values.origin : previous?.origins ?? [],
        projectKey: values.key ?? previous?.projectKey,
        adminToken: process.env.GRABBY_ADMIN_TOKEN,
        rotateAdmin: values['rotate-admin'],
      }, npxWrangler());
      if (values.out) {
        // For `grabby share`: stdout stays on the terminal so Wrangler can ask questions.
        writeFileSync(values.out, JSON.stringify(result), { mode: 0o600 });
      } else if (values.json) {
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } else {
        console.log(`\nCollector: ${result.url}\nProject key: ${result.projectKey}`);
        if (result.adminToken) console.log(`Admin token (secret, shown once): ${result.adminToken}`);
      }
      return;
    }

    default:
      fail(`unknown command "${command}". Run grabby-server --help.`);
  }
}

main().catch((err) => fail((err as Error).message));
