/**
 * Live sites keep Grabby hidden from ordinary visitors. It appears for
 * someone who opens a feedback link (https://site/?grabby=<projectKey>) and
 * stays for that browser tab until they exit feedback mode.
 */

export const LINK_PARAM = 'grabby';
const FLAG_KEY = 'grabby:v1:live';

function session(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

export function isFeedbackSession(): boolean {
  return session()?.getItem(FLAG_KEY) === '1';
}

export function startFeedbackSession(): void {
  try { session()?.setItem(FLAG_KEY, '1'); } catch { /* private mode: lasts for this page only */ }
}

export function endFeedbackSession(): void {
  try { session()?.removeItem(FLAG_KEY); } catch { /* ignore */ }
}

/**
 * Starts a feedback session if the URL carries a matching link, then removes
 * the parameter so it isn't shared by accident when the page is bookmarked
 * or copied. With no projectKey configured, any non-empty value works.
 */
export function consumeFeedbackLink(projectKey?: string): boolean {
  try {
    const url = new URL(window.location.href);
    const value = url.searchParams.get(LINK_PARAM);
    if (value !== null) {
      if (value && (!projectKey || value === projectKey)) startFeedbackSession();
      url.searchParams.delete(LINK_PARAM);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  } catch { /* unusual URL; nothing to consume */ }
  return isFeedbackSession();
}
