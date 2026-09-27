import type { GrabbyComment } from '../types';

export type SyncState = 'pending' | 'sent' | 'failed';

export interface OutboxDeps {
  server: string;
  projectKey?: string;
  getComment(id: string): GrabbyComment | undefined;
  getScreenshot(localId: string): Promise<Blob | null>;
  onState(id: string, state: SyncState, detail?: string): void;
}

export interface Outbox {
  /** Queue a comment (and later its screenshot) for delivery. */
  send(id: string): void;
  /** Queue just the screenshot, for when it's captured after the comment was sent. */
  sendScreenshot(id: string): void;
  /** Still has work for this comment (the comment itself or its screenshot). */
  isQueued(id: string): boolean;
  /** Retry everything queued now instead of waiting out the backoff. */
  flush(): void;
  /** The page is going away: one last try that outlives the tab. */
  flushOnExit(): void;
  dispose(): void;
}

interface Job {
  id: string;
  kind: 'comment' | 'shot';
  attempts: number;
  next: number;
  /** When the job was first queued; retries stop GIVE_UP_AFTER_MS later. */
  created: number;
}

const STORE_KEY = 'grabby:v1:outbox';
/** 2s, 10s, 30s, 2m, 5m, then every 10m. */
const BACKOFF = [2_000, 10_000, 30_000, 120_000, 300_000, 600_000];
/**
 * Keep retrying for two weeks, so a collector that's down for a weekend (or
 * a laptop collector that's asleep) doesn't cost anyone their feedback.
 */
const GIVE_UP_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
/** Browsers cap keepalive bodies at 64 KB in total; stay under it. */
const KEEPALIVE_MAX = 60_000;

function loadJobs(): Job[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const jobs = raw ? (JSON.parse(raw) as Job[]) : [];
    if (!Array.isArray(jobs)) return [];
    return jobs
      .filter((j) => typeof j.id === 'string' && (j.kind === 'comment' || j.kind === 'shot'))
      // Queues saved before `created` existed start their two weeks now.
      .map((j) => (typeof j.created === 'number' ? j : { ...j, created: Date.now() }));
  } catch {
    return [];
  }
}

/** Loop, not /\/+$/, which backtracks badly on long runs of slashes. */
function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}

/**
 * Comments are saved in the browser first and delivered from here, so a
 * flaky connection or a server restart never costs anyone their feedback.
 * The queue survives reloads, retries with backoff, and wakes up when the
 * browser comes back online.
 */
