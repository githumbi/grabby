import type { ElementContext, ComponentStackEntry, ComponentResolver, SourceResolver } from '../types';
import type { PluginRegistry } from '../plugins/plugin-registry';
import { generateSnippet } from './generate-snippet';
import { showToast, type ToastDetail } from '../overlay/toast';
import { filterAngularClasses } from '../utils';

export interface CopyDeps {
  getComponentResolver: () => ComponentResolver | null;
  getSourceResolver: () => SourceResolver | null;
  getMaxContextLines: () => number;
  pluginRegistry: PluginRegistry;
}

function buildSelector(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const classes = filterAngularClasses(el.classList)
    .map((c) => `.${c}`)
    .join('');
  return `${tag}${id}${classes}`;
}

function getCssClasses(el: Element): string[] {
  return filterAngularClasses(el.classList);
}

export function buildElementContext(
  element: Element,
  componentResolver: ComponentResolver | null,
  sourceResolver: SourceResolver | null,
): ElementContext {
  const compResult = componentResolver?.(element);
  const srcResult = sourceResolver?.(element);

  // Build component stack from resolver result
  const componentStack: ComponentStackEntry[] = [];
  if (compResult?.stack) {
    for (const entry of compResult.stack) {
      let filePath: string | null = null;
      let line: number | null = null;
      let column: number | null = null;

      if (entry.hostElement && sourceResolver) {
        const src = sourceResolver(entry.hostElement);
        if (src) {
          filePath = src.filePath;
          line = src.line;
          column = src.column;
        }
      }

      componentStack.push({ name: entry.name, filePath, line, column });
    }
  }

  return {
    element,
    html: element.outerHTML,
    componentName: compResult?.name ?? null,
    filePath: srcResult?.filePath ?? null,
    line: srcResult?.line ?? null,
    column: srcResult?.column ?? null,
    componentStack,
    selector: buildSelector(element),
    cssClasses: getCssClasses(element),
  };
}

export interface CopyResult {
  context: ElementContext;
  snippet: string;
}

export async function copyElement(element: Element, deps: CopyDeps): Promise<CopyResult | null> {
  const context = buildElementContext(
    element,
    deps.getComponentResolver(),
    deps.getSourceResolver(),
  );

  deps.pluginRegistry.callHook('onElementSelect', context);
  deps.pluginRegistry.callHook('onBeforeCopy', context);

  let snippet = generateSnippet(context, deps.getMaxContextLines());
  snippet = deps.pluginRegistry.callTransformHook(snippet, context);

  try {
    await navigator.clipboard.writeText(snippet);
    const detail: ToastDetail = {
      componentName: context.componentName,
      filePath: context.filePath,
      line: context.line,
      column: context.column,
      cssClasses: context.cssClasses,
    };
    showToast('Copied to clipboard', detail);
    deps.pluginRegistry.callHook('onCopySuccess', snippet, context, undefined);
    return { context, snippet };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    deps.pluginRegistry.callHook('onCopyError', error);
    return null;
  }
}
