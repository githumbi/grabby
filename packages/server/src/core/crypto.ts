/*
 * Web Crypto only, so the same code runs in Node 20+ and Cloudflare Workers.
 */

const encoder = new TextEncoder();

/** Compares secrets without leaking how many leading characters match. */
export function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `${prefix}_` followed by `bytes` random bytes, base64url-encoded. */
export function randomToken(prefix: string, bytes: number): string {
  return `${prefix}_${base64url(crypto.getRandomValues(new Uint8Array(bytes)))}`;
}
