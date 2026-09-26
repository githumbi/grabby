import { z } from 'zod';
import type { GrabbyComment } from '@githumbi/grabby/export';

/*
 * Everything a browser sends is untrusted: anyone who can load the page can
 * post. Fields are capped, unknown fields are dropped, and the result is
 * rebuilt from scratch rather than stored as received.
 */

const MAX_COMMENT = 5000;
const MAX_TEXT = 300;
const MAX_PREVIEW = 400;
const MAX_SELECTOR = 500;
const MAX_FACTS = 16;
const MAX_STACK = 6;

const str = (max: number) => z.string().transform((s) => s.slice(0, max));
const nullableStr = (max: number) => z.string().nullable().optional().transform((s) => (s == null ? null : s.slice(0, max)));
const int = z.number().int().min(0).max(10_000_000).nullable().optional().transform((n) => n ?? null);

const factsSchema = z.record(z.string(), z.unknown()).optional().transform((facts) => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(facts ?? {}).slice(0, MAX_FACTS)) {
    if (typeof v === 'string' || typeof v === 'number') out[k.slice(0, 40)] = String(v).slice(0, MAX_TEXT);
  }
  return out;
});

const commentSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive().optional(),
  comment: z.string().trim().min(1).max(MAX_COMMENT),
  author: z.object({
    name: nullableStr(80),
    anonymous: z.boolean(),
    sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    userId: nullableStr(120),
  }),
  page: z.object({
    route: str(MAX_TEXT),
    title: str(200).optional().default(''),
    viewport: z.tuple([z.number().int().min(0).max(100_000), z.number().int().min(0).max(100_000)]),
  }),
  target: z.object({
    kind: z.enum(['action', 'field', 'text', 'media', 'container', 'section']),
    tag: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/i),
    component: nullableStr(120),
    source: z.object({ file: str(MAX_TEXT), line: int, column: int }).nullable().optional().transform((s) => s ?? null),
    stack: z.array(z.object({ name: str(120), file: nullableStr(MAX_TEXT), line: int })).optional().default([])
      .transform((s) => s.slice(0, MAX_STACK)),
    selector: str(MAX_SELECTOR),
    preview: str(MAX_PREVIEW),
    facts: factsSchema,
    extra: factsSchema,
  }),
  framework: str(40).optional().default('HTML'),
});

export const payloadSchema = z.object({ comment: commentSchema });

export type IncomingComment = z.infer<typeof commentSchema>;

export function parseCommentPayload(body: unknown):
  | { ok: true; comment: IncomingComment }
  | { ok: false; error: string } {
  const result = payloadSchema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: `Invalid comment: ${issue.path.join('.') || 'body'} ${issue.message}` };
  }
  return { ok: true, comment: result.data.comment };
}

/** Rebuilds a stored comment from validated input; the server owns status and screenshot. */
export function toStoredShape(c: IncomingComment): Omit<GrabbyComment, 'status' | 'screenshot'> {
  return {
    id: c.id,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt ?? c.createdAt,
    comment: c.comment,
    author: {
      name: c.author.anonymous ? null : c.author.name,
      anonymous: c.author.anonymous || !c.author.name,
      sessionId: c.author.sessionId,
      ...(c.author.userId ? { userId: c.author.userId } : {}),
    },
    page: { route: c.page.route, title: c.page.title, viewport: c.page.viewport },
    target: {
      kind: c.target.kind,
      tag: c.target.tag.toLowerCase(),
      component: c.target.component,
      source: c.target.source,
      stack: c.target.stack,
      selector: c.target.selector,
      preview: c.target.preview,
      facts: c.target.facts,
      extra: c.target.extra,
    },
    framework: c.framework,
  };
}

const IMAGE_SIGNATURES: Array<{ type: string; ext: string; test: (b: Buffer) => boolean }> = [
  { type: 'image/webp', ext: 'webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { type: 'image/png', ext: 'png', test: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a },
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
];

/** Identifies an image by its bytes, never by the Content-Type the client claims. */
export function sniffImage(buf: Buffer): { type: string; ext: string } | null {
  const match = IMAGE_SIGNATURES.find((s) => s.test(buf));
  return match ? { type: match.type, ext: match.ext } : null;
}
