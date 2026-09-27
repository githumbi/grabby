export interface ProjectConfig {
  id: string;
  name: string;
  /** Write-only key, safe to embed in a web page. */
  publicKey: string;
  /** Sites allowed to post comments, e.g. "https://example.com". */
  allowedOrigins: string[];
}

/** What the request handler needs, on any runtime. */
export interface CollectorConfig {
  /** Accept comments from other machines. Requires keys and an origin allowlist. */
  public: boolean;
  /** Secret for reading, resolving and deleting comments (CLI, MCP, inbox setup). */
  adminToken: string;
  projects: ProjectConfig[];
}

export type Env = Record<string, string | undefined>;

/** Loop, not /\/+$/, which backtracks badly on long runs of slashes. */
export function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}

export function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return trimTrailingSlashes(origin);
  }
}

export function parseOrigins(raw: string | undefined): string[] | null {
  if (!raw) return null;
  return raw.split(',').map((o) => o.trim()).filter(Boolean).map(normalizeOrigin);
}

export function envFlag(value: string | undefined): boolean | undefined {
  return value ? value === '1' || value === 'true' : undefined;
}

/**
 * Layers GRABBY_PUBLIC, GRABBY_ADMIN_TOKEN, GRABBY_PUBLIC_KEY and
 * GRABBY_ALLOWED_ORIGINS over a base config (from a file, or empty).
 */
export function configFromEnv(env: Env, base: Partial<CollectorConfig> = {}): CollectorConfig {
  const projects: ProjectConfig[] = (base.projects ?? []).map((p) => ({
    id: String(p.id),
    name: String(p.name ?? p.id),
    publicKey: String(p.publicKey),
    allowedOrigins: (p.allowedOrigins ?? []).map(normalizeOrigin),
  }));
  const envKey = env.GRABBY_PUBLIC_KEY;
  const envOrigins = parseOrigins(env.GRABBY_ALLOWED_ORIGINS);
  if (envKey || envOrigins) {
    const first = projects[0] ?? { id: 'default', name: 'default', publicKey: '', allowedOrigins: [] };
    if (envKey) first.publicKey = envKey;
    if (envOrigins) first.allowedOrigins = envOrigins;
    if (!projects[0]) projects.push(first);
  }
  return {
    public: envFlag(env.GRABBY_PUBLIC) ?? base.public ?? false,
    adminToken: env.GRABBY_ADMIN_TOKEN || base.adminToken || '',
    projects,
  };
}

/** Why a public server can't start with this config, or null when it can. */
export function publicConfigProblem(config: CollectorConfig): string | null {
  if (!config.adminToken || config.adminToken.length < 20) return 'an admin token (run `grabby-server init`, or set GRABBY_ADMIN_TOKEN)';
  if (config.projects.length === 0) return 'at least one project with a public key';
  for (const p of config.projects) {
    if (!p.publicKey || p.publicKey.length < 12) return `a public key for project "${p.id}"`;
    if (p.allowedOrigins.length === 0) return `allowedOrigins for project "${p.id}" (the sites allowed to send comments)`;
    if (p.allowedOrigins.includes('*')) return `a real origin list for project "${p.id}" ("*" is not allowed)`;
  }
  return null;
}
