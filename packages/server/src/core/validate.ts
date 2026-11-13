// zod/mini: same validation as the classic API, but tree-shakable, which keeps
// the Cloudflare Worker inside its size budget.
import * as z from 'zod/mini';
// Just English: z.locales.en() would bundle every language zod ships.
import { en } from 'zod/locales';
import type { GrabbyComment } from '@githumbi/grabby/export';

// Readable messages ("Too big: expected string to have <=5000 characters")
// instead of mini's bare "Invalid input".
z.config(en());

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

const ID = /^[A-Za-z0-9_-]{8,64}$/;

const str = (max: number) => z.pipe(z.string(), z.transform((s: string) => s.slice(0, max)));
const nullableStr = (max: number) => z.pipe(
  z.optional(z.nullable(z.string())),
  z.transform((s: string | null | undefined) => (s == null ? null : s.slice(0, max))),
);
const int = z.pipe(
  z.optional(z.nullable(z.int().check(z.minimum(0), z.maximum(10_000_000)))),
  z.transform((n: number | null | undefined) => n ?? null),
);
const coord = z.int().check(z.minimum(0), z.maximum(100_000));

const factsSchema = z.pipe(
  z.optional(z.record(z.string(), z.unknown())),
  z.transform((facts: Record<string, unknown> | undefined) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(facts ?? {}).slice(0, MAX_FACTS)) {
      if (typeof v === 'string' || typeof v === 'number') out[k.slice(0, 40)] = String(v).slice(0, MAX_TEXT);
    }
    return out;
  }),
);

const stackEntry = z.object({ name: str(120), file: nullableStr(MAX_TEXT), line: int });

const commentSchema = z.object({
  id: z.string().check(z.regex(ID)),
  createdAt: z.int().check(z.positive()),
  updatedAt: z.optional(z.int().check(z.positive())),
  comment: z.string().check(z.trim(), z.minLength(1), z.maxLength(MAX_COMMENT)),
  author: z.object({
    name: nullableStr(80),
    anonymous: z.boolean(),
    sessionId: z.string().check(z.regex(ID)),
    userId: nullableStr(120),
  }),
  page: z.object({
    route: str(MAX_TEXT),
    title: z._default(z.optional(str(200)), ''),
    viewport: z.tuple([coord, coord]),
  }),
  target: z.object({
    kind: z.enum(['action', 'field', 'text', 'media', 'container', 'section']),
    tag: z.string().check(z.regex(/^[a-z][a-z0-9-]{0,40}$/i)),
    component: nullableStr(120),
    source: z.pipe(
      z.optional(z.nullable(z.object({ file: str(MAX_TEXT), line: int, column: int }))),
      z.transform((s: { file: string; line: number | null; column: number | null } | null | undefined) => s ?? null),
    ),
    stack: z.pipe(
      z._default(z.optional(z.array(stackEntry)), []),
      z.transform((s: Array<z.output<typeof stackEntry>>) => s.slice(0, MAX_STACK)),
    ),
    selector: str(MAX_SELECTOR),
    preview: str(MAX_PREVIEW),
    facts: factsSchema,
    extra: factsSchema,
  }),
  framework: z._default(z.optional(str(40)), 'HTML'),
});

export const payloadSchema = z.object({ comment: commentSchema });

export type IncomingComment = z.output<typeof commentSchema>;

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

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

const IMAGE_SIGNATURES: Array<{ type: string; ext: string; test: (b: Uint8Array) => boolean }> = [
  { type: 'image/webp', ext: 'webp', test: (b) => b.length > 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  { type: 'image/png', ext: 'png', test: (b) => b.length > 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a },
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
];

/** Identifies an image by its bytes, never by the Content-Type the client claims. */
export function sniffImage(bytes: Uint8Array): { type: string; ext: string } | null {
  const match = IMAGE_SIGNATURES.find((s) => s.test(bytes));
  return match ? { type: match.type, ext: match.ext } : null;
}
