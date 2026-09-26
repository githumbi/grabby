import type { ComponentResolver, SourceResolver } from '../types';

/**
 * Teaches Grabby about one UI framework: how to name the component that owns
 * an element, and where that element was written. Adapters only read what the
 * framework already leaves on DOM nodes in development builds, so none of
 * them import the framework itself.
 */
export interface FrameworkAdapter {
  /** Shown in exports, e.g. "React", "Vue". */
  name: string;
  resolveComponent: ComponentResolver;
  resolveSource?: SourceResolver;
  /** Drops framework-generated classes (scoping hashes and the like). */
  cleanClasses?: (classes: string[]) => string[];
}

export type ComponentResult = NonNullable<ReturnType<ComponentResolver>>;
export type SourceResult = NonNullable<ReturnType<SourceResolver>>;

export const NO_SOURCE: SourceResult = { filePath: null, line: null, column: null };

/**
 * Dev servers often report absolute paths. Keep from the project's src/ (or
 * app/, lib/, pages/…) folder onwards, which is what an agent can open.
 */
export function relativizePath(file: string): string {
  const normalized = file.replace(/\\/g, '/').replace(/^file:\/\//, '').split('?')[0];
  if (!/^(\/|[A-Za-z]:\/)/.test(normalized)) return normalized;

  const src = normalized.lastIndexOf('/src/');
  if (src >= 0) {
    // In a monorepo keep the package folder: packages/web/src/App.vue
    const pkg = /\/((?:packages|apps|libs)\/[^/]+)$/.exec(normalized.slice(0, src));
    return `${pkg ? `${pkg[1]}/` : ''}${normalized.slice(src + 1)}`;
  }
  for (const marker of ['app', 'pages', 'components', 'routes', 'lib']) {
    const at = normalized.lastIndexOf(`/${marker}/`);
    if (at >= 0) return normalized.slice(at + 1);
  }
  return normalized.split('/').slice(-3).join('/');
}

export function baseName(file: string): string {
  const last = file.replace(/\\/g, '/').split('/').pop() ?? file;
  return last.replace(/\.(vue|svelte|[cm]?[jt]sx?)$/, '');
}
