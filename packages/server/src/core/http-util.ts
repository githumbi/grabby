/** Headers every API response carries: nothing here is meant to be rendered or framed. */
export const API_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'Vary': 'Origin',
};

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function text(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers } });
}

/** How much of an oversized body is read (and thrown away) so the 413 still reaches the client. */
const DRAIN_MAX = 8 * 1024 * 1024;

/**
 * Reads a request body up to `limit` bytes. An oversized body is drained
 * rather than cancelled: on Node, cancelling destroys the socket and the
 * client sees a reset instead of the 413.
 */
export async function readLimited(req: Request, limit: number): Promise<Uint8Array | 'too-large'> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let over = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (over) {
      if (size > DRAIN_MAX) { await reader.cancel(); break; }
      continue;
    }
    if (size > limit) { over = true; chunks.length = 0; continue; }
    chunks.push(value);
  }
  if (over) return 'too-large';
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

export async function readJson(req: Request, limit: number): Promise<{ ok: true; body: unknown } | { ok: false; status: number; error: string }> {
  const raw = await readLimited(req, limit);
  if (raw === 'too-large') return { ok: false, status: 413, error: 'Payload too large' };
  try {
    const textBody = new TextDecoder().decode(raw);
    return { ok: true, body: textBody ? JSON.parse(textBody) : {} };
  } catch {
    return { ok: false, status: 400, error: 'Body must be JSON' };
  }
}

export function forLog(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80);
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
      || hostname.endsWith('.localhost') || hostname.endsWith('.test');
  } catch {
    return false;
  }
}

export const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i;

export class RateLimiter {
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
