import { createServer, type Server } from 'node:http';
import type { ServerConfig } from './config';
import type { CommentStore } from './store';
import { createHandler, type HandlerDeps } from './core/handler';
import { FileStorage } from './node/file-storage';
import { peerOf, toRequest, writeResponse } from './node/bridge';
import { INBOX } from './inbox/generated';

export { SERVER_VERSION } from './core/version';

export interface GrabbyHttpServer {
  server: Server;
  listen(): Promise<{ host: string; port: number }>;
  close(): Promise<void>;
}

/** The collector on Node: the shared request handler behind node:http, storing to files. */
export function createGrabbyServer(config: ServerConfig, store: CommentStore, deps: Partial<HandlerDeps> = {}): GrabbyHttpServer {
  const pending = new Set<Promise<unknown>>();
  const handle = createHandler(config, {
    storage: new FileStorage(store),
    waitUntil: (work) => {
      const p = work.catch(() => {}).finally(() => pending.delete(p));
      pending.add(p);
    },
    inbox: INBOX,
    alerts: { slack: process.env.GRABBY_SLACK_WEBHOOK, webhook: process.env.GRABBY_WEBHOOK_URL },
    publicUrl: process.env.GRABBY_PUBLIC_URL,
    ...deps,
  });

  const server = createServer(async (req, res) => {
    try {
      await writeResponse(res, await handle(toRequest(req), peerOf(req)));
    } catch (err) {
      console.error('[grabby] request failed:', (err as Error).message);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"error":"Internal server error"}');
    }
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;

  return {
    server,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => {
        const addr = server.address();
        resolve({ host: config.host, port: typeof addr === 'object' && addr ? addr.port : config.port });
      });
    }),
    close: async () => {
      await Promise.allSettled([...pending]);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
