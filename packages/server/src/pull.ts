import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { formatExport, type DetailLevel } from '@githumbi/grabby/export';
import { LocalSource, type CommentSource, type SourceComment } from './source';

export interface PullOptions {
  level?: DetailLevel;
  format?: 'md' | 'json';
  /** After printing: mark comments resolved (default), leave them open, or delete them. */
  after?: 'resolve' | 'keep' | 'delete';
  /** Where to save screenshots; false to skip them. Default: ./.grabby/screenshots */
  screenshotsDir?: string | false;
  includeIds?: boolean;
}

export interface PullResult {
  text: string;
  count: number;
  screenshots: number;
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/**
 * Fetches open comments, points each one's screenshot at a file an agent can
 * open, and formats them the same way the browser's Copy all does. Then, by
 * default, resolves them so the next pull only shows new feedback.
 */
export async function pull(source: CommentSource, options: PullOptions = {}): Promise<PullResult> {
  const comments = await source.list({ status: 'open' });
  let screenshots = 0;

  const withShots: SourceComment[] = [];
  for (const c of comments) {
    if (!c.screenshot || options.screenshotsDir === false) {
      withShots.push({ ...c, screenshot: options.screenshotsDir === false ? null : c.screenshot });
      continue;
    }
    let file: string | null = null;
    if (source instanceof LocalSource) {
      file = source.screenshotPath(c.id);
    } else {
      const shot = await source.screenshot(c.id);
      if (shot) {
        const dir = path.resolve(options.screenshotsDir ?? path.join('.grabby', 'screenshots'));
        await mkdir(dir, { recursive: true });
        const abs = path.join(dir, `${c.id}.${EXT[shot.type] ?? 'webp'}`);
        await writeFile(abs, shot.data);
        file = path.relative(process.cwd(), abs) || abs;
      }
    }
    if (file) screenshots++;
    withShots.push({ ...c, screenshot: file ? { ...c.screenshot, url: file } : null });
  }

  const text = options.format === 'json'
    ? JSON.stringify(withShots, null, 2)
    : formatExport(withShots, options.level ?? 'standard', { showIds: options.includeIds });

  const ids = comments.map((c) => c.id);
  if (options.after === 'delete') await source.remove(ids);
  else if (options.after !== 'keep') await source.setStatus(ids, 'resolved');

  return { text, count: comments.length, screenshots };
}
