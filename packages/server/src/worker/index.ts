import { configFromEnv, publicConfigProblem } from '../core/config';
import { createHandler, type RequestHandler } from '../core/handler';
import { API_HEADERS, json } from '../core/http-util';
import { SERVER_VERSION } from '../core/version';
import { D1Storage } from './d1-storage';
import { INBOX } from '../inbox/generated';
import type { D1Database } from './d1';

export interface WorkerEnv {
  DB?: D1Database;
  GRABBY_PUBLIC_KEY?: string;
  GRABBY_ALLOWED_ORIGINS?: string;
  /** A Worker secret, set by `grabby-server deploy cloudflare`. */
  GRABBY_ADMIN_TOKEN?: string;
  GRABBY_SLACK_WEBHOOK?: string;
  GRABBY_WEBHOOK_URL?: string;
}

interface ExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}

/** D1 rows and BLOBs top out at 2,000,000 bytes; leave room for the row's other columns. */
const MAX_IMAGE_BYTES = 1_900_000;

let cached: { env: WorkerEnv; handle: RequestHandler | null; problem: string | null } | null = null;

function setup(env: WorkerEnv) {
  if (cached?.env === env) return cached;
  // Always public: a Worker is on the internet by definition.
  const { DB: _db, ...vars } = env;
  void _db;
  const config = configFromEnv({ ...vars, GRABBY_PUBLIC: '1' });
  const problem = !env.DB ? 'a D1 database bound as DB' : publicConfigProblem(config);
  const handle = problem ? null : createHandler(config, {
    storage: new D1Storage(env.DB!),
    limits: { maxImageBytes: MAX_IMAGE_BYTES },
    inbox: INBOX,
    alerts: { slack: env.GRABBY_SLACK_WEBHOOK, webhook: env.GRABBY_WEBHOOK_URL },
  });
  cached = { env, handle, problem };
  return cached;
}

function withApiHeaders(res: Response): Response {
  for (const [k, v] of Object.entries(API_HEADERS)) res.headers.set(k, v);
  return res;
}

export default {
  async fetch(req: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const { handle, problem } = setup(env);
    const url = new URL(req.url);
    if (!handle) {
      // Fail closed until `grabby-server deploy cloudflare` has set the keys.
      const body = { ok: false, version: SERVER_VERSION, public: true, configured: false, needs: problem };
      return withApiHeaders(json(url.pathname === '/health' ? 200 : 503, body));
    }
    return handle(req, {
      ip: req.headers.get('cf-connecting-ip') ?? 'unknown',
      loopback: false,
      host: url.host,
      origin: url.origin,
      waitUntil: (work) => ctx.waitUntil(work),
    });
  },
};
