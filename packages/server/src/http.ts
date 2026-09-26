import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { formatExport, type DetailLevel } from '@githumbi/grabby/export';
import type { ServerConfig, ProjectConfig } from './config';
import type { CommentStore, StoredComment, ListFilter } from './store';
import { parseCommentPayload, toStoredShape, sniffImage } from './validate';

const MAX_JSON_BYTES = 64 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const LOCAL_PROJECT = 'local';
export const SERVER_VERSION = '0.1.0';

type Handler = (ctx: RequestContext) => Promise<void> | void;

interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  origin: string | null;
  ip: string;
}

/* ── small helpers ─────────────────────────────────────────────────────── */

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  if (res.headersSent) return;
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(payload);
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer | 'too-large'> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        resolve('too-large');
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!done) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function forLog(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80);
}

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i;

function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
      || hostname.endsWith('.localhost') || hostname.endsWith('.test');
  } catch {
    return false;
  }
}

function isLoopbackSocket(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/* ── rate limiting ─────────────────────────────────────────────────────── */

class RateLimiter {
  private buckets = new Map<string, { count: number; reset: number }>();
  constructor(private readonly limit: number, private readonly windowMs = 60_000) {}
  allow(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.reset <= now) {
      this.buckets.set(key, { count: 1, reset: now + this.windowMs });
      if (this.buckets.size > 10_000) this.sweep(now);
      return true;
    }
    bucket.count++;
    return bucket.count <= this.limit;
  }
  private sweep(now: number): void {
    for (const [k, b] of this.buckets) if (b.reset <= now) this.buckets.delete(k);
  }
}

/* ── the server ────────────────────────────────────────────────────────── */

export interface GrabbyHttpServer {
  server: Server;
  listen(): Promise<{ host: string; port: number }>;
  close(): Promise<void>;
}

