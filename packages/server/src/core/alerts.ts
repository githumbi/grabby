import type { Storage } from './storage';
import type { StoredComment } from './types';

export interface AlertTargets {
  slack?: string | null;
  webhook?: string | null;
}

const PENDING = 'alerts.pending';
const LAST_SENT = 'alerts.lastSentAt';
/** A claim older than this was left by a request that died; take it over. */
const STALE_MS = 2 * 60_000;

/** Slack incoming webhooks only; anything else is a generic JSON webhook. */
export function isSlackWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'hooks.slack.com';
  } catch {
    return false;
  }
}

export function isHttpsUrl(url: string): boolean {
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}

/** Slack mrkdwn escaping; also defuses <!channel> and <@user> mentions. */
function slackEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function who(c: StoredComment): string {
  return !c.author.anonymous && c.author.name ? c.author.name : `Anonymous ${c.author.sessionId.replace(/-/g, '').slice(0, 4)}`;
}

export function slackMessage(comments: StoredComment[], inbox: string): { text: string } {
  const head = `*${comments.length} new Grabby comment${comments.length === 1 ? '' : 's'}* · <${inbox}|Open the inbox>`;
  const lines = comments.slice(0, 10).map((c) =>
    `• ${slackEscape(c.page.route)} · ${slackEscape(who(c))}: ${slackEscape(oneLine(c.comment, 140))} (<${inbox}#c=${c.id}|view>)`);
  if (comments.length > 10) lines.push(`…and ${comments.length - 10} more`);
  return { text: [head, ...lines].join('\n') };
}

export function webhookPayload(comments: StoredComment[], inbox: string) {
  return {
    type: 'grabby.comments',
    version: 1,
    count: comments.length,
    inboxUrl: inbox,
    comments: comments.slice(0, 50).map((c) => ({
      id: c.id,
      url: `${inbox}#c=${c.id}`,
      route: c.page.route,
      author: who(c),
      comment: oneLine(c.comment, 280),
      component: c.target.component,
      file: c.target.source?.file ?? null,
      line: c.target.source?.line ?? null,
    })),
  };
}

async function post(url: string, body: unknown, log: (m: string) => void): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    if (!res.ok) log(`[grabby] alert to ${new URL(url).host} failed: ${res.status}`);
    return res.ok;
  } catch (err) {
    log(`[grabby] alert to ${new URL(url).host} failed: ${(err as Error).message}`);
    return false;
  }
}

export async function sendAlerts(targets: AlertTargets, comments: StoredComment[], inbox: string, log: (m: string) => void): Promise<boolean> {
  const sends: Array<Promise<boolean>> = [];
  if (targets.slack && isSlackWebhook(targets.slack)) sends.push(post(targets.slack, slackMessage(comments, inbox), log));
  if (targets.webhook && isHttpsUrl(targets.webhook)) sends.push(post(targets.webhook, webhookPayload(comments, inbox), log));
  return (await Promise.all(sends)).some(Boolean);
}

/**
 * One message per burst: the first new comment claims a short wait, then
 * everything that arrived since the last alert goes out together. The claim
 * lives in storage so parallel requests (or Worker isolates) don't double up.
 */
export async function scheduleAlert(opts: {
  storage: Storage;
  targets: () => Promise<AlertTargets>;
  inbox: string;
  delayMs: number;
  waitUntil: (work: Promise<unknown>) => void;
  log: (m: string) => void;
}): Promise<void> {
  const targets = await opts.targets();
  if (!targets.slack && !targets.webhook) return;
  const now = Date.now();
  const current = await opts.storage.getSetting(PENDING);
  if (current && now - Number(current) < STALE_MS) return; // an alert is already on its way
  if (!(await opts.storage.claimSetting(PENDING, current, String(now)))) return;

  opts.waitUntil((async () => {
    try {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const last = Number(await opts.storage.getSetting(LAST_SENT)) || now - 5000;
      const fresh = (await opts.storage.list({ status: 'all', since: last + 1 })).filter((c) => c.receivedAt > last);
      if (fresh.length) {
        await sendAlerts(targets, fresh, opts.inbox, opts.log);
        await opts.storage.setSetting(LAST_SENT, String(Math.max(...fresh.map((c) => c.receivedAt))));
      }
    } finally {
      await opts.storage.setSetting(PENDING, null);
    }
  })());
}