export function createOutbox(deps: OutboxDeps): Outbox {
  const base = trimTrailingSlashes(deps.server);
  // A new page is a fresh chance: retry restored jobs right away.
  let jobs = loadJobs().map((j) => ({ ...j, next: 0 }));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let disposed = false;

  function save(): void {
    try {
      if (jobs.length) localStorage.setItem(STORE_KEY, JSON.stringify(jobs));
      else localStorage.removeItem(STORE_KEY);
    } catch { /* storage unavailable; the in-memory queue still works */ }
  }

  function headers(extra: Record<string, string> = {}): Record<string, string> {
    return { ...(deps.projectKey ? { 'X-Grabby-Key': deps.projectKey } : {}), ...extra };
  }

  function add(id: string, kind: Job['kind']): void {
    if (jobs.some((j) => j.id === id && j.kind === kind)) return;
    jobs.push({ id, kind, attempts: 0, next: 0, created: Date.now() });
    save();
    schedule(0);
  }

  function schedule(delay: number): void {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void run(); }, delay);
  }

  /** Strips what only makes sense in this browser before it leaves. */
  function wireShape(c: GrabbyComment) {
    const { screenshot: _shot, sync: _sync, ...rest } = c as GrabbyComment & { sync?: unknown };
    void _shot; void _sync;
    return rest;
  }

  function postComment(comment: GrabbyComment): Promise<Response> {
    const body = JSON.stringify({ comment: wireShape(comment) });
    return fetch(`${base}/v1/comments`, {
      method: 'POST',
      credentials: 'omit',
      // keepalive lets a send that's under way finish after the tab closes.
      keepalive: body.length < KEEPALIVE_MAX,
      headers: headers({ 'Content-Type': 'application/json' }),
      body,
    });
  }

  async function deliver(job: Job): Promise<'done' | 'retry' | 'drop'> {
    const comment = deps.getComment(job.id);
    if (!comment) return 'drop'; // deleted before it was sent

    if (job.kind === 'comment') {
      const res = await postComment(comment);
      if (res.ok) {
        // Re-read: the screenshot often finishes rendering while the POST is
        // in flight, and sendScreenshot() skips while this job is queued.
        if (deps.getComment(job.id)?.screenshot?.localId) add(job.id, 'shot');
        return 'done';
      }
      if (res.status === 429 || res.status >= 500) return 'retry';
      deps.onState(job.id, 'failed', await res.text().catch(() => String(res.status)));
      return 'drop';
    }

    const localId = comment.screenshot?.localId;
    const blob = localId ? await deps.getScreenshot(localId) : null;
    if (!blob) return 'drop';
    const { width, height } = comment.screenshot!;
    const res = await fetch(`${base}/v1/comments/${encodeURIComponent(job.id)}/screenshot?w=${width}&h=${height}`, {
      method: 'PUT',
      credentials: 'omit',
      keepalive: blob.size < KEEPALIVE_MAX,
      headers: headers({ 'Content-Type': blob.type || 'image/webp', 'X-Grabby-Session': comment.author.sessionId }),
      body: blob,
    });
    if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) return res.ok ? 'done' : 'drop';
    return 'retry';
  }

  async function run(): Promise<void> {
    if (running || disposed) return;
    running = true;
    try {
      const now = Date.now();
      for (const job of [...jobs].sort((a, b) => a.next - b.next)) {
        if (job.next > now) continue;
        let outcome: 'done' | 'retry' | 'drop';
        try {
          outcome = await deliver(job);
        } catch {
          outcome = 'retry'; // offline, DNS, CORS misconfiguration…
        }
        if (outcome === 'retry' && Date.now() - job.created < GIVE_UP_AFTER_MS) {
          job.attempts += 1;
          job.next = Date.now() + BACKOFF[Math.min(job.attempts - 1, BACKOFF.length - 1)];
          if (job.kind === 'comment') deps.onState(job.id, 'pending');
        } else {
          jobs = jobs.filter((j) => j !== job);
          if (job.kind === 'comment' && outcome === 'done') deps.onState(job.id, 'sent');
          if (job.kind === 'comment' && outcome === 'retry') deps.onState(job.id, 'failed', 'could not reach the feedback server for 14 days');
        }
        save();
      }
    } finally {
      running = false;
    }
    const soonest = jobs.reduce((min, j) => Math.min(min, j.next), Infinity);
    if (soonest !== Infinity) schedule(Math.max(0, soonest - Date.now()));
  }

  const onOnline = () => {
    for (const j of jobs) j.next = 0;
    schedule(0);
  };
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
  if (jobs.length) schedule(500);

  return {
    send: (id) => add(id, 'comment'),
    sendScreenshot: (id) => {
      // If the comment itself is still queued, it will queue its screenshot.
      if (!jobs.some((j) => j.id === id && j.kind === 'comment')) add(id, 'shot');
    },
    isQueued: (id) => jobs.some((j) => j.id === id),
    flush: onOnline,
    flushOnExit() {
      // Jobs stay queued: if these don't land, the next visit sends them. A
      // repeat from the same session is an edit on the server, not a duplicate.
      for (const job of jobs) {
        if (job.kind !== 'comment') continue;
        const comment = deps.getComment(job.id);
        if (comment) postComment(comment).catch(() => {});
      }
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
    },
  };
}
