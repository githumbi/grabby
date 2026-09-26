/**
 * Scrubs things that look like secrets or personal data out of captured text
 * before it's stored, copied or sent. It's a safety net for page content that
 * ends up in labels and previews; form values are never captured at all.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
// 9+ digits, allowing the spaces and dashes of card and account numbers.
const LONG_NUMBER = /\b\d(?:[ -]?\d){8,}\b/g;
// Long unbroken hex/base64 runs are almost always keys, hashes or tokens.
const OPAQUE_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const SENSITIVE_PARAM = /([?&#](?:access_token|id_token|token|key|api_key|apikey|secret|password|pass|auth|code|session|sig|signature)=)[^&#\s]*/gi;

export interface RedactOptions {
  /**
   * Keep email addresses. Only for developer-written strings such as
   * placeholders ("you@company.com"), never for page content.
   */
  keepEmails?: boolean;
}

export function redact(text: string, options: RedactOptions = {}): string {
  if (!text) return text;
  const scrubbed = text
    .replace(SENSITIVE_PARAM, '$1[redacted]')
    .replace(JWT, '[token]')
    .replace(BEARER, '$1 [token]');
  return (options.keepEmails ? scrubbed : scrubbed.replace(EMAIL, '[email]'))
    .replace(LONG_NUMBER, '[number]')
    .replace(OPAQUE_TOKEN, (m) => (/\d/.test(m) && /[A-Za-z]/.test(m) ? '[token]' : m));
}

/**
 * Keeps the route and only the allowlisted query parameters. Hashes are kept
 * when they look like client routes (#/path) and dropped otherwise, since
 * OAuth flows put tokens there.
 */
export function sanitizeRoute(loc: { pathname: string; search: string; hash: string }, keepParams: string[] = []): string {
  let route = loc.pathname || '/';
  if (keepParams.length > 0 && loc.search) {
    const params = new URLSearchParams(loc.search);
    const kept = new URLSearchParams();
    for (const name of keepParams) {
      const value = params.get(name);
      if (value !== null) kept.set(name, value);
    }
    const qs = kept.toString();
    if (qs) route += `?${qs}`;
  }
  if (loc.hash.startsWith('#/')) route += loc.hash.split('?')[0];
  return redact(route);
}

/** A URL reduced to something safe to show: path only for same-origin, host + path otherwise. */
export function sanitizeUrl(raw: string, base: string = typeof location !== 'undefined' ? location.href : 'http://localhost/'): string {
  try {
    const url = new URL(raw, base);
    if (url.protocol === 'javascript:' || url.protocol === 'data:') return `${url.protocol}…`;
    const baseUrl = new URL(base);
    const path = url.pathname + (url.hash.startsWith('#/') ? url.hash : '');
    return redact(url.origin === baseUrl.origin ? path : `${url.host}${path}`);
  } catch {
    return redact(raw.split(/[?#]/)[0]);
  }
}
