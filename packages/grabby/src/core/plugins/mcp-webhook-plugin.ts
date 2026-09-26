import type { Plugin, GrabbyComment } from '../types';

export const DEFAULT_WEBHOOK_URL = 'http://localhost:3456/grab';

/** https anywhere, or plain http only to this machine. */
export function isAllowedWebhookUrl(raw: string): boolean {
  try {
    const url = new URL(raw, typeof location !== 'undefined' ? location.href : undefined);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * POSTs each saved comment, one per request, as JSON. Credentials are never
 * sent: a same-origin webhook would otherwise receive the page's cookies.
 */
export function createMcpWebhookPlugin(url: string = DEFAULT_WEBHOOK_URL): Plugin {
  if (!isAllowedWebhookUrl(url)) {
    // eslint-disable-next-line no-console
    console.warn(`[grabby] webhookUrl must be https:// or http://localhost; ignoring "${url}".`);
    return { name: 'mcp-webhook' };
  }
  return {
    name: 'mcp-webhook',
    hooks: {
      onComment(comment: GrabbyComment) {
        fetch(url, {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'grabby.comment',
            version: 1,
            origin: typeof location !== 'undefined' ? location.origin : null,
            comment,
          }),
        }).catch(() => {});
      },
    },
  };
}
