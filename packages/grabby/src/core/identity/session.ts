import type { CommentAuthor } from '../types';

const SESSION_KEY = 'grabby:v1:session';
const AUTHOR_KEY = 'grabby:v1:author';

/**
 * RFC 4122 v4 id. crypto.randomUUID only exists in secure contexts, and a dev
 * server opened over a LAN IP (http://192.168.x.x) isn't one.
 */
export function randomId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    try { return c.randomUUID(); } catch { /* insecure context */ }
  }
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let memorySession: string | null = null;

/** A random id that stays the same for this browser, so anonymous comments can be told apart. */
export function getSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = randomId();
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    memorySession ??= randomId();
    return memorySession;
  }
}

export interface StoredIdentity {
  name: string | null;
  anonymous: boolean;
}

/** The name (or anonymous choice) this browser last commented with, if any. */
export function loadIdentity(): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(AUTHOR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredIdentity;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.anonymous !== 'boolean') return null;
    return { name: typeof parsed.name === 'string' ? parsed.name.slice(0, 80) : null, anonymous: parsed.anonymous };
  } catch {
    return null;
  }
}

export function saveIdentity(identity: StoredIdentity): void {
  try { localStorage.setItem(AUTHOR_KEY, JSON.stringify(identity)); } catch { /* storage unavailable */ }
}

export function clearIdentity(): void {
  try { localStorage.removeItem(AUTHOR_KEY); } catch { /* ignore */ }
}

export function currentAuthor(identity: StoredIdentity | null): CommentAuthor {
  return {
    name: identity && !identity.anonymous ? identity.name : null,
    anonymous: !identity || identity.anonymous || !identity.name,
    sessionId: getSessionId(),
  };
}