export function createGrabbyServer(config: ServerConfig, store: CommentStore): GrabbyHttpServer {
  const writeLimit = new RateLimiter(60);
  const sessionLimit = new RateLimiter(30);
  const shotLimit = new RateLimiter(20);
  const readLimit = new RateLimiter(240);

  function projectForKey(key: string | undefined): ProjectConfig | null {
    if (!key) return null;
    return config.projects.find((p) => p.publicKey && safeEqual(p.publicKey, key)) ?? null;
  }

  function originAllowedAnywhere(origin: string): boolean {
    return config.projects.some((p) => p.allowedOrigins.includes(origin));
  }

  /** Origins that get CORS headers back. Nothing else can read responses. */
  function corsAllowed(origin: string | null): boolean {
    if (!origin) return false;
    if (originAllowedAnywhere(origin)) return true;
    return !config.public && isLoopbackOrigin(origin);
  }

  function hostAllowed(req: IncomingMessage): boolean {
    // A local server only answers to local host names. This is what stops
    // DNS rebinding: evil.example re-pointed at 127.0.0.1 still sends
    // "Host: evil.example".
    if (config.public) return true;
    return LOOPBACK_HOST.test(req.headers.host ?? '');
  }

  /** Which project a write belongs to, or why it's refused. */
  function authorizeWrite(ctx: RequestContext): { project: string } | { status: number; error: string } {
    const key = typeof ctx.req.headers['x-grabby-key'] === 'string' ? ctx.req.headers['x-grabby-key'] : undefined;
    const project = projectForKey(key);
    if (config.public) {
      if (!project) return { status: 401, error: 'Unknown or missing project key' };
      if (!ctx.origin || !project.allowedOrigins.includes(ctx.origin)) {
        return { status: 403, error: 'This site is not in the project\'s allowedOrigins' };
      }
      return { project: project.id };
    }
    if (ctx.origin && !isLoopbackOrigin(ctx.origin) && !originAllowedAnywhere(ctx.origin)) {
      return { status: 403, error: 'Origin not allowed' };
    }
    return { project: project?.id ?? LOCAL_PROJECT };
  }

  /** Reading needs the admin token, except from this machine to a local server. */
  function authorizeRead(ctx: RequestContext): boolean {
    const auth = ctx.req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (token && config.adminToken && safeEqual(token, config.adminToken)) return true;
    if (config.public) return false;
    return isLoopbackSocket(ctx.req) && (!ctx.origin || isLoopbackOrigin(ctx.origin));
  }

  function publicView(c: StoredComment) {
    const { screenshotFile: _file, ...rest } = c;
    void _file;
    return rest;
  }

  /* ── routes ──────────────────────────────────────────────────────────── */

  async function postComment(ctx: RequestContext): Promise<void> {
    if (!writeLimit.allow(ctx.ip)) return send(ctx.res, 429, { error: 'Too many requests' });
    const auth = authorizeWrite(ctx);
    if ('error' in auth) return send(ctx.res, auth.status, { error: auth.error });

    const raw = await readBody(ctx.req, MAX_JSON_BYTES);
    if (raw === 'too-large') return send(ctx.res, 413, { error: 'Payload too large' });
    let body: unknown;
    try { body = JSON.parse(raw.toString('utf8')); } catch { return send(ctx.res, 400, { error: 'Body must be JSON' }); }
    // The old webhook shape wraps the comment the same way; accept both.
    if (body && typeof body === 'object' && (body as { website?: unknown }).website) {
      return send(ctx.res, 202, { ok: true }); // honeypot field: a bot filled it in
    }
    const parsed = parseCommentPayload(body);
    if (!parsed.ok) return send(ctx.res, 400, { error: parsed.error });
    if (!sessionLimit.allow(parsed.comment.author.sessionId)) return send(ctx.res, 429, { error: 'Too many requests' });

    const stored: StoredComment = {
      ...toStoredShape(parsed.comment),
      status: 'open',
      screenshot: null,
      projectId: auth.project,
      receivedAt: Date.now(),
      origin: ctx.origin,
    };
    const result = await store.upsert(stored);
    if (result === 'forbidden') return send(ctx.res, 409, { error: 'A comment with this id already exists' });
    const who = stored.author.anonymous ? 'anonymous' : stored.author.name ?? 'anonymous';
    console.error(`[grabby] ${result === 'created' ? 'comment' : 'update'} from ${forLog(who)} on ${forLog(stored.page.route)}`);
    send(ctx.res, result === 'created' ? 201 : 200, { ok: true, id: stored.id });
  }

  async function putScreenshot(ctx: RequestContext): Promise<void> {
    if (!shotLimit.allow(ctx.ip)) return send(ctx.res, 429, { error: 'Too many requests' });
    const auth = authorizeWrite(ctx);
    if ('error' in auth) return send(ctx.res, auth.status, { error: auth.error });
    const comment = store.get(ctx.params.id);
    const session = ctx.req.headers['x-grabby-session'];
    // Only the browser session that wrote the comment may attach its image.
    if (!comment || comment.projectId !== auth.project || typeof session !== 'string' || !safeEqual(session, comment.author.sessionId)) {
      return send(ctx.res, 404, { error: 'No such comment' });
    }
    const raw = await readBody(ctx.req, MAX_IMAGE_BYTES);
    if (raw === 'too-large') return send(ctx.res, 413, { error: 'Screenshot too large (2 MB max)' });
    const image = sniffImage(raw);
    if (!image) return send(ctx.res, 415, { error: 'Screenshots must be WebP, PNG or JPEG' });
    const dim = (v: string | null) => Math.max(0, Math.min(10_000, Number.parseInt(v ?? '0', 10) || 0));
    await store.saveScreenshot(comment.id, raw, image.ext, dim(ctx.url.searchParams.get('w')), dim(ctx.url.searchParams.get('h')));
    send(ctx.res, 200, { ok: true });
  }

  function listFilter(url: URL): ListFilter {
    const raw = url.searchParams.get('status');
    const status: ListFilter['status'] = raw === 'resolved' || raw === 'all' ? raw : 'open';
    return {
      status,
      author: url.searchParams.get('author') ?? undefined,
      route: url.searchParams.get('route') ?? undefined,
      since: Number(url.searchParams.get('since')) || undefined,
      projectId: url.searchParams.get('project') ?? undefined,
      limit: Math.min(1000, Number(url.searchParams.get('limit')) || 500),
    };
  }

  const readRoute = (fn: Handler): Handler => async (ctx) => {
    if (!readLimit.allow(ctx.ip)) return send(ctx.res, 429, { error: 'Too many requests' });
    if (!authorizeRead(ctx)) return send(ctx.res, 401, { error: 'Admin token required' });
    await fn(ctx);
  };

  const routes: Array<{ method: string; pattern: RegExp; keys: string[]; handler: Handler }> = [];
  function route(method: string, path: string, handler: Handler): void {
    const keys: string[] = [];
    const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, k: string) => { keys.push(k); return '([A-Za-z0-9_-]{1,64})'; })}$`);
    routes.push({ method, pattern, keys, handler });
  }

  route('GET', '/health', (ctx) => send(ctx.res, 200, { ok: true, version: SERVER_VERSION, public: config.public }));
  route('POST', '/v1/comments', postComment);
  route('POST', '/grab', postComment);
  route('PUT', '/v1/comments/:id/screenshot', putScreenshot);

  route('GET', '/v1/comments', readRoute((ctx) => {
    send(ctx.res, 200, { comments: store.list(listFilter(ctx.url)).map(publicView) });
  }));
  route('GET', '/v1/comments/:id', readRoute((ctx) => {
    const c = store.get(ctx.params.id);
    if (!c) return send(ctx.res, 404, { error: 'No such comment' });
    send(ctx.res, 200, { comment: publicView(c) });
  }));
  route('PATCH', '/v1/comments/:id', readRoute(async (ctx) => {
    const raw = await readBody(ctx.req, 4096);
    let body: { status?: unknown } | null = null;
    try { body = raw === 'too-large' ? null : JSON.parse(raw.toString('utf8') || '{}'); } catch { body = null; }
    if (body?.status !== 'open' && body?.status !== 'resolved') return send(ctx.res, 400, { error: 'status must be "open" or "resolved"' });
    const n = await store.setStatus([ctx.params.id], body.status);
    send(ctx.res, n ? 200 : 404, n ? { ok: true } : { error: 'No such comment' });
  }));
  route('DELETE', '/v1/comments/:id', readRoute(async (ctx) => {
    const n = await store.remove([ctx.params.id]);
    send(ctx.res, n ? 200 : 404, n ? { ok: true } : { error: 'No such comment' });
  }));
  route('POST', '/v1/comments/bulk', readRoute(async (ctx) => {
    const raw = await readBody(ctx.req, MAX_JSON_BYTES);
    if (raw === 'too-large') return send(ctx.res, 413, { error: 'Payload too large' });
    let body: { ids?: unknown; action?: unknown };
    try { body = JSON.parse(raw.toString('utf8')); } catch { return send(ctx.res, 400, { error: 'Body must be JSON' }); }
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 1000) : [];
    if (body.action === 'resolve' || body.action === 'reopen') {
      return send(ctx.res, 200, { ok: true, changed: await store.setStatus(ids, body.action === 'resolve' ? 'resolved' : 'open') });
    }
    if (body.action === 'delete') return send(ctx.res, 200, { ok: true, changed: await store.remove(ids) });
    send(ctx.res, 400, { error: 'action must be resolve, reopen or delete' });
  }));
  route('GET', '/v1/screenshots/:id', readRoute(async (ctx) => {
    const c = store.get(ctx.params.id);
    const data = c ? await store.readScreenshot(c) : null;
    if (!c || !data) return send(ctx.res, 404, { error: 'No screenshot' });
    const image = sniffImage(data);
    ctx.res.writeHead(200, {
      'Content-Type': image?.type ?? 'application/octet-stream',
      'Content-Length': String(data.length),
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': 'inline',
    });
    ctx.res.end(data);
  }));
  route('GET', '/v1/export', readRoute((ctx) => {
    const level = (['compact', 'standard', 'detailed'] as const).find((l) => l === ctx.url.searchParams.get('level')) ?? 'standard';
    const list = store.list(listFilter(ctx.url));
    const text = formatExport(list, level as DetailLevel, { showIds: ctx.url.searchParams.get('ids') === '1' });
    send(ctx.res, 200, text || '# UI feedback · 0 comments', { 'Content-Type': 'text/markdown; charset=utf-8' });
  }));

  const server = createServer(async (req, res) => {
    // Nothing here is meant to be rendered or framed by a browser.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Vary', 'Origin');

    const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : null;
    const origin = originHeader && originHeader !== 'null' ? originHeader : null;
    if (corsAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin!);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Grabby-Key, X-Grabby-Session');
      res.setHeader('Access-Control-Max-Age', '600');
    }

    if (!hostAllowed(req)) return send(res, 421, { error: 'Unexpected Host header' });
    if (req.method === 'OPTIONS') {
      res.writeHead(corsAllowed(origin) ? 204 : 403);
      res.end();
      return;
    }

    let url: URL;
    try { url = new URL(req.url ?? '/', 'http://grabby.local'); } catch { return send(res, 400, { error: 'Bad URL' }); }

    const ip = req.socket.remoteAddress ?? 'unknown';
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.pattern.exec(url.pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
      try {
        await r.handler({ req, res, url, params, origin, ip });
      } catch (err) {
        console.error('[grabby] request failed:', forLog((err as Error).message));
        send(res, 500, { error: 'Internal server error' });
      }
      return;
    }
    send(res, 404, { error: 'Not found' });
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
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
