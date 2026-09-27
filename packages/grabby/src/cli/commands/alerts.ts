import { sharedConfig } from './inbox';

export interface AlertOptions {
  cwd?: string;
  slack?: string;
  webhook?: string;
  off?: boolean;
  test?: boolean;
}

/** Turns new-feedback alerts on or off on the project's collector. */
export async function alerts(options: AlertOptions): Promise<void> {
  const { server, adminToken } = sharedConfig(options.cwd);
  if (!adminToken) throw new Error('no admin token saved for this project. Run: npx @githumbi/grabby share --rotate-admin');
  const call = (path: string, init: RequestInit = {}) => fetch(`${server}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${adminToken}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const say = (m: string) => console.log(`\x1b[36m[grabby]\x1b[0m ${m}`);

  const body: Record<string, string | null> = {};
  if (options.off) Object.assign(body, { slack: null, webhook: null });
  if (options.slack) body.slack = options.slack;
  if (options.webhook) body.webhook = options.webhook;
  if (Object.keys(body).length) {
    const res = await call('/v1/admin/alerts', { method: 'PUT', body: JSON.stringify(body) });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `the collector answered ${res.status}`);
    say(options.off ? 'Alerts are off.' : 'Alerts are on. New feedback is posted within about 20 seconds, one message per burst.');
  }
  if (options.test) {
    const res = await call('/v1/admin/alerts/test', { method: 'POST' });
    say(res.ok ? 'Sent a test alert.' : 'The test alert did not go through: is an alert set?');
  }
  if (!Object.keys(body).length && !options.test) {
    const res = await call('/v1/admin/alerts');
    const current = await res.json() as { slack: string | null; webhook: string | null };
    say(`Slack: ${current.slack ? 'on' : 'off'} · webhook: ${current.webhook ? 'on' : 'off'}`);
    say('Set one with: npx @githumbi/grabby alerts --slack https://hooks.slack.com/services/…');
  }
}
