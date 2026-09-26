import type { HistoryEntry } from '../types';

export const STORAGE_KEY = 'grabby:v1:history';
const SCHEMA_VERSION = 1;

interface PersistedShape {
  v: number;
  entries: HistoryEntry[];
}

let pendingRaf: number | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingEntries: HistoryEntry[] | null = null;
let quotaWarned = false;

/** How long to wait for a frame that may never arrive before writing anyway. */
const FLUSH_FALLBACK_MS = 100;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedShape;
    if (!parsed || typeof parsed !== 'object' || parsed.v !== SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
      return [];
    }
    return parsed.entries;
  } catch {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  pendingEntries = entries;
  if (pendingRaf != null || pendingTimer != null) return;
  pendingRaf = requestAnimationFrame(flushPendingWrite);
  // A backgrounded or occluded tab gets no frames, and the grab would sit in
  // memory until the page went away. The timer guarantees the write lands.
  pendingTimer = setTimeout(flushPendingWrite, FLUSH_FALLBACK_MS);
}

export function flushPendingWrite(): void {
  if (pendingRaf != null) {
    cancelAnimationFrame(pendingRaf);
    pendingRaf = null;
  }
  if (pendingTimer != null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (pendingEntries == null) return;
  const entries = pendingEntries;
  pendingEntries = null;
  writeWithQuotaFallback(entries);
}

function writeWithQuotaFallback(entries: HistoryEntry[]): void {
  const payload: PersistedShape = { v: SCHEMA_VERSION, entries };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    if (isQuotaError(err)) {
      const half = entries.slice(0, Math.floor(entries.length / 2));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: SCHEMA_VERSION, entries: half }));
      } catch {
        warnQuotaOnce();
      }
    } else {
      warnQuotaOnce();
    }
  }
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number };
  return e.name === 'QuotaExceededError' || e.code === 22;
}

function warnQuotaOnce(): void {
  if (quotaWarned) return;
  quotaWarned = true;
  // eslint-disable-next-line no-console
  console.warn('[grabby] history localStorage write failed (quota or other error).');
}

export function clearPersistedHistory(): void {
  if (pendingRaf != null) {
    cancelAnimationFrame(pendingRaf);
    pendingRaf = null;
  }
  pendingEntries = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
