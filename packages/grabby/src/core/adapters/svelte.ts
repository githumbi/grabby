import type { FrameworkAdapter, ComponentResult, SourceResult } from './types';
import { NO_SOURCE, relativizePath, baseName } from './types';

/*
 * Svelte dev builds attach `__svelte_meta` to every element they create:
 *   Svelte 4: { loc: { file, line, column, char } }        (0-based line)
 *   Svelte 5: { loc: { file, line, column }, parent: {...} } (1-based line)
 * Svelte 5's parent chain names the components the element sits inside.
 */

interface SvelteLoc { file?: string; line?: number; column?: number; char?: number }
interface SvelteParent { type?: string; componentTag?: string; file?: string; line?: number; column?: number; parent?: SvelteParent | null }
interface SvelteMeta { loc?: SvelteLoc; parent?: SvelteParent | null }

const MAX_STACK = 12;

function metaOf(el: Element): { meta: SvelteMeta; el: Element } | null {
  let current: Element | null = el;
  while (current) {
    const meta = (current as unknown as { __svelte_meta?: SvelteMeta }).__svelte_meta;
    if (meta?.loc) return { meta, el: current };
    current = current.parentElement;
  }
  return null;
}

/** Svelte 4 reports 0-based lines and has no `parent`; Svelte 5 is 1-based. */
function lineOf(meta: SvelteMeta): number | null {
  const line = meta.loc?.line;
  if (typeof line !== 'number') return null;
  return 'parent' in meta ? line : line + 1;
}

function resolveSvelteComponent(el: Element): ComponentResult | null {
  const found = metaOf(el);
  if (!found?.meta.loc?.file) return null;
  const { meta } = found;
  const own = baseName(meta.loc!.file!);
  const stack: NonNullable<ComponentResult['stack']> = [{ name: own, hostElement: found.el }];
  // Each parent entry is a component *usage*: `componentTag` is what was
  // rendered, `file`/`line` is where, so the file names the containing
  // component. The chain has locations but no DOM nodes.
  for (let p = meta.parent; p && stack.length < MAX_STACK; p = p.parent) {
    if (p.type !== 'component' || !p.file) continue;
    const container = baseName(p.file);
    if (container === stack[stack.length - 1].name) continue;
    stack.push({ name: container, hostElement: null, filePath: relativizePath(p.file), line: typeof p.line === 'number' ? p.line : null });
  }
  return { name: own, hostElement: found.el, stack };
}

function resolveSvelteSource(el: Element): SourceResult {
  const found = metaOf(el);
  const file = found?.meta.loc?.file;
  if (!found || !file) return NO_SOURCE;
  const column = found.meta.loc?.column;
  return {
    filePath: relativizePath(file),
    line: lineOf(found.meta),
    column: typeof column === 'number' ? column + 1 : null,
  };
}

export const svelteAdapter: FrameworkAdapter = {
  name: 'Svelte',
  resolveComponent: resolveSvelteComponent,
  resolveSource: resolveSvelteSource,
  // Scoping hashes: svelte-1x2y3z (Svelte 4) and s-XsEmFtvddWTw (Svelte 5).
  cleanClasses: (classes) => classes.filter((c) => !/^svelte-[a-z0-9]+$/i.test(c) && !/^s-[A-Za-z0-9_-]{8,}$/.test(c)),
};
