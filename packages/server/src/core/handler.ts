import { formatExport, type DetailLevel } from '@githumbi/grabby/export';
import { trimTrailingSlashes, type CollectorConfig, type ProjectConfig } from './config';
import { randomToken, safeEqual, sha256Hex } from './crypto';
import { isHttpsUrl, isSlackWebhook, scheduleAlert, sendAlerts, type AlertTargets } from './alerts';
import { API_HEADERS, LOOPBACK_HOST, RateLimiter, forLog, isLoopbackOrigin, json, readJson, readLimited, text } from './http-util';
import type { Storage } from './storage';
import type { ListFilter, StoredComment } from './types';
import { parseCommentPayload, sniffImage, toStoredShape } from './validate';
import { SERVER_VERSION } from './version';

const MAX_JSON_BYTES = 64 * 1024;
const DEFAULT_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const LOCAL_PROJECT = 'local';

/** Who sent a request, as the runtime sees it. */
export interface Peer {
  ip: string;
  /** The TCP peer is this machine (never true on a hosted runtime). */
  loopback: boolean;
  /** The Host header. */
  host: string;
  /** scheme://host as the runtime saw it, when it knows (Workers do). */
  origin?: string;
  /** This request's own keep-alive for background work (a Worker's ctx.waitUntil). */
  waitUntil?: (work: Promise<unknown>) => void;
}

/** The inbox page, built by scripts/build-inbox.mjs. */
export interface InboxAssets {
  html: string;
  js: string;
  css: string;
  /** Content hash, so the assets can be cached forever. */
  hash: string;
}

export interface HandlerDeps {
  storage: Storage;
  /** Keeps background work (alerts) alive after the response; Workers pass ctx.waitUntil. */
  waitUntil?: (work: Promise<unknown>) => void;
  limits?: { maxImageBytes?: number };
  log?: (message: string) => void;
  /** Served at /inbox when present. */
  inbox?: InboxAssets;
  /** Alert targets from the environment; they win over ones saved through the API. */
  alerts?: AlertTargets;
  /** How long to gather a burst of comments into one alert. Default 20 s. */
  alertDelayMs?: number;
  /** This collector's public address, for links in alerts (default: from the Host header). */
  publicUrl?: string;
}

export type RequestHandler = (req: Request, peer: Peer) => Promise<Response>;

/** Who is reading: the admin token, the inbox token, or this machine talking to a local server. */
export type ReadRole = 'admin' | 'inbox' | 'local';

export interface RouteContext {
  req: Request;
  url: URL;
  params: Record<string, string>;
  origin: string | null;
  peer: Peer;
}

type Route = (ctx: RouteContext) => Promise<Response> | Response;

