import type { ComponentResolver, SourceResolver, GrabbyTarget, SourceLocation, StackFrame } from '../types';
import { buildUniqueSelector } from '../utils';
import { detectKind } from './kind';
import { collectFacts } from './facts';
import { buildPreview, isNoiseClass } from './preview';

export interface CaptureDeps {
  componentResolver: ComponentResolver | null;
  sourceResolver: SourceResolver | null;
  /** Framework-specific class filter; the default drops Angular/Svelte scoping classes. */
  cleanClasses?: (classes: string[]) => string[];
}

const MAX_STACK = 3;

/** Frames from node_modules are library internals, not code the user can change. */
function isAppFile(file: string | null): file is string {
  return !!file && !/(^|[\\/])node_modules[\\/]/.test(file);
}

function resolveStack(el: Element, deps: CaptureDeps): { component: string | null; frames: StackFrame[] } {
  const comp = deps.componentResolver?.(el) ?? null;
  const frames: StackFrame[] = [];
  const named: StackFrame[] = [];
  for (const entry of comp?.stack ?? []) {
    const src = entry.hostElement && deps.sourceResolver ? deps.sourceResolver(entry.hostElement) : null;
    const frame: StackFrame = { name: entry.name, file: src?.filePath ?? null, line: src?.line ?? null };
    named.push(frame);
    if (isAppFile(frame.file) && frames.length < MAX_STACK) frames.push(frame);
  }
  // Without any source info, a couple of component names still help.
  return { component: comp?.name ?? null, frames: frames.length > 0 ? frames : named.slice(0, 2) };
}

function resolveSource(el: Element, deps: CaptureDeps, frames: StackFrame[]): SourceLocation | null {
  const own = deps.sourceResolver?.(el);
  if (own && isAppFile(own.filePath)) return { file: own.filePath, line: own.line, column: own.column };
  const first = frames.find((f) => isAppFile(f.file));
  return first?.file ? { file: first.file, line: first.line, column: null } : null;
}

/**
 * Builds the compact description of an element that a comment carries:
 * where it lives in the code, what kind of UI it is, and only the facts that
 * matter for that kind. Replaces capturing the element's full outerHTML.
 */
export function captureTarget(el: Element, deps: CaptureDeps): GrabbyTarget {
  const cleanClasses = deps.cleanClasses ?? ((list: string[]) => list.filter((c) => !isNoiseClass(c)));
  const kind = detectKind(el);
  const { component, frames } = resolveStack(el, deps);
  const source = resolveSource(el, deps, frames);
  const { facts, extra } = collectFacts(el, kind, deps.componentResolver);
  return {
    kind,
    tag: el.tagName.toLowerCase(),
    component,
    source,
    stack: frames,
    selector: buildUniqueSelector(el),
    preview: kind === 'section' ? `<${el.tagName.toLowerCase()}>` : buildPreview(el, cleanClasses),
    facts,
    extra,
  };
}
