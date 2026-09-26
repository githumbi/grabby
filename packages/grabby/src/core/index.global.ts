import { init } from './grab';
import type { GrabbyOptions, GrabbyAPI } from './types';

/*
 * The script-tag build. Configure it with data attributes:
 *
 *   <script src=".../grabby.global.js"
 *     data-mode="live" data-server="https://feedback.example.com"
 *     data-project-key="pk_…" data-identity="ask"></script>
 *
 * The API is available as window.grabby.
 */

function readOptions(script: HTMLScriptElement | null): Partial<GrabbyOptions> {
  const d = script?.dataset ?? {};
  const opts: Partial<GrabbyOptions> = {};
  if (d.mode === 'live' || d.mode === 'local') opts.mode = d.mode;
  if (d.server) opts.server = d.server;
  if (d.projectKey) opts.projectKey = d.projectKey;
  if (d.identity === 'ask' || d.identity === 'anonymous' || d.identity === 'none') opts.identity = d.identity;
  if (d.activationKey) opts.activationKey = d.activationKey;
  if (d.screenshots === 'false') opts.screenshots = false;
  if (d.webhookUrl) opts.webhookUrl = d.webhookUrl;
  if (d.styleNonce) opts.styleNonce = d.styleNonce;
  else if (script?.nonce) opts.styleNonce = script.nonce;
  return opts;
}

declare global {
  interface Window {
    grabby?: GrabbyAPI;
  }
}

const api = init(readOptions(document.currentScript as HTMLScriptElement | null));
window.grabby = api;

export default api;