export function createHandler(config: CollectorConfig, deps: HandlerDeps): RequestHandler {
  const { storage } = deps;
  const log = deps.log ?? ((m: string) => console.error(m));
  const maxImageBytes = deps.limits?.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const writeLimit = new RateLimiter(60);
  const sessionLimit = new RateLimiter(30);
  const shotLimit = new RateLimiter(20);
  const readLimit = new RateLimiter(240);
  const fallbackWaitUntil = deps.waitUntil ?? ((work: Promise<unknown>) => { work.catch(() => {}); });

  /** Where this collector is reachable, for links in the inbox-token reply (an admin call). */
  function baseUrl(peer: Peer): string {
    if (deps.publicUrl) return trimTrailingSlashes(deps.publicUrl);
    if (peer.origin) return peer.origin;
    return `${config.public ? 'https' : 'http'}://${peer.host}`;
  }

  const PUBLIC_URL_SETTING = 'publicUrl';
  const HOST_SHAPE = /^[A-Za-z0-9.-]{1,253}(:\d{1,5})?$/;

  /**
   * The address alert links point at. Never the Host header of the request
   * that triggered the alert: anyone with the public key could forge it and
   * turn the owner's Slack link into a phishing link. Trusted sources only:
   * GRABBY_PUBLIC_URL, the runtime's own URL (Workers only get requests for
   * their real hostname), a local collector's checked loopback Host, or the
   * address recorded during an authenticated admin call.
   */
  async function alertBase(peer: Peer): Promise<string | null> {
    if (deps.publicUrl) return trimTrailingSlashes(deps.publicUrl);
    if (peer.origin) return peer.origin;
    if (!config.public) return `http://${peer.host}`;
    return storage.getSetting(PUBLIC_URL_SETTING);
  }

  async function alertTargets(): Promise<AlertTargets> {
    return {
      slack: deps.alerts?.slack || await storage.getSetting('alerts.slack'),
      webhook: deps.alerts?.webhook || await storage.getSetting('alerts.webhook'),
    };
  }

  function projectForKey(key: string | null): ProjectConfig | null {
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

  /** Which project a write belongs to, or why it's refused. */
  function authorizeWrite(ctx: RouteContext): { project: string } | { status: number; error: string } {
    const project = projectForKey(ctx.req.headers.get('x-grabby-key'));
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

  /** Reading needs the admin or inbox token, except from this machine to a local server. */
  async function authorizeRead(ctx: RouteContext): Promise<ReadRole | null> {
    const auth = ctx.req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (token && config.adminToken && safeEqual(token, config.adminToken)) return 'admin';
    if (token.startsWith('ik_')) {
      const hash = await storage.getSetting('inbox.tokenHash');
      if (hash && safeEqual(await sha256Hex(token), hash)) return 'inbox';
    }
    if (config.public) return null;
    return ctx.peer.loopback && (!ctx.origin || isLoopbackOrigin(ctx.origin)) ? 'local' : null;
  }

  function publicView(c: StoredComment) {
    const { screenshotFile: _file, ...rest } = c;
    void _file;
    return rest;
  }

  /* ── routes ──────────────────────────────────────────────────────────── */

  async function postComment(ctx: RouteContext): Promise<Response> {
    if (!writeLimit.allow(ctx.peer.ip)) return json(429, { error: 'Too many requests' });
    const auth = authorizeWrite(ctx);
    if ('error' in auth) return json(auth.status, { error: auth.error });

    const read = await readJson(ctx.req, MAX_JSON_BYTES);
    if (!read.ok) return json(read.status, { error: read.error });
    const body = read.body;
    if (body && typeof body === 'object' && (body as { website?: unknown }).website) {
      return json(202, { ok: true }); // honeypot field: a bot filled it in
    }
    const parsed = parseCommentPayload(body);
    if (!parsed.ok) return json(400, { error: parsed.error });
    if (!sessionLimit.allow(parsed.comment.author.sessionId)) return json(429, { error: 'Too many requests' });

    const stored: StoredComment = {
      ...toStoredShape(parsed.comment),
      status: 'open',
      screenshot: null,
      projectId: auth.project,
      receivedAt: Date.now(),
      origin: ctx.origin,
    };
    const result = await storage.upsert(stored);
    if (result === 'forbidden') return json(409, { error: 'A comment with this id already exists' });
    const who = stored.author.anonymous ? 'anonymous' : stored.author.name ?? 'anonymous';
    log(`[grabby] ${result === 'created' ? 'comment' : 'update'} from ${forLog(who)} on ${forLog(stored.page.route)}`);
    if (result === 'created') {
      const waitUntil = ctx.peer.waitUntil ?? fallbackWaitUntil;
      const base = await alertBase(ctx.peer);
      waitUntil(scheduleAlert({
        storage, targets: alertTargets, inbox: base ? `${base}/inbox` : null,
        delayMs: deps.alertDelayMs ?? 20_000, waitUntil, log,
      }).catch((err) => log(`[grabby] alert failed: ${forLog((err as Error).message)}`)));
    }
    return json(result === 'created' ? 201 : 200, { ok: true, id: stored.id });
  }

  async function putScreenshot(ctx: RouteContext): Promise<Response> {
    if (!shotLimit.allow(ctx.peer.ip)) return json(429, { error: 'Too many requests' });
    const auth = authorizeWrite(ctx);
    if ('error' in auth) return json(auth.status, { error: auth.error });
    const comment = await storage.get(ctx.params.id);
    const session = ctx.req.headers.get('x-grabby-session');
    // Only the browser session that wrote the comment may attach its image.
    if (!comment || comment.projectId !== auth.project || !session || !safeEqual(session, comment.author.sessionId)) {
      return json(404, { error: 'No such comment' });
    }
    const raw = await readLimited(ctx.req, maxImageBytes);
    if (raw === 'too-large') return json(413, { error: `Screenshot too large (${(maxImageBytes / 1024 / 1024).toFixed(1)} MB max)` });
    const image = sniffImage(raw);
    if (!image) return json(415, { error: 'Screenshots must be WebP, PNG or JPEG' });
    const dim = (v: string | null) => Math.max(0, Math.min(10_000, Number.parseInt(v ?? '0', 10) || 0));
    await storage.putScreenshot(comment.id, raw, { ...image, width: dim(ctx.url.searchParams.get('w')), height: dim(ctx.url.searchParams.get('h')) });
    return json(200, { ok: true });
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

  const readRoute = (fn: (ctx: RouteContext, role: ReadRole) => Promise<Response> | Response): Route => async (ctx) => {
    if (!readLimit.allow(ctx.peer.ip)) return json(429, { error: 'Too many requests' });
    const role = await authorizeRead(ctx);
    if (!role) return json(401, { error: 'Admin token required' });
    return fn(ctx, role);
  };

  /** Setup and settings: the admin token, or this machine on a local collector. Never the inbox token. */
  const adminRoute = (fn: (ctx: RouteContext) => Promise<Response> | Response): Route => readRoute((ctx, role) => (
    role === 'inbox' ? json(403, { error: 'The inbox link can\'t change settings' }) : fn(ctx)
  ));

  const routes: Array<{ method: string; pattern: RegExp; keys: string[]; handler: Route }> = [];
  function route(method: string, path: string, handler: Route): void {
    const keys: string[] = [];
    const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, k: string) => { keys.push(k); return '([A-Za-z0-9_-]{1,64})'; })}$`);
    routes.push({ method, pattern, keys, handler });
  }

  route('GET', '/health', () => json(200, { ok: true, version: SERVER_VERSION, public: config.public }));
  route('POST', '/v1/comments', postComment);
  route('POST', '/grab', postComment);
  route('PUT', '/v1/comments/:id/screenshot', putScreenshot);

  route('GET', '/v1/comments', readRoute(async (ctx) => (
    json(200, { comments: (await storage.list(listFilter(ctx.url))).map(publicView) })
  )));
  route('GET', '/v1/comments/:id', readRoute(async (ctx) => {
    const c = await storage.get(ctx.params.id);
    return c ? json(200, { comment: publicView(c) }) : json(404, { error: 'No such comment' });
  }));
  route('PATCH', '/v1/comments/:id', readRoute(async (ctx) => {
    const read = await readJson(ctx.req, 4096);
    const status = read.ok ? (read.body as { status?: unknown } | null)?.status : undefined;
    if (status !== 'open' && status !== 'resolved') return json(400, { error: 'status must be "open" or "resolved"' });
    const n = await storage.setStatus([ctx.params.id], status);
    return n ? json(200, { ok: true }) : json(404, { error: 'No such comment' });
  }));
  route('DELETE', '/v1/comments/:id', readRoute(async (ctx) => {
    const n = await storage.remove([ctx.params.id]);
    return n ? json(200, { ok: true }) : json(404, { error: 'No such comment' });
  }));
  route('POST', '/v1/comments/bulk', readRoute(async (ctx) => {
    const read = await readJson(ctx.req, MAX_JSON_BYTES);
    if (!read.ok) return json(read.status, { error: read.error });
    const body = (read.body ?? {}) as { ids?: unknown; action?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 1000) : [];
    if (body.action === 'resolve' || body.action === 'reopen') {
      return json(200, { ok: true, changed: await storage.setStatus(ids, body.action === 'resolve' ? 'resolved' : 'open') });
    }
    if (body.action === 'delete') return json(200, { ok: true, changed: await storage.remove(ids) });
    return json(400, { error: 'action must be resolve, reopen or delete' });
  }));
  route('GET', '/v1/screenshots/:id', readRoute(async (ctx) => {
    const data = await storage.getScreenshot(ctx.params.id);
    if (!data) return json(404, { error: 'No screenshot' });
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': sniffImage(data)?.type ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': 'inline',
      },
    });
  }));
  route('GET', '/v1/export', readRoute(async (ctx) => {
    const level = (['compact', 'standard', 'detailed'] as const).find((l) => l === ctx.url.searchParams.get('level')) ?? 'standard';
    const list = await storage.list(listFilter(ctx.url));
    const out = formatExport(list, level as DetailLevel, { showIds: ctx.url.searchParams.get('ids') === '1' });
    return text(200, out || '# UI feedback · 0 comments', { 'Content-Type': 'text/markdown; charset=utf-8' });
  }));

  route('GET', '/v1/meta', readRoute(async (_ctx, role) => {
    const targets = await alertTargets();
    return json(200, {
      version: SERVER_VERSION,
      public: config.public,
      role,
      projects: config.projects.map((p) => ({ id: p.id, name: p.name, publicKey: p.publicKey, allowedOrigins: p.allowedOrigins })),
      alerts: { slack: Boolean(targets.slack), webhook: Boolean(targets.webhook) },
    });
  }));

  /** A new private inbox link; the previous one stops working. */
  route('POST', '/v1/admin/inbox-token', adminRoute(async (ctx) => {
    const token = randomToken('ik', 24);
    await storage.setSetting('inbox.tokenHash', await sha256Hex(token));
    // An admin just reached us at this address; remember it for alert links.
    if (config.public && !deps.publicUrl && !ctx.peer.origin && HOST_SHAPE.test(ctx.peer.host)) {
      await storage.setSetting(PUBLIC_URL_SETTING, `https://${ctx.peer.host}`);
    }
    return json(200, { token, url: `${baseUrl(ctx.peer)}/inbox#k=${token}` });
  }));

  route('GET', '/v1/admin/alerts', adminRoute(async () => {
    const targets = await alertTargets();
    return json(200, { slack: targets.slack ?? null, webhook: targets.webhook ?? null, fromEnv: { slack: Boolean(deps.alerts?.slack), webhook: Boolean(deps.alerts?.webhook) } });
  }));
  route('PUT', '/v1/admin/alerts', adminRoute(async (ctx) => {
    const read = await readJson(ctx.req, 4096);
    if (!read.ok) return json(read.status, { error: read.error });
    const body = (read.body ?? {}) as { slack?: unknown; webhook?: unknown };
    if (body.slack !== undefined) {
      if (body.slack !== null && (typeof body.slack !== 'string' || !isSlackWebhook(body.slack))) {
        return json(400, { error: 'slack must be a https://hooks.slack.com/… incoming webhook URL, or null' });
      }
      await storage.setSetting('alerts.slack', body.slack);
    }
    if (body.webhook !== undefined) {
      if (body.webhook !== null && (typeof body.webhook !== 'string' || !isHttpsUrl(body.webhook))) {
        return json(400, { error: 'webhook must be an https:// URL, or null' });
      }
      await storage.setSetting('alerts.webhook', body.webhook);
    }
    return json(200, { ok: true });
  }));
  route('POST', '/v1/admin/alerts/test', adminRoute(async (ctx) => {
    const now = Date.now();
    const sample = {
      id: 'cmt_test_alert', createdAt: now, updatedAt: now, receivedAt: now, status: 'open', screenshot: null, projectId: 'test', origin: null,
      comment: 'This is a test alert from Grabby. New feedback will look like this.',
      author: { name: 'Grabby', anonymous: false, sessionId: 'test' },
      page: { route: '/', title: '', viewport: [0, 0] },
      target: { kind: 'action', tag: 'button', component: null, source: null, stack: [], selector: '', preview: '', facts: {}, extra: {} },
      framework: 'HTML',
    } as StoredComment;
    const base = await alertBase(ctx.peer);
    const sent = await sendAlerts(await alertTargets(), [sample], base ? `${base}/inbox` : null, log);
    return sent ? json(200, { ok: true }) : json(400, { error: 'No alert target is set, or it did not accept the message' });
  }));

  if (deps.inbox) {
    const inbox = deps.inbox;
    const INBOX_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    const page = (body: string, type: string, cache: string) => () => new Response(body, {
      status: 200,
      headers: { 'Content-Type': type, 'Cache-Control': cache, 'Content-Security-Policy': INBOX_CSP, 'X-Robots-Tag': 'noindex, nofollow' },
    });
    const immutable = 'public, max-age=31536000, immutable';
    const html = inbox.html.replace(/__HASH__/g, inbox.hash);
    route('GET', '/inbox', page(html, 'text/html; charset=utf-8', 'no-store'));
    route('GET', '/', () => new Response(null, { status: 302, headers: { Location: '/inbox' } }));
    routes.push(
      { method: 'GET', pattern: new RegExp(`^/inbox/app\\.${inbox.hash}\\.js$`), keys: [], handler: page(inbox.js, 'text/javascript; charset=utf-8', immutable) },
      { method: 'GET', pattern: new RegExp(`^/inbox/app\\.${inbox.hash}\\.css$`), keys: [], handler: page(inbox.css, 'text/css; charset=utf-8', immutable) },
    );
  }

  async function dispatch(req: Request, peer: Peer, origin: string | null): Promise<Response> {
    // A local server only answers to local host names. This is what stops
    // DNS rebinding: evil.example re-pointed at 127.0.0.1 still sends
    // "Host: evil.example".
    if (!config.public && !LOOPBACK_HOST.test(peer.host)) return json(421, { error: 'Unexpected Host header' });
    if (req.method === 'OPTIONS') return new Response(null, { status: corsAllowed(origin) ? 204 : 403 });

    let url: URL;
    try { url = new URL(req.url); } catch { return json(400, { error: 'Bad URL' }); }

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.pattern.exec(url.pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
      try {
        return await r.handler({ req, url, params, origin, peer });
      } catch (err) {
        log(`[grabby] request failed: ${forLog((err as Error).message)}`);
        return json(500, { error: 'Internal server error' });
      }
    }
    return json(404, { error: 'Not found' });
  }

  return async (req, peer) => {
    const originHeader = req.headers.get('origin');
    const origin = originHeader && originHeader !== 'null' ? originHeader : null;
    const res = await dispatch(req, peer, origin);
    for (const [k, v] of Object.entries(API_HEADERS)) if (!res.headers.has(k)) res.headers.set(k, v);
    if (corsAllowed(origin)) {
      res.headers.set('Access-Control-Allow-Origin', origin!);
      res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Grabby-Key, X-Grabby-Session');
      res.headers.set('Access-Control-Max-Age', '600');
    }
    return res;
  };
}
