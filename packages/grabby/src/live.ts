import type { GrabbyOptions, GrabbyAPI } from './core/types';
import { consumeFeedbackLink, startFeedbackSession } from './core/live/activation';

export interface LiveHandle {
  /** Start a feedback session and load Grabby, e.g. from your own "Give feedback" button. */
  show(): Promise<GrabbyAPI>;
  /** Resolves with the API once loaded, or null while the visitor isn't in a feedback session. */
  ready: Promise<GrabbyAPI | null>;
}

/**
 * Live mode for bundler users, without the weight: this entry is tiny and
 * imports the rest of Grabby only for visitors who opened a feedback link.
 *
 *   import { initGrabbyLive } from '@githumbi/grabby/live';
 *   initGrabbyLive({ server: 'https://feedback.example.com', projectKey: 'pk_…' });
 */
export function initGrabbyLive(options: Partial<GrabbyOptions> & { server: string }): LiveHandle {
  const opts: Partial<GrabbyOptions> = { ...options, mode: 'live' };
  let loaded: Promise<GrabbyAPI> | null = null;
  const load = () => (loaded ??= import('./core/index').then(({ init }) => init(opts)));

  let pending = false;
  try { pending = !!localStorage.getItem('grabby:v1:outbox'); } catch { /* ignore */ }

  const ready = consumeFeedbackLink(options.projectKey) || pending ? load() : Promise.resolve(null);
  return {
    ready,
    show: async () => {
      startFeedbackSession();
      const api = await load();
      api.show();
      return api;
    },
  };
}

export type { GrabbyOptions, GrabbyAPI };
